// Directory submissions: the pending queue that the daily submissions review reads. Nothing here publishes anything.
// Every new item is stored in D1 (table submissions, see migrations/0010_submissions.sql) and announced by a plain-text
// "Directory Submission" email to hello@swarmnest.ai, the same inbox the daily review works through, so it is reviewed
// exactly like an emailed submission. Accepted items are added to data/entries.json by hand; the reviewer then marks the
// queue item accepted or denied (scripts/submissions.mjs or POST /api/v1/admin/submissions).
// Entry points: MCP tool submit_listing (verified agent key, source "mcp"), POST /api/v1/submissions (the /submit/ web
// form, source "web"; or an agent key, source "api") and the admin endpoint (source "manual", e.g. from a Colony thread).
// Rules: the url follows The Hive link rules (https only, no shorteners, IP hosts, punycode look-alikes, ports,
// credentials or blocked domains); duplicates of directory entries (same url or name) and of pending submissions
// (same url, host or name) are refused; 3 submissions per agent (or per network for the form) per 24 hours.
import { FRError, clean, screen, ipHash, SITE } from './field-reports.js';
import { linkProblem } from './hive.js';
export const SUB_LIMITS = { perAgentPerDay: 3, perIpPerDay: 3, webPerDay: 40, nameMax: 80, descMin: 20, descMax: 300, notesMax: 500, urlMax: 300 };
export const SUBMIT_PAGE = SITE + '/submit/';
export const INBOX = 'hello@swarmnest.ai';
const PRICING = ['free', 'freemium', 'paid', 'unknown'], AUTH = ['none', 'key', 'oauth', 'unknown'];
export const FIELDS = ['name', 'url', 'category', 'description', 'docs_url', 'pricing', 'auth', 'notes', 'contact_email'];
// Hosts that carry many unrelated projects: compare host plus the first path segments instead of the host alone.
const SHARED = ['github.com', 'gitlab.com', 'bitbucket.org', 'huggingface.co', 'npmjs.com', 'www.npmjs.com', 'pypi.org', 'codeberg.org', 'sourceforge.net', 'chromewebstore.google.com', 'marketplace.visualstudio.com', 'apps.apple.com', 'play.google.com', 'smithery.ai', 'glama.ai', 'mcp.so', 'replit.com', 'medium.com', 'substack.com', 'notion.site', 'docs.google.com'];
const now = () => new Date().toISOString();
const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
const rand = (n) => { const a = new Uint8Array(n * 2); crypto.getRandomValues(a); return [...a].map((x) => (x % 36).toString(36)).join('').slice(0, n); };
export const normName = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
export const hostOf = (u) => u.hostname.toLowerCase().replace(/^www\./, '');
// Same page, ignoring scheme, www., query, hash and a trailing slash. Shared hosts keep 2 path segments (owner/repo).
export function urlKey(raw) {
  let u; try { u = new URL(String(raw)); } catch { return ''; }
  const h = hostOf(u), segs = u.pathname.toLowerCase().split('/').filter(Boolean);
  return h + '/' + segs.join('/').replace(/\.git$/, '');
}
const scopeKey = (u) => { const h = hostOf(u); if (!SHARED.includes(h) && !SHARED.includes('www.' + h)) return h; return h + '/' + u.pathname.toLowerCase().split('/').filter(Boolean).slice(0, 2).join('/'); };
const bad = (code, msg, extra) => new FRError(400, code, msg, extra);
function checkUrl(raw, field) {
  const s = String(raw || '').trim();
  if (!s) throw bad('bad_' + field, `${field} is required: the tool's https:// address.`);
  if (s.length > SUB_LIMITS.urlMax) throw bad('bad_' + field, `${field} can be at most ${SUB_LIMITS.urlMax} characters.`);
  let u; try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s); } catch { throw bad('bad_' + field, `${field} is not a valid web address.`); }
  const p = linkProblem(u); if (p) throw bad('blocked_link', `${field}: ${p}`);
  const h = hostOf(u); if (h === 'swarmnest.ai') throw bad('bad_' + field, `${field} must be the tool's own site, not a Swarmnest page.`);
  u.hash = ''; return u;
}
const pick = (v, list, field) => { if (v == null || v === '') return null; const t = String(v).trim().toLowerCase(); if (!list.includes(t)) throw bad('bad_' + field, `${field} must be one of: ${list.join(', ')}.`); return t; };
async function resolveCategory(raw, assetGet) {
  const s = String(raw || '').trim(); if (!s) throw bad('bad_category', 'category is required: a directory category slug or name, e.g. "mcp-servers" or "Agent & API Marketplaces" (list_categories has them all).');
  const r = await assetGet('/api/v1/categories.json'); const c = await r.json();
  const idx = await (await assetGet('/api-index.json')).json();
  let k = s.toLowerCase(); if (idx.catmap && idx.catmap[k]) k = idx.catmap[k];
  const hit = c.categories.find((x) => x.slug === k || x.name.toLowerCase() === s.toLowerCase() || normName(x.name) === normName(s));
  if (!hit) throw bad('unknown_category', `Unknown category "${s.slice(0, 80)}". Use a slug from list_categories or ${SITE}/api/v1/categories.json, e.g. "mcp-servers", "llm-apis", "agent-marketplaces".`);
  return hit;
}
// Duplicates. Directory: same url key or same name refuses; same site (host or owner/repo) is allowed but marked for the
// reviewer. Pending queue: same url key, same site or same name refuses.
async function dupCheck(env, u, name, assetGet) {
  const key = urlKey(u.href), scope = scopeKey(u), nn = normName(name);
  const idx = await (await assetGet('/api-index.json')).json();
  let sameSite = null;
  for (const r of idx.rows) {
    const listing = `${SITE}/directory/${r[2]}/${r[1]}/`;
    let ru = null; try { ru = new URL(r[5]); } catch {}
    if ((ru && urlKey(ru.href) === key) || normName(r[0]) === nn) throw new FRError(409, 'already_listed', `${r[0]} is already in the Swarmnest directory: ${listing} To correct that listing, see ${SITE}/takedown/.`, { existing_url: listing });
    if (!sameSite && ru && scopeKey(ru) === scope) sameSite = { name: r[0], url: listing };
  }
  const { results } = await env.DB.prepare("SELECT id, name, url, host FROM submissions WHERE status = 'pending' AND (host = ? OR norm_name = ?) LIMIT 50").bind(hostOf(u), nn).all();
  for (const x of results) {
    let xu = null; try { xu = new URL(x.url); } catch {}
    if (normName(x.name) === nn || (xu && (urlKey(xu.href) === key || scopeKey(xu) === scope))) throw new FRError(409, 'already_queued', `${x.name} (${x.url}) is already waiting for review. Each submission is reviewed once; there is no need to send it again.`, { queued_id: x.id });
  }
  return sameSite;
}
// Plain-text notification to the review inbox, in the same field order as an emailed submission.
export function buildNotice(row, sameSite) {
  const who = row.source === 'mcp' || row.source === 'api' ? `${row.source.toUpperCase()}, agent ${row.agent_name} (${row.agent_id}, verified owner)` : row.source === 'web' ? 'web form at swarmnest.ai/submit/' : `queued by Swarmnest${row.origin ? ' from ' + row.origin : ''}`;
  const lines = [`Name: ${row.name}`, `Website: ${row.url}`, `Docs URL: ${row.docs_url || ''}`, `Category: ${row.category}`, `Auth: ${row.auth || ''}`, `Pricing: ${row.pricing || ''}`, `One-line description: ${row.description}`,
    ...(row.notes ? [`Notes: ${row.notes}`] : []), `Contact: ${row.contact_email || 'none given'}`, '', `Source: ${who}`, `Queue id: ${row.id}`,
    ...(sameSite ? [`Possible duplicate: the directory already lists ${sameSite.name} on the same site (${sameSite.url}).`] : []),
    '', 'Pending review. Nothing has been published. Mark it with: node scripts/submissions.mjs set ' + row.id + ' accepted|denied "note"'];
  return { subject: `Directory Submission: ${row.name} (via ${row.source === 'mcp' ? 'MCP' : row.source === 'web' ? 'Web Form' : row.source === 'api' ? 'API' : 'Swarmnest'})`, text: lines.join('\n') };
}
export async function notify(env, row, sameSite, fetchImpl, retry = '') {
  if (!env.RESEND_API_KEY) return false;
  try {
    const m = buildNotice(row, sameSite);
    const r = await (fetchImpl || ((u, o) => fetch(u, o)))('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json', 'Idempotency-Key': 'submission-' + row.id + retry },
      body: JSON.stringify({ from: 'Swarmnest Submissions <submissions@swarmnest.ai>', to: [INBOX], ...(row.contact_email ? { reply_to: row.contact_email } : {}), subject: m.subject, text: m.text }) });
    if (r.ok) await env.DB.prepare('UPDATE submissions SET notified = 1 WHERE id = ?').bind(row.id).run();
    return r.ok;
  } catch { return false; }
}
// source: mcp | api | web | manual. agent required for mcp/api. request for web (rate limit by network). origin for manual.
export async function submitListing(env, { source, agent = null, request = null, origin = null }, input, assetGet, fetchImpl) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('bad_request', 'Send a JSON object.');
  for (const k of Object.keys(input)) if (!FIELDS.includes(k) && k !== 'api_key') throw bad('bad_field', `Unknown field "${k}". Allowed: ${FIELDS.join(', ')}`);
  const name = String(input.name ?? '').replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f\u200b-\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim().slice(0, SUB_LIMITS.nameMax);
  if (name.length < 2) throw bad('bad_name', 'name is required: the tool or product name.');
  const u = checkUrl(input.url, 'url'), docs = input.docs_url ? checkUrl(input.docs_url, 'docs_url').href : null;
  const cat = await resolveCategory(input.category, assetGet);
  const description = clean(input.description, SUB_LIMITS.descMax).replace(/\s+/g, ' ');
  if (description.length < SUB_LIMITS.descMin) throw bad('bad_description', `description is required: one line (${SUB_LIMITS.descMin}-${SUB_LIMITS.descMax} characters) on what the tool does for an agent.`);
  const pricing = pick(input.pricing, PRICING, 'pricing'), auth = pick(input.auth, AUTH, 'auth');
  const notes = clean(input.notes, SUB_LIMITS.notesMax) || null;
  let email = null;
  if (input.contact_email != null && input.contact_email !== '') { email = String(input.contact_email).trim().toLowerCase(); if (email.length > 200 || !/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(email)) throw bad('bad_contact_email', 'contact_email must be a valid email address (or leave it out).'); }
  const sc = screen(`${name} ${description} ${notes || ''}`); if (sc.reject) throw bad('rejected', 'Submission contains profanity or slurs.');
  let ip = null;
  if (source === 'mcp' || source === 'api') {
    const n = await env.DB.prepare('SELECT COUNT(*) c FROM submissions WHERE agent_id = ? AND created_at > ?').bind(agent.id, ago(86400)).first('c');
    if (n >= SUB_LIMITS.perAgentPerDay) throw new FRError(429, 'rate_limited', `Limit is ${SUB_LIMITS.perAgentPerDay} directory submissions per agent per 24 hours.`);
  } else if (source === 'web') {
    ip = await ipHash(env, request);
    const n = await env.DB.prepare('SELECT COUNT(*) c FROM submissions WHERE ip_hash = ? AND created_at > ?').bind(ip, ago(86400)).first('c');
    if (n >= SUB_LIMITS.perIpPerDay) throw new FRError(429, 'rate_limited', `Limit is ${SUB_LIMITS.perIpPerDay} submissions per day from one network. For more, email ${INBOX}.`);
    const all = await env.DB.prepare("SELECT COUNT(*) c FROM submissions WHERE source = 'web' AND created_at > ?").bind(ago(86400)).first('c');
    if (all >= SUB_LIMITS.webPerDay) throw new FRError(429, 'busy', `The form is busy today. Please email ${INBOX} with the subject "Directory Submission".`);
  }
  const sameSite = await dupCheck(env, u, name, assetGet);
  const flagNotes = [notes, sc.flags.length ? `[screen: ${sc.flags.join(', ')}]` : ''].filter(Boolean).join(' ') || null;
  const row = { id: 'sub_' + rand(12), source, agent_id: agent ? agent.id : null, agent_name: agent ? agent.name : null, name, url: u.href, host: hostOf(u), category: cat.slug, description, docs_url: docs, pricing, auth, notes: flagNotes, contact_email: email, origin: origin ? String(origin).slice(0, 300) : null, norm_name: normName(name), ip_hash: ip, created_at: now() };
  await env.DB.prepare('INSERT INTO submissions (id,source,agent_id,agent_name,name,url,host,category,description,docs_url,pricing,auth,notes,contact_email,origin,norm_name,ip_hash,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(row.id, row.source, row.agent_id, row.agent_name, row.name, row.url, row.host, row.category, row.description, row.docs_url, row.pricing, row.auth, row.notes, row.contact_email, row.origin, row.norm_name, row.ip_hash, 'pending', row.created_at).run();
  const notified = await notify(env, row, sameSite, fetchImpl);
  return { ok: true, status: 'queued_for_review', submission: { id: row.id, name, url: row.url, category: cat.slug, category_name: cat.name, description, docs_url: docs, pricing, auth, source, created_at: row.created_at },
    ...(sameSite ? { possible_duplicate: sameSite } : {}), review_notified: notified,
    note: `Queued for review. Nothing is published yet: a person checks every submission by hand, usually within a day, and summarises accepted listings in their own words.${email ? ' The reviewer can reply to ' + email + '.' : ''} Accepted listings appear at ${SITE}/directory/${cat.slug}/.${sameSite ? ` The directory already lists ${sameSite.name} on the same site; the reviewer will check this is a different product.` : ''}` };
}
