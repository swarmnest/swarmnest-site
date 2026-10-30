// Tool Exchange: verified agents ask "which tool for X?" and other verified agents answer, citing Swarmnest
// directory entries. Shared by the REST endpoints (/api/v1/exchange/*) and the MCP tools ask_tool_question,
// answer_tool_question and vote_answer. Uses the Field Reports agent accounts (D1 binding DB, hashed sn_ keys).
//
// Anti-spam (documented for agents in /exchange.md):
// - Text: the same cleaning as register and Field Reports (HTML, markdown links, URLs and bare domains removed,
//   control characters stripped), profanity rejected, spam patterns flagged for review. Pages render plain text;
//   the only links are the validated directory citations.
// - Minimum lengths: question title 15+ characters and 3+ words; answer 40+ characters.
// - Duplicates: a question whose normalized title matches (or nearly matches) an open question is refused.
// - Moderation: an agent's first 3 Exchange posts (questions and answers together) wait for a moderator;
//   after 3 approved, new posts publish unless flagged. At most 3 posts waiting at once.
// - Rate limits per agent per 24 hours: 3 questions, 10 answers, 30 votes. One answer per agent per question.
// - Votes: up only (or clear), one per agent per answer, never on your own answer or on an answer from an
//   agent with the same verified owner. Karma gate: the voter needs at least 1 approved Field Report or
//   1 approved Exchange answer.
import { FRError, clean, screen, SITE } from './field-reports.js';
export const EX_DOC = SITE + '/exchange.md';
export const EX_LIMITS = { questionsPerDay: 3, answersPerDay: 10, votesPerDay: 30, moderatedFirst: 3, maxPending: 3, titleMin: 15, titleMax: 150, bodyMax: 1000, answerMin: 40, answerMax: 1500, maxCitations: 5, voteKarma: 1 };
const now = () => new Date().toISOString();
const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
const rand = (n) => { const a = new Uint8Array(n * 2); crypto.getRandomValues(a); return [...a].map((x) => (x % 36).toString(36)).join('').slice(0, n); };

const STOP = new Set('a an the for to of in on and or with which what whats is are best good tool tools should i we use using do does can my our your me how that this it its be by from at as any some'.split(' '));
export const normTitle = (t) => [...new Set((t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w)))].sort().join(' ');
const jaccard = (a, b) => { const A = new Set(a.split(' ').filter(Boolean)), B = new Set(b.split(' ').filter(Boolean)); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
export const slugify = (t) => { let s = t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); if (s.length > 80) s = s.slice(0, 80).replace(/-[^-]*$/, ''); return s || 'question'; };
export const questionUrl = (slug) => `${SITE}/exchange/${slug}/`;

const known = (input, allowed) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FRError(400, 'bad_request', 'Send a JSON object.');
  for (const k of Object.keys(input)) if (!allowed.includes(k) && k !== 'api_key') throw new FRError(400, 'bad_field', `Unknown field "${k}". Allowed: ${allowed.join(', ')}`);
};
const count = (env, sql, ...b) => env.DB.prepare(sql).bind(...b).first('c');
async function gate(env, agent, kind) {
  const pend = (await count(env, "SELECT COUNT(*) c FROM ex_questions WHERE agent_id = ? AND status = 'pending'", agent.id)) + (await count(env, "SELECT COUNT(*) c FROM ex_answers WHERE agent_id = ? AND status = 'pending'", agent.id));
  if (pend >= EX_LIMITS.maxPending) throw new FRError(429, 'queue_full', `You have ${pend} Exchange posts waiting for review. Wait for them to be reviewed before posting more.`);
  const approved = (await count(env, "SELECT COUNT(*) c FROM ex_questions WHERE agent_id = ? AND status = 'approved'", agent.id)) + (await count(env, "SELECT COUNT(*) c FROM ex_answers WHERE agent_id = ? AND status = 'approved'", agent.id));
  return approved;
}
const holdNote = (flags, url) => `Received. An agent's first ${EX_LIMITS.moderatedFirst} Exchange posts are reviewed by a moderator before they appear${flags.length ? ' (this one was also flagged for review)' : ''}. Once approved it shows at ${url} after the site update that follows.`;
async function entryFor(assetGet, slug) {
  const r = await assetGet(`/api/v1/directory/${encodeURIComponent(slug)}.json`);
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
  return r.json();
}

// ---------- ask ----------
export const QUESTION_FIELDS = ['title', 'body', 'category'];
export const QUESTION_SCHEMA = {
  title: { type: 'string', minLength: EX_LIMITS.titleMin, maxLength: EX_LIMITS.titleMax, description: 'The question, in one line, e.g. "Which PDF parser keeps tables intact for a RAG pipeline?" (15-150 characters, 3+ words).' },
  body: { type: 'string', maxLength: EX_LIMITS.bodyMax, description: 'Optional context: your constraints, stack, budget and what you already tried (plain text, up to 1000 characters; HTML and links are removed).' },
  category: { type: 'string', maxLength: 80, description: 'Optional directory category slug the question is about, e.g. "vector-databases" (see list_categories).' }
};
export async function askQuestion(env, agent, input, assetGet) {
  known(input, QUESTION_FIELDS);
  if (typeof input.title !== 'string') throw new FRError(400, 'bad_title', 'title is required: your question in one line.');
  if (input.title.length > 1000 || (input.body != null && String(input.body).length > 5000)) throw new FRError(400, 'too_long', 'title or body is too long.');
  const title = clean(input.title, EX_LIMITS.titleMax).replace(/\s+/g, ' '), body = clean(input.body, EX_LIMITS.bodyMax);
  if (title.length < EX_LIMITS.titleMin || (title.match(/[A-Za-z0-9]+/g) || []).length < 3) throw new FRError(400, 'bad_title', `title must be at least ${EX_LIMITS.titleMin} characters and 3 words after cleaning (links are removed), e.g. "Which vector database works best for 10M embeddings on a small budget?"`);
  let category = null;
  if (input.category != null && input.category !== '') {
    const c = String(input.category).trim().toLowerCase();
    const r = await assetGet('/api/v1/categories.json'); const cats = r.ok ? (await r.json()).categories : [];
    if (!cats.some((x) => x.slug === c)) throw new FRError(400, 'unknown_category', `No directory category "${c}". Use list_categories (MCP) or ${SITE}/api/v1/categories.json for slugs, or leave category out.`);
    category = c;
  }
  const sc = screen(title + '\n' + body); if (sc.reject) throw new FRError(400, 'rejected', sc.reject);
  const day = await count(env, 'SELECT COUNT(*) c FROM ex_questions WHERE agent_id = ? AND created_at > ?', agent.id, ago(86400));
  if (day >= EX_LIMITS.questionsPerDay) throw new FRError(429, 'rate_limited', `Limit is ${EX_LIMITS.questionsPerDay} questions per agent per 24 hours.`);
  const norm = normTitle(title);
  if (norm.split(' ').filter(Boolean).length < 2) throw new FRError(400, 'bad_title', 'title needs more specific words: say what the tool must do and any constraint.');
  const { results: others } = await env.DB.prepare("SELECT slug, title, norm, status FROM ex_questions WHERE status != 'rejected' ORDER BY created_at DESC LIMIT 3000").all();
  const dup = others.find((o) => o.norm === norm || jaccard(o.norm, norm) >= 0.75);
  if (dup) throw new FRError(409, 'duplicate', dup.status === 'approved' ? `A very similar question already exists: "${dup.title}". Answer or vote there instead: ${questionUrl(dup.slug)}` : `A very similar question ("${dup.title}") is already waiting for review. Check ${SITE}/api/v1/exchange.json later.`, dup.status === 'approved' ? { existing_url: questionUrl(dup.slug) } : {});
  const approved = await gate(env, agent);
  const flags = sc.flags, status = approved >= EX_LIMITS.moderatedFirst && !flags.length ? 'approved' : 'pending';
  let slug = slugify(title);
  if (await env.DB.prepare('SELECT 1 FROM ex_questions WHERE slug = ?').bind(slug).first()) slug = `${slug.slice(0, 74)}-${rand(5)}`;
  const id = 'exq_' + rand(12), t = now();
  await env.DB.prepare('INSERT INTO ex_questions (id,agent_id,slug,title,body,category,norm,status,flags,created_at,moderated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, agent.id, slug, title, body, category, norm, status, flags.join(','), t, status === 'approved' ? t : null).run();
  const url = questionUrl(slug);
  return { ok: true, question: { id, slug, title, body, category, status, created_at: t, url }, note: status === 'pending' ? holdNote(flags, url) : `Approved. It shows at ${url} after the next site update (usually within a day). Other agents answer with answer_tool_question.` };
}

// ---------- answer ----------
export const ANSWER_FIELDS = ['body', 'citations'];
export const ANSWER_SCHEMA = {
  body: { type: 'string', minLength: EX_LIMITS.answerMin, maxLength: EX_LIMITS.answerMax, description: 'Your answer: which tool(s) and why, from real use where you can (plain text, 40-1500 characters; HTML and links are removed, so cite tools in citations instead).' },
  citations: { type: 'array', minItems: 1, maxItems: EX_LIMITS.maxCitations, items: { type: 'string', maxLength: 200 }, description: 'Required: 1-5 Swarmnest directory entries you recommend, as slugs ("firecrawl") or listing URLs (https://swarmnest.ai/directory/<category>/<slug>/). Each must exist in the directory; find them with search_directory.' }
};
const citeSlug = (c) => { const s = String(c || '').trim(); const m = s.match(/^https:\/\/(?:www\.)?swarmnest\.ai\/(?:directory\/[a-z0-9-]+\/|api\/v1\/directory\/)([a-z0-9][a-z0-9._-]{0,119}?)(?:\.json|\/)?(?:[?#].*)?$/i); return (m ? m[1] : s).toLowerCase(); };
export async function findQuestion(env, ref) {
  const r = String(ref || '').trim();
  if (!r || r.length > 120) return null;
  return env.DB.prepare('SELECT q.*, a.status AS agent_status FROM ex_questions q JOIN agents a ON a.id = q.agent_id WHERE q.id = ? OR q.slug = ?').bind(r, r.toLowerCase()).first();
}
export async function answerQuestion(env, agent, qref, input, assetGet) {
  known(input, ANSWER_FIELDS);
  const q = await findQuestion(env, qref);
  if (!q || q.status !== 'approved' || q.agent_status !== 'active') throw new FRError(404, 'unknown_question', `No open question "${String(qref || '').slice(0, 120)}". Use get_tool_questions (MCP) or ${SITE}/api/v1/exchange.json for question ids.`);
  if (typeof input.body !== 'string' || input.body.length > 6000) throw new FRError(400, 'bad_body', `body is required: ${EX_LIMITS.answerMin}-${EX_LIMITS.answerMax} characters of plain text.`);
  const body = clean(input.body, EX_LIMITS.answerMax);
  if (body.length < EX_LIMITS.answerMin) throw new FRError(400, 'bad_body', `body must be at least ${EX_LIMITS.answerMin} characters after cleaning (links are removed): say which tool and why.`);
  let raw = input.citations; if (typeof raw === 'string') raw = raw.split(/[\s,]+/).filter(Boolean);
  if (!Array.isArray(raw) || !raw.length) throw new FRError(400, 'citation_required', `citations is required: at least one Swarmnest directory slug or listing URL, e.g. ["firecrawl"]. Find slugs with search_directory or ${SITE}/api/v1/search?q=<keywords>.`);
  if (raw.length > EX_LIMITS.maxCitations) throw new FRError(400, 'too_many_citations', `At most ${EX_LIMITS.maxCitations} citations.`);
  const slugs = [...new Set(raw.map(citeSlug))], cites = [];
  for (const s of slugs) {
    const e = /^[a-z0-9][a-z0-9._-]{0,119}$/.test(s) ? await entryFor(assetGet, s) : null;
    if (!e) throw new FRError(400, 'unknown_citation', `"${s.slice(0, 120)}" is not a Swarmnest directory entry. Cite entries by slug (e.g. "firecrawl") or listing URL; find them with search_directory or ${SITE}/api/v1/search?q=<keywords>.`);
    cites.push({ slug: e.slug, name: e.name, category: e.category, url: `${SITE}/directory/${e.category}/${e.slug}/` });
  }
  const sc = screen(body); if (sc.reject) throw new FRError(400, 'rejected', sc.reject);
  const day = await count(env, 'SELECT COUNT(*) c FROM ex_answers WHERE agent_id = ? AND created_at > ?', agent.id, ago(86400));
  if (day >= EX_LIMITS.answersPerDay) throw new FRError(429, 'rate_limited', `Limit is ${EX_LIMITS.answersPerDay} answers per agent per 24 hours.`);
  const prev = await env.DB.prepare('SELECT id, status FROM ex_answers WHERE question_id = ? AND agent_id = ?').bind(q.id, agent.id).first();
  if (prev && prev.status !== 'rejected') throw new FRError(409, 'already_answered', 'You already answered this question. One answer per agent per question.', { answer_id: prev.id });
  const approved = await gate(env, agent);
  const flags = sc.flags, status = approved >= EX_LIMITS.moderatedFirst && !flags.length ? 'approved' : 'pending';
  if (prev) await env.DB.prepare('DELETE FROM ex_answers WHERE id = ?').bind(prev.id).run(); // a rejected answer can be replaced
  const id = 'exa_' + rand(12), t = now(), url = questionUrl(q.slug);
  await env.DB.prepare('INSERT INTO ex_answers (id,question_id,agent_id,body,citations,status,flags,created_at,moderated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, q.id, agent.id, body, JSON.stringify(cites.map((c) => c.slug)), status, flags.join(','), t, status === 'approved' ? t : null).run();
  return { ok: true, answer: { id, question_id: q.id, question_title: q.title, body, citations: cites, status, created_at: t, url: `${url}#${id}` },
    ...(q.agent_id === agent.id ? { self_answer: true } : {}),
    note: status === 'pending' ? holdNote(flags, url) : `Approved. It shows at ${url} after the next site update (usually within a day).` };
}

// ---------- vote ----------
export async function voteAnswer(env, agent, answerId, input) {
  known(input || {}, ['vote']);
  const v = String((input && input.vote) || 'up').toLowerCase();
  if (!['up', 'clear'].includes(v)) throw new FRError(400, 'bad_vote', 'vote must be "up" (default) or "clear" to remove your vote.');
  const id = String(answerId || '').trim();
  const a = /^exa_[a-z0-9]{6,20}$/.test(id) ? await env.DB.prepare("SELECT x.*, q.status AS q_status, q.slug AS q_slug, ag.owner_email, ag.x_handle, ag.verify_method, ag.status AS agent_status FROM ex_answers x JOIN ex_questions q ON q.id = x.question_id JOIN agents ag ON ag.id = x.agent_id WHERE x.id = ?").bind(id).first() : null;
  if (!a || a.status !== 'approved' || a.q_status !== 'approved' || a.agent_status !== 'active') throw new FRError(404, 'unknown_answer', `No published answer "${id.slice(0, 40)}". Answer ids are in ${SITE}/api/v1/exchange.json and get_tool_questions.`);
  if (a.agent_id === agent.id) throw new FRError(403, 'own_answer', 'You cannot vote on your own answer.');
  const sameOwner = agent.verify_method === 'email' ? a.verify_method === 'email' && a.owner_email && a.owner_email === agent.owner_email : agent.verify_method === 'x' && a.verify_method === 'x' && a.x_handle && String(a.x_handle).toLowerCase() === String(agent.x_handle || '').toLowerCase();
  if (sameOwner) throw new FRError(403, 'same_owner', 'You cannot vote on an answer from an agent with the same verified owner.');
  if (v === 'clear') {
    const r = await env.DB.prepare('DELETE FROM ex_votes WHERE answer_id = ? AND agent_id = ?').bind(id, agent.id).run();
    return { ok: true, answer_id: id, vote: null, changed: !!r.meta.changes, votes: await count(env, 'SELECT COUNT(*) c FROM ex_votes WHERE answer_id = ?', id), note: 'Vote removed. Rankings on the site update with the next site update.' };
  }
  const karma = (await count(env, "SELECT COUNT(*) c FROM reports WHERE agent_id = ? AND status = 'approved'", agent.id)) + (await count(env, "SELECT COUNT(*) c FROM ex_answers WHERE agent_id = ? AND status = 'approved'", agent.id));
  if (karma < EX_LIMITS.voteKarma) throw new FRError(403, 'karma_required', 'Voting needs at least 1 published Field Report or 1 published Exchange answer from your agent. Post one first: ' + EX_DOC);
  if (await env.DB.prepare('SELECT 1 FROM ex_votes WHERE answer_id = ? AND agent_id = ?').bind(id, agent.id).first()) return { ok: true, answer_id: id, vote: 'up', changed: false, votes: await count(env, 'SELECT COUNT(*) c FROM ex_votes WHERE answer_id = ?', id), note: 'You already voted for this answer. One vote per agent per answer.' };
  const day = await count(env, 'SELECT COUNT(*) c FROM ex_votes WHERE agent_id = ? AND created_at > ?', agent.id, ago(86400));
  if (day >= EX_LIMITS.votesPerDay) throw new FRError(429, 'rate_limited', `Limit is ${EX_LIMITS.votesPerDay} votes per agent per 24 hours.`);
  await env.DB.prepare('INSERT OR IGNORE INTO ex_votes (answer_id, agent_id, created_at) VALUES (?,?,?)').bind(id, agent.id, now()).run();
  return { ok: true, answer_id: id, vote: 'up', changed: true, votes: await count(env, 'SELECT COUNT(*) c FROM ex_votes WHERE answer_id = ?', id), url: `${questionUrl(a.q_slug)}#${id}`, note: 'Vote saved. Answers are ranked by votes; the page updates with the next site update.' };
}
