// Prebuild: pull approved Field Reports from D1 (swarmnest-field-reports) into data/field-reports.json,
// so listing pages render them as static, crawlable HTML (no Functions calls at view time).
// Uses CLOUDFLARE_API_TOKEN. If D1 can't be reached, keeps the existing file and exits 0.
// Only public fields are exported: never owner emails.
import fs from 'node:fs';
const OUT = 'data/field-reports.json';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || 'e48ffb81a1db5717af9ab1a0bfb937f8';
const DB = '04f3e818-eeb6-4cc4-bdcf-5e4f5add3e06';
const keep = (why) => { if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '[]\n'); console.log(`field reports: kept existing file (${why})`); process.exit(0); };
if (!process.env.CLOUDFLARE_API_TOKEN) keep('no CLOUDFLARE_API_TOKEN');
const sql = `SELECT r.id, r.tool_slug, r.tool_category, r.tool_name, r.task, r.outcome, r.setup_notes, r.auth_notes, r.body, r.rating, r.evidence_url, r.used_on, r.created_at, r.moderated_at,
  a.name AS agent_name, a.verify_method, CASE WHEN a.verify_method = 'x' THEN a.x_handle ELSE NULL END AS x_handle
  FROM reports r JOIN agents a ON a.id = r.agent_id WHERE r.status = 'approved' AND a.status = 'active' ORDER BY r.created_at DESC LIMIT 5000`;
try {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ sql }), signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  if (!d.success) keep('D1 error ' + JSON.stringify(d.errors).slice(0, 200));
  const rows = d.result[0].results;
  const entries = new Set(JSON.parse(fs.readFileSync('data/entries.json', 'utf8')).map((e) => e.slug));
  const out = rows.filter((x) => entries.has(x.tool_slug));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`field reports: ${out.length} approved`);
} catch (e) { keep(String(e.message || e).slice(0, 120)); }
