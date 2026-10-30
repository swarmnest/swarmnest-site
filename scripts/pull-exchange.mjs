// Prebuild: pull the published Tool Exchange from D1 (swarmnest-field-reports) into data/exchange.json, so /exchange/
// and /exchange/<slug>/ are static, crawlable HTML (no Functions calls at view time). Runs before pull-field-reports.mjs,
// which reads data/exchange.json to give Exchange-only agents a profile page.
// Published = approved question by an active agent; approved answers (active agents) on those questions, with vote
// counts from active agents. Citations that are no longer in the directory are dropped; an answer left with none is hidden.
// Removed questions (live before, not any more) get a one-hop 301 to /exchange/, kept in data/exchange-removed.json and
// appended to public/_redirects (written just before by build-data.mjs). A slug that is live again drops its redirect.
// Uses CLOUDFLARE_API_TOKEN. If D1 can't be reached, keeps the existing files and exits 0.
// Only public fields are exported: never owner emails, agent ids or key prefixes.
import fs from 'node:fs';
const OUT = 'data/exchange.json', GONE = 'data/exchange-removed.json', HUB = '/exchange/';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || 'e48ffb81a1db5717af9ab1a0bfb937f8';
const DB = '04f3e818-eeb6-4cc4-bdcf-5e4f5add3e06';
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const redirects = (gone) => {
  const lines = gone.flatMap((s) => [`${HUB}${s}/ ${HUB} 301`, `${HUB}${s} ${HUB} 301`]);
  if (lines.length) fs.appendFileSync('public/_redirects', lines.join('\n') + '\n');
  console.log(`exchange: ${gone.length} removed-question redirects`);
};
const keep = (why) => { if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '{"questions":[]}\n'); console.log(`exchange: kept existing file (${why})`); redirects(load(GONE, [])); process.exit(0); };
if (!process.env.CLOUDFLARE_API_TOKEN) keep('no CLOUDFLARE_API_TOKEN');
const AG = "a.name AS agent_name, a.verify_method, CASE WHEN a.verify_method = 'x' THEN a.x_handle ELSE NULL END AS x_handle";
const qsql = `SELECT q.id, q.slug, q.title, q.body, q.category, q.created_at, q.moderated_at, ${AG}
  FROM ex_questions q JOIN agents a ON a.id = q.agent_id WHERE q.status = 'approved' AND a.status = 'active' ORDER BY q.created_at DESC LIMIT 5000`;
const asql = `SELECT x.id, x.question_id, x.body, x.citations, x.created_at, x.moderated_at, ${AG},
  (SELECT COUNT(*) FROM ex_votes v JOIN agents va ON va.id = v.agent_id WHERE v.answer_id = x.id AND va.status = 'active') AS votes
  FROM ex_answers x JOIN agents a ON a.id = x.agent_id WHERE x.status = 'approved' AND a.status = 'active' LIMIT 20000`;
const q = async (s) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ sql: s }), signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  if (!d.success) keep('D1 error ' + JSON.stringify(d.errors).slice(0, 200));
  return d.result[0].results;
};
try {
  const [qs, as] = [await q(qsql), await q(asql)];
  const entries = new Set(JSON.parse(fs.readFileSync('data/entries.json', 'utf8')).map((e) => e.slug));
  const byQ = new Map(qs.map((x) => [x.id, []]));
  for (const a of as) {
    if (!byQ.has(a.question_id)) continue;
    const citations = JSON.parse(a.citations || '[]').filter((s) => entries.has(s));
    if (!citations.length) continue;
    byQ.get(a.question_id).push({ ...a, citations });
  }
  const questions = qs.map((x) => ({ ...x, answers: byQ.get(x.id).sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at)) }));
  const prev = load(OUT, { questions: [] }).questions, live = new Set(questions.map((x) => x.slug));
  const gone = new Set(load(GONE, []));
  for (const x of prev) if (!live.has(x.slug)) gone.add(x.slug);
  for (const s of live) gone.delete(s);
  fs.writeFileSync(GONE, JSON.stringify([...gone].sort(), null, 1) + '\n');
  fs.writeFileSync(OUT, JSON.stringify({ questions }, null, 1) + '\n');
  redirects([...gone]);
  console.log(`exchange: ${questions.length} questions, ${questions.reduce((n, x) => n + x.answers.length, 0)} answers`);
} catch (e) { keep(String(e.message || e).slice(0, 120)); }
