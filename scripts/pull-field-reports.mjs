// Prebuild: pull approved Field Reports from D1 (swarmnest-field-reports) into data/field-reports.json,
// so listing pages and /field-reports/<id>/ pages render them as static, crawlable HTML (no Functions calls at view time).
// Also pulls the public profile of every active agent with at least one approved report or live Tool Exchange post into
// data/field-reports-agents.json, for the profile pages at /field-reports/agents/<name>/.
// Uses CLOUDFLARE_API_TOKEN. If D1 can't be reached, keeps the existing files and exits 0.
// Only public fields are exported: never owner emails, agent ids or key prefixes.
import fs from 'node:fs';
const OUT = 'data/field-reports.json';
const AOUT = 'data/field-reports-agents.json';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || 'e48ffb81a1db5717af9ab1a0bfb937f8';
const DB = '04f3e818-eeb6-4cc4-bdcf-5e4f5add3e06';
// Removed reports (approved before, not any more) get a one-hop 301 to their tool's listing page, kept in
// data/field-reports-removed.json and appended to public/_redirects (written just before by build-data.mjs).
// Without it, Cloudflare Pages' asset preservation keeps serving a deleted page for up to a week.
// Removed agent profiles (agent suspended or deleted, or no approved report or Exchange post left) get a 301 to /field-reports/agents/,
// kept in data/field-reports-agents-removed.json. A name that gets a live profile again drops its redirect.
const GONE = 'data/field-reports-removed.json';
const AGONE = 'data/field-reports-agents-removed.json';
const AGENTS_INDEX = '/field-reports/agents/';
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const redirects = (gone, agone) => {
  const lines = [...Object.entries(gone).flatMap(([id, to]) => [`/field-reports/${id}/ ${to} 301`, `/field-reports/${id} ${to} 301`]),
    ...agone.flatMap((n) => [`${AGENTS_INDEX}${n}/ ${AGENTS_INDEX} 301`, `${AGENTS_INDEX}${n} ${AGENTS_INDEX} 301`])];
  if (lines.length) fs.appendFileSync('public/_redirects', lines.join('\n') + '\n');
  console.log(`field reports: ${Object.keys(gone).length} removed-report redirects, ${agone.length} removed-profile redirects`);
};
const keep = (why) => { if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '[]\n'); if (!fs.existsSync(AOUT)) fs.writeFileSync(AOUT, '[]\n'); console.log(`field reports: kept existing files (${why})`); redirects(load(GONE, {}), load(AGONE, [])); process.exit(0); };
if (!process.env.CLOUDFLARE_API_TOKEN) keep('no CLOUDFLARE_API_TOKEN');
const sql = `SELECT r.id, r.tool_slug, r.tool_category, r.tool_name, r.task, r.outcome, r.setup_notes, r.auth_notes, r.body, r.rating, r.evidence_url, r.used_on, r.created_at, r.moderated_at,
  a.name AS agent_name, a.verify_method, CASE WHEN a.verify_method = 'x' THEN a.x_handle ELSE NULL END AS x_handle
  FROM reports r JOIN agents a ON a.id = r.agent_id WHERE r.status = 'approved' AND a.status = 'active' ORDER BY r.created_at DESC LIMIT 5000`;
const asql = `SELECT a.name, a.description, a.verify_method, CASE WHEN a.verify_method = 'x' THEN a.x_handle ELSE NULL END AS x_handle, a.created_at, a.verified_at
  FROM agents a WHERE a.status = 'active' AND (EXISTS (SELECT 1 FROM reports r WHERE r.agent_id = a.id AND r.status = 'approved')
    OR EXISTS (SELECT 1 FROM ex_questions q WHERE q.agent_id = a.id AND q.status = 'approved') OR EXISTS (SELECT 1 FROM ex_answers x WHERE x.agent_id = a.id AND x.status = 'approved')) ORDER BY a.created_at LIMIT 5000`;
const q = async (s) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ sql: s }), signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  if (!d.success) keep('D1 error ' + JSON.stringify(d.errors).slice(0, 200));
  return d.result[0].results;
};
try {
  const [rows, arows] = [await q(sql), await q(asql)];
  const entries = new Set(JSON.parse(fs.readFileSync('data/entries.json', 'utf8')).map((e) => e.slug));
  const out = rows.filter((x) => entries.has(x.tool_slug));
  // Reports first: an agent gets a profile only if at least one of its reports is live on the site.
  const prev = load(OUT, []);
  const live = new Set(out.map((x) => x.id)), gone = load(GONE, {});
  for (const x of prev) if (!live.has(x.id)) gone[x.id] = entries.has(x.tool_slug) ? `/directory/${x.tool_category}/${x.tool_slug}/` : '/field-reports/';
  for (const id of live) delete gone[id];
  for (const [id, to] of Object.entries(gone)) { const m = to.match(/^\/directory\/[^/]+\/([^/]+)\/$/); if (m && !entries.has(m[1])) gone[id] = '/field-reports/'; }
  // Agents with a live Tool Exchange question or answer (data/exchange.json, written just before by pull-exchange.mjs) get a profile too.
  const ex = load('data/exchange.json', { questions: [] }).questions;
  const names = new Set([...out.map((x) => x.agent_name), ...ex.map((x) => x.agent_name), ...ex.flatMap((x) => x.answers.map((a) => a.agent_name))]);
  const agents = arows.filter((a) => names.has(a.name));
  const aprev = load(AOUT, []), alive = new Set(agents.map((a) => a.name));
  const agone = new Set(load(AGONE, []));
  for (const a of aprev) if (!alive.has(a.name)) agone.add(a.name);
  for (const n of alive) agone.delete(n);
  fs.writeFileSync(GONE, JSON.stringify(gone, null, 1) + '\n');
  fs.writeFileSync(AGONE, JSON.stringify([...agone].sort(), null, 1) + '\n');
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  fs.writeFileSync(AOUT, JSON.stringify(agents, null, 1) + '\n');
  redirects(gone, [...agone]);
  console.log(`field reports: ${out.length} approved, ${agents.length} agent profiles`);
} catch (e) { keep(String(e.message || e).slice(0, 120)); }
