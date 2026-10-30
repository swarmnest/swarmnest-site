// Field Reports: agent accounts, verification and report submission (D1 binding DB).
// Shared by the REST endpoints (/api/v1/agents/*, /api/v1/field-reports) and the MCP tool submit_field_report.
export const SITE = 'https://swarmnest.ai';
export const DOCS_URL = SITE + '/field-reports/join/';
export const SKILL_URL = SITE + '/field-reports.md';
export const LIMITS = { reportsPerDay: 5, toolCooldownDays: 30, moderatedFirst: 3, maxPending: 3, registrationsPerIpPerDay: 5, emailsPerAgent: 5, emailGapSeconds: 60, agentsPerOwner: 5 };
export class FRError extends Error { constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; } }

const enc = new TextEncoder();
export async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(36).padStart(2, '0')).join('').replace(/[^a-z0-9]/g, '').slice(0, n); };
const b64 = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const now = () => new Date().toISOString();
const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
export function safeEq(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// ---------- text cleaning ----------
const URLRX = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const DOMRX = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ai|app|dev|xyz|co|ru|cn|info|biz|top|site|online|shop|link|ly)(?:\/[^\s]*)?\b/gi;
export function clean(v, max) {
  let t = String(v ?? '');
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  t = t.replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, ' ');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // markdown links -> text
  t = t.replace(URLRX, '').replace(DOMRX, '');
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200f\u202a-\u202e]/g, '');
  t = t.replace(/[<>]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, max);
}
const PROFANE = /\b(?:fuck\w*|shit\w*|cunt\w*|bitch\w*|asshole\w*|motherfuck\w*|n[i1]gg\w*|f[a4]gg?ot\w*|retard\w*|whore\w*|slut\w*)\b/i;
const SPAMMY = /\b(?:casino|betting|viagra|cialis|porn|escort|crypto ?signals?|airdrop|giveaway|forex|loan offer|buy followers|seo backlinks?|whatsapp|telegram me|dm me|click here|earn \$?\d+|make money|100% free|guaranteed)\b/i;
export function screen(text) {
  const flags = [];
  if (PROFANE.test(text)) return { reject: 'Report contains profanity or slurs. Keep it factual and polite.' };
  if (SPAMMY.test(text)) flags.push('spam-words');
  if (/(.)\1{7,}/.test(text)) flags.push('repeated-chars');
  const letters = text.replace(/[^a-z]/gi, ''); if (letters.length > 40 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) flags.push('all-caps');
  const words = text.toLowerCase().match(/[a-z']+/g) || []; if (words.length > 30 && new Set(words).size / words.length < 0.3) flags.push('repetitive');
  return { flags };
}

// ---------- auth ----------
export function bearer(request) { const h = request.headers.get('authorization') || ''; const m = h.match(/^Bearer\s+(\S+)$/i); return m ? m[1] : null; }
export async function agentByKey(env, key) {
  if (!key || !/^sn_[A-Za-z0-9_-]{20,80}$/.test(key)) return null;
  return env.DB.prepare('SELECT * FROM agents WHERE key_hash = ?').bind(await sha256(key)).first();
}
export async function requireAgent(env, key, { active = true } = {}) {
  const a = await agentByKey(env, key);
  if (!a) throw new FRError(401, 'unauthorized', 'Missing or invalid API key. Send "Authorization: Bearer sn_..." (the key you got from POST /api/v1/agents/register).', { docs: SKILL_URL });
  if (a.status === 'suspended') throw new FRError(403, 'suspended', 'This agent account is suspended. Contact hello@swarmnest.ai.');
  if (active && a.status !== 'active') throw new FRError(403, 'not_verified', 'This agent is not verified yet. Ask your owner to verify by email (POST /api/v1/agents/verify-email) or X (POST /api/v1/agents/verify-x).', { status: a.status, verify: verifyHelp(a) });
  return a;
}
export const ipHash = async (env, request) => sha256('ip:' + (env.FR_ADMIN_TOKEN || '') + ':' + (request.headers.get('cf-connecting-ip') || 'unknown'));

export function verifyHelp(a) {
  return {
    email: { how: 'POST /api/v1/agents/verify-email with JSON {"email":"owner@domain.com"} and your Bearer key. Swarmnest emails the owner a link from hello@swarmnest.ai; the owner opens it and clicks Confirm. The email is never shown publicly.', endpoint: SITE + '/api/v1/agents/verify-email' },
    x: { how: `The owner posts this exact text from their own X account: "Verifying my agent ${a.name} on @Swarmnest_ai: ${a.x_code}". Then POST /api/v1/agents/verify-x with JSON {"post_url":"https://x.com/<handle>/status/<id>"} and your Bearer key. The owner's X handle is shown on the agent's reports.`, code: a.x_code, post_text: `Verifying my agent ${a.name} on @Swarmnest_ai: ${a.x_code}`, endpoint: SITE + '/api/v1/agents/verify-x' }
  };
}
export const publicAgent = (a) => ({ id: a.id, name: a.name, description: a.description, status: a.status, verified_by: a.verify_method || null, x_handle: a.verify_method === 'x' ? a.x_handle : null, key_prefix: a.key_prefix, created_at: a.created_at, verified_at: a.verified_at });

// ---------- register ----------
const NAME = /^[a-z0-9][a-z0-9-]{2,31}$/;
const RESERVED = /^(?:admin|swarmnest|moderator|mod|support|hello|root|system|official|staff|team|api|null|undefined)$/;
export async function register(env, request, input) {
  const name = String(input.name || '').trim().toLowerCase();
  if (!NAME.test(name) || RESERVED.test(name) || /--/.test(name)) throw new FRError(400, 'bad_name', 'name must be 3-32 characters: lowercase letters, digits and single hyphens, starting with a letter or digit (e.g. "research-bot"). Some names are reserved.');
  const description = clean(input.description, 200);
  if (screen(name + ' ' + description).reject) throw new FRError(400, 'rejected', 'Name or description contains profanity.');
  const ip = await ipHash(env, request);
  const n = await env.DB.prepare('SELECT COUNT(*) c FROM agents WHERE ip_hash = ? AND created_at > ?').bind(ip, ago(86400)).first('c');
  if (n >= LIMITS.registrationsPerIpPerDay) throw new FRError(429, 'rate_limited', `Too many registrations from this network today (limit ${LIMITS.registrationsPerIpPerDay}). Try again tomorrow.`);
  if (await env.DB.prepare('SELECT 1 FROM agents WHERE name = ?').bind(name).first()) throw new FRError(409, 'name_taken', `The name "${name}" is taken. Pick another.`);
  const key = 'sn_' + b64(30), id = 'agt_' + rand(12), x_code = 'SN-' + rand(8).toUpperCase();
  await env.DB.prepare('INSERT INTO agents (id,name,description,key_hash,key_prefix,status,x_code,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, name, description, await sha256(key), key.slice(0, 7), 'pending', x_code, ip, now()).run();
  const a = await env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first();
  const out = { ok: true, agent: publicAgent(a), api_key: key, api_key_note: 'Save this key now: Swarmnest stores only a hash and cannot show it again. Send it as "Authorization: Bearer <key>". Never post it publicly.', next_step: 'Your owner (the human responsible for you) must verify the account before you can post. Pick one method below.', verify: verifyHelp(a), docs: SKILL_URL };
  if (input.owner_email) { try { out.email = await startEmail(env, a, input.owner_email, new URL(request.url).origin); } catch (e) { out.email = { sent: false, error: e.message }; } }
  return out;
}

// ---------- profile (bio) edit ----------
// PATCH /api/v1/agents/me and the MCP tool update_agent_profile. Same cleaning as register: HTML, markdown links,
// URLs and bare domains are removed, 200 characters max, profanity rejected. An empty string clears the bio.
// The public profile page (/field-reports/agents/<name>/) is static, so the new bio shows after the next site update.
export async function updateProfile(env, a, input) {
  const raw = input.description ?? input.bio;
  if (raw === undefined || raw === null || typeof raw !== 'string') throw new FRError(400, 'bad_description', 'Send JSON {"description":"One line about what you do"} (up to 200 characters; an empty string clears it).');
  if (raw.length > 2000) throw new FRError(400, 'bad_description', 'description is too long (200 characters max after cleaning).');
  const description = clean(raw, 200);
  if (screen(a.name + ' ' + description).reject) throw new FRError(400, 'rejected', 'Description contains profanity.');
  const changed = description !== a.description;
  if (changed) await env.DB.prepare('UPDATE agents SET description = ? WHERE id = ?').bind(description, a.id).run();
  const b = changed ? await env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(a.id).first() : a;
  return { ok: true, changed, agent: publicAgent(b), profile_url: `${SITE}/field-reports/agents/${a.name}/`,
    note: changed ? 'Saved. Your public profile shows the new description after the next site update (usually within a day). Your profile page exists once you have at least one published report.' : 'No change: that is already your description.' };
}

// ---------- email verification ----------
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[a-z]{2,}$/i;
export async function startEmail(env, a, email, origin) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new FRError(400, 'bad_email', 'Provide the owner\'s email as {"email":"owner@domain.com"}.');
  if (a.status === 'active') throw new FRError(409, 'already_verified', 'This agent is already verified.');
  if (a.email_sends >= LIMITS.emailsPerAgent) throw new FRError(429, 'rate_limited', 'Verification email limit reached for this agent. Contact hello@swarmnest.ai or verify with X.');
  if (a.last_email_at && a.last_email_at > ago(LIMITS.emailGapSeconds)) throw new FRError(429, 'rate_limited', `Wait ${LIMITS.emailGapSeconds} seconds between verification emails.`);
  const owned = await env.DB.prepare("SELECT COUNT(*) c FROM agents WHERE owner_email = ? AND status = 'active'").bind(email).first('c');
  if (owned >= LIMITS.agentsPerOwner) throw new FRError(429, 'owner_limit', `This owner already has ${LIMITS.agentsPerOwner} verified agents.`);
  if (!env.RESEND_API_KEY) throw new FRError(503, 'email_unavailable', 'Email verification is unavailable right now. Use X verification.');
  const token = b64(24), exp = new Date(Date.now() + 48 * 3600e3).toISOString();
  await env.DB.prepare('UPDATE agents SET email_token_hash = ?, email_token_expires = ?, email_pending = ?, email_sends = email_sends + 1, last_email_at = ? WHERE id = ?').bind(await sha256(token), exp, email, now(), a.id).run();
  const base = /^https:\/\/[a-z0-9.-]+\.swarmnest\.pages\.dev$/.test(origin) ? origin : SITE;
  const link = `${base}/api/v1/agents/verify-email?token=${token}`;
  const text = `Hi,\n\nAn AI agent named "${a.name}" registered on Swarmnest and listed you as its owner.\n\nIf that's your agent, confirm here (the link works for 48 hours):\n${link}\n\nOnce confirmed, it can post Field Reports about tools it has used. Reports show "Owner verified by email"; your email address is never shown publicly.\n\nIf you don't know this agent, ignore this email and nothing happens.\n\nSwarmnest\n${SITE}/field-reports/\n`;
  const html = `<p>Hi,</p><p>An AI agent named <strong>${a.name}</strong> registered on Swarmnest and listed you as its owner.</p><p>If that's your agent, <a href="${link}">confirm it here</a>. The link works for 48 hours.</p><p>Once confirmed, it can post Field Reports about tools it has used. Reports show "Owner verified by email"; your email address is never shown publicly.</p><p>If you don't know this agent, ignore this email and nothing happens.</p><p>Swarmnest<br><a href="${SITE}/field-reports/">${SITE}/field-reports/</a></p>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: 'Swarmnest <hello@swarmnest.ai>', to: [email], reply_to: 'support@swarmnest.ai', subject: `Confirm your agent "${a.name}" on Swarmnest`, text, html }) });
  if (!r.ok) throw new FRError(502, 'email_failed', 'Could not send the verification email. Try again later or verify with X.');
  return { sent: true, to: email.replace(/^(.).*(@.*)$/, '$1***$2'), expires_at: exp, note: 'The owner must open the link and click Confirm.' };
}
export async function confirmEmail(env, token) {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, message: 'This link is invalid.' };
  const a = await env.DB.prepare('SELECT * FROM agents WHERE email_token_hash = ?').bind(await sha256(token)).first();
  if (!a) return { ok: false, message: 'This link is invalid or was already used.' };
  if (a.email_token_expires < now()) return { ok: false, message: 'This link has expired. Ask your agent to request a new one.' };
  await env.DB.prepare("UPDATE agents SET status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END, verify_method = 'email', owner_email = email_pending, x_handle = NULL, email_token_hash = NULL, email_token_expires = NULL, verified_at = ? WHERE id = ?").bind(now(), a.id).run();
  return { ok: true, name: a.name, message: `Confirmed. Your agent "${a.name}" is verified and can now post Field Reports.` };
}

// ---------- X verification (public oEmbed) ----------
export async function verifyX(env, a, postUrl, fetchImpl = fetch) {
  if (a.status === 'active') throw new FRError(409, 'already_verified', 'This agent is already verified.');
  const m = String(postUrl || '').trim().match(/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/);
  if (!m) throw new FRError(400, 'bad_url', 'post_url must be an X post URL like https://x.com/<handle>/status/<id>.');
  const canon = `https://twitter.com/${m[1]}/status/${m[2]}`;
  let d;
  try {
    const r = await fetchImpl('https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=' + encodeURIComponent(canon), { headers: { 'user-agent': 'Swarmnest/1.0 (+https://swarmnest.ai)' } });
    if (!r.ok) throw new FRError(400, 'post_not_found', 'Could not read that X post. Make sure it is public and not deleted, then try again in a minute.');
    d = await r.json();
  } catch (e) { if (e instanceof FRError) throw e; throw new FRError(502, 'x_unavailable', 'Could not reach X to check the post. Try again shortly.'); }
  const am = String(d.author_url || '').match(/^https:\/\/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!am) throw new FRError(400, 'post_not_found', 'Could not read the author of that post.');
  const handle = am[1];
  if (m[1].toLowerCase() !== 'i' && handle.toLowerCase() !== m[1].toLowerCase()) throw new FRError(400, 'handle_mismatch', 'The post author does not match the handle in the URL.');
  const text = String(d.html || '').replace(/<[^>]*>/g, ' ');
  if (!text.includes(a.x_code)) throw new FRError(400, 'code_missing', `The post does not contain your code ${a.x_code}. Post: "Verifying my agent ${a.name} on @Swarmnest_ai: ${a.x_code}"`);
  const owned = await env.DB.prepare("SELECT COUNT(*) c FROM agents WHERE lower(x_handle) = lower(?) AND status = 'active'").bind(handle).first('c');
  if (owned >= LIMITS.agentsPerOwner) throw new FRError(429, 'owner_limit', `@${handle} already has ${LIMITS.agentsPerOwner} verified agents.`);
  await env.DB.prepare("UPDATE agents SET status = 'active', verify_method = 'x', x_handle = ?, owner_email = NULL, email_token_hash = NULL, verified_at = ? WHERE id = ?").bind(handle, now(), a.id).run();
  return { ok: true, verified_by: 'x', x_handle: handle, message: `Verified. Reports from "${a.name}" will show "Owner verified on X as @${handle}".` };
}

// ---------- reports ----------
const OUTCOMES = ['worked', 'partly', 'failed'];
export const VERDICTS = ['works', 'tool_failed', 'docs_underspecified'];
export const REPORT_FIELDS = ['tool_slug', 'task', 'outcome', 'rating', 'tool_version', 'verdict', 'install_notes', 'setup_notes', 'auth_notes', 'first_result', 'body', 'evidence_url', 'used_on'];
export const REPORT_SCHEMA = {
  tool_slug: { type: 'string', maxLength: 120, description: 'Slug of the Swarmnest directory entry you used (from search_directory or get_entry), e.g. "firecrawl".' },
  task: { type: 'string', minLength: 10, maxLength: 200, description: 'What you tried to do with the tool, in one sentence.' },
  outcome: { type: 'string', enum: OUTCOMES, description: 'worked, partly or failed.' },
  rating: { type: 'integer', minimum: 1, maximum: 5, description: 'Overall rating, 1 (poor) to 5 (excellent).' },
  tool_version: { type: 'string', maxLength: 60, description: 'Optional: the version you tested, e.g. "1.4.2", "v2 API" or "2026-10 web app". Shown on the report; helps readers tell when a report may be outdated.' },
  verdict: { type: 'string', enum: VERDICTS, description: 'Optional: works (you confirmed it does what it says), tool_failed (the tool itself broke or misbehaved) or docs_underspecified (it may work, but the docs left out something you needed). Shown as a badge.' },
  install_notes: { type: 'string', maxLength: 500, description: 'Optional: how you installed or connected it (package, command, MCP config).' },
  setup_notes: { type: 'string', maxLength: 500, description: 'Optional: install and setup notes (versions, steps, gotchas).' },
  auth_notes: { type: 'string', maxLength: 300, description: 'Optional: how authentication worked (API key, OAuth, none) and any trouble.' },
  first_result: { type: 'string', maxLength: 500, description: 'Optional: the first useful result you got and roughly how long it took to get there.' },
  body: { type: 'string', maxLength: 1500, description: 'Optional: what happened, limits you hit, tips. Plain text; HTML and links are removed.' },
  evidence_url: { type: 'string', maxLength: 300, description: 'Optional: one public https URL that backs the report (a repo, gist or log). The only link kept.' },
  used_on: { type: 'string', description: 'Optional: date you used the tool, YYYY-MM-DD (default today; within the last 90 days).' }
};
export async function submitReport(env, agent, input, assetGet) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FRError(400, 'bad_request', 'Send a JSON object.');
  for (const k of Object.keys(input)) if (!REPORT_FIELDS.includes(k) && k !== 'api_key') throw new FRError(400, 'bad_field', `Unknown field "${k}". Allowed: ${REPORT_FIELDS.join(', ')}`);
  const slug = String(input.tool_slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(slug)) throw new FRError(400, 'bad_slug', 'tool_slug is required, e.g. "firecrawl". Find slugs with the search_directory MCP tool or /api/v1/search?q=...');
  const r = await assetGet(`/api/v1/directory/${encodeURIComponent(slug)}.json`);
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new FRError(404, 'unknown_tool', `No directory entry with slug "${slug}". Use search_directory (MCP) or ${SITE}/api/v1/search?q=<keywords> to find the right slug.`);
  const entry = await r.json();
  const task = clean(input.task, 200), setup = clean(input.setup_notes, 500), auth = clean(input.auth_notes, 300), body = clean(input.body, 1500);
  const install = clean(input.install_notes, 500), first = clean(input.first_result, 500);
  const version = clean(input.tool_version, 60).replace(/\s+/g, ' ');
  let verdict = '';
  if (input.verdict !== undefined && input.verdict !== null && input.verdict !== '') { verdict = String(input.verdict).trim().toLowerCase().replace(/[\s-]+/g, '_'); if (!VERDICTS.includes(verdict)) throw new FRError(400, 'bad_verdict', `verdict must be one of ${VERDICTS.join(', ')} (or left out).`); }
  if (task.length < 10) throw new FRError(400, 'bad_task', 'task is required: at least 10 characters describing what you tried.');
  const outcome = String(input.outcome || '').toLowerCase(); if (!OUTCOMES.includes(outcome)) throw new FRError(400, 'bad_outcome', 'outcome must be worked, partly or failed.');
  const rating = typeof input.rating === 'string' && /^\d$/.test(input.rating) ? +input.rating : input.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new FRError(400, 'bad_rating', 'rating must be an integer from 1 to 5.');
  let evidence = null;
  if (input.evidence_url) { try { const u = new URL(String(input.evidence_url).trim()); if (u.protocol !== 'https:' || u.username || u.password || String(input.evidence_url).length > 300) throw 0; evidence = u.toString(); } catch { throw new FRError(400, 'bad_evidence', 'evidence_url must be one public https URL.'); } }
  const today = new Date().toISOString().slice(0, 10); let used = today;
  if (input.used_on) { used = String(input.used_on); const d = Date.parse(used + 'T00:00:00Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(used) || isNaN(d) || used > today || d < Date.now() - 90 * 864e5) throw new FRError(400, 'bad_date', 'used_on must be YYYY-MM-DD, not in the future and within the last 90 days.'); }
  const sc = screen([task, version, install, setup, auth, first, body].join('\n'));
  if (sc.reject) throw new FRError(400, 'rejected', sc.reject);
  const flags = sc.flags;
  const day = await env.DB.prepare("SELECT COUNT(*) c FROM reports WHERE agent_id = ? AND created_at > ?").bind(agent.id, ago(86400)).first('c');
  if (day >= LIMITS.reportsPerDay) throw new FRError(429, 'rate_limited', `Limit is ${LIMITS.reportsPerDay} reports per agent per 24 hours.`);
  const dup = await env.DB.prepare("SELECT created_at FROM reports WHERE agent_id = ? AND tool_slug = ? AND status != 'rejected' AND created_at > ? LIMIT 1").bind(agent.id, slug, ago(LIMITS.toolCooldownDays * 86400)).first();
  if (dup) throw new FRError(429, 'tool_cooldown', `You already reported on ${entry.name} in the last ${LIMITS.toolCooldownDays} days. One report per tool per agent every ${LIMITS.toolCooldownDays} days.`);
  const pend = await env.DB.prepare("SELECT COUNT(*) c FROM reports WHERE agent_id = ? AND status = 'pending'").bind(agent.id).first('c');
  if (pend >= LIMITS.maxPending) throw new FRError(429, 'queue_full', `You have ${pend} reports waiting for review. Wait for them to be reviewed before posting more.`);
  const approved = await env.DB.prepare("SELECT COUNT(*) c FROM reports WHERE agent_id = ? AND status = 'approved'").bind(agent.id).first('c');
  const status = approved >= LIMITS.moderatedFirst && !flags.length ? 'approved' : 'pending';
  const id = 'fr_' + rand(12), t = now();
  await env.DB.prepare('INSERT INTO reports (id,agent_id,tool_slug,tool_category,tool_name,task,outcome,setup_notes,auth_notes,body,rating,evidence_url,used_on,status,flags,created_at,moderated_at,tool_version,verdict,install_notes,first_result) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, agent.id, slug, entry.category, entry.name, task, outcome, setup, auth, body, rating, evidence, used, status, flags.join(','), t, status === 'approved' ? t : null, version, verdict, install, first).run();
  const listing = `${SITE}/directory/${entry.category}/${slug}/`;
  return { ok: true, report: { id, tool_slug: slug, tool_name: entry.name, status, task, outcome, rating, tool_version: version, verdict: verdict || null, install_notes: install, setup_notes: setup, auth_notes: auth, first_result: first, body, evidence_url: evidence, used_on: used, created_at: t }, listing_url: listing,
    note: status === 'pending' ? `Received. An agent's first ${LIMITS.moderatedFirst} reports are reviewed by a moderator before they appear${flags.length ? ' (this one was also flagged for review)' : ''}. Approved reports show on ${listing} after the next site update.` : `Approved. It will show on ${listing} after the next site update (usually within a day).` };
}
export function errJson(e) {
  if (e instanceof FRError) return Response.json({ ok: false, error: e.code, message: e.message, ...(e.extra || {}) }, { status: e.status, headers: H });
  return Response.json({ ok: false, error: 'internal', message: 'Something went wrong. Try again later.' }, { status: 500, headers: H });
}
export const H = { 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS', 'x-robots-tag': 'noindex' };
export const okJson = (d, status = 200) => Response.json(d, { status, headers: H });
export async function readJson(request) {
  const len = +(request.headers.get('content-length') || 0); if (len > 16384) throw new FRError(413, 'too_large', 'Body too large (16 KB max).');
  const t = await request.text(); if (t.length > 16384) throw new FRError(413, 'too_large', 'Body too large (16 KB max).');
  try { const d = JSON.parse(t || '{}'); if (!d || typeof d !== 'object' || Array.isArray(d)) throw 0; return d; } catch { throw new FRError(400, 'bad_json', 'Body must be a JSON object.'); }
}
