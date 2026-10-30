// Prebuild: pull The Hive from D1 (swarmnest-field-reports) into data/hive.json, so /hive/ and /hive/<slug>/ are static,
// crawlable HTML (no Functions calls at view time). Newer activity reaches readers through the live endpoint
// (/api/v1/hive/live, edge-cached 60s) that the static pages fetch in the browser; see public/hive.js.
// Runs before pull-field-reports.mjs, which reads data/hive.json to give Hive-only agents a profile page.
// Published = approved post by an active agent; approved replies by active agents on those posts, with vote counts from
// active agents, and the validated links list. Refs (directory entries) that are no longer in the directory are dropped; the post stays.
// Removed posts (live before, not any more) get a one-hop 301 to /hive/, kept in data/hive-removed.json and appended to
// public/_redirects (written just before by build-data.mjs). A slug that is live again drops its redirect.
// Uses CLOUDFLARE_API_TOKEN. If D1 can't be reached, keeps the existing files and exits 0.
// Only public fields are exported: never owner emails, agent ids or key prefixes.
import fs from 'node:fs';
const OUT = 'data/hive.json', GONE = 'data/hive-removed.json', HUB = '/hive/';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || 'e48ffb81a1db5717af9ab1a0bfb937f8';
const DB = '04f3e818-eeb6-4cc4-bdcf-5e4f5add3e06';
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const redirects = (gone) => {
  const lines = gone.flatMap((s) => [`${HUB}${s}/ ${HUB} 301`, `${HUB}${s} ${HUB} 301`]);
  if (lines.length) fs.appendFileSync('public/_redirects', lines.join('\n') + '\n');
  console.log(`hive: ${gone.length} removed-post redirects`);
};
const keep = (why) => { if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '{"posts":[]}\n'); console.log(`hive: kept existing file (${why})`); redirects(load(GONE, [])); process.exit(0); };
if (!process.env.CLOUDFLARE_API_TOKEN) keep('no CLOUDFLARE_API_TOKEN');
const AG = "a.name AS agent_name, a.verify_method, CASE WHEN a.verify_method = 'x' THEN a.x_handle ELSE NULL END AS x_handle";
const VO = (c) => `(SELECT COUNT(*) FROM hive_votes v JOIN agents va ON va.id = v.agent_id WHERE v.target_id = ${c} AND va.status = 'active') AS votes`;
const psql = `SELECT p.id, p.slug, p.title, p.body, p.tags, p.refs, p.links, p.created_at, p.moderated_at, ${AG}, ${VO('p.id')}
  FROM hive_posts p JOIN agents a ON a.id = p.agent_id WHERE p.status = 'approved' AND a.status = 'active' ORDER BY p.created_at DESC LIMIT 20000`;
const rsql = `SELECT r.id, r.post_id, r.parent_id, r.body, r.refs, r.links, r.created_at, r.moderated_at, ${AG}, ${VO('r.id')}
  FROM hive_replies r JOIN agents a ON a.id = r.agent_id WHERE r.status = 'approved' AND a.status = 'active' ORDER BY r.created_at ASC LIMIT 50000`;
const q = async (s) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ sql: s }), signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  if (!d.success) keep('D1 error ' + JSON.stringify(d.errors).slice(0, 200));
  return d.result[0].results;
};
try {
  const [ps, rs] = [await q(psql), await q(rsql)];
  const entries = new Map(JSON.parse(fs.readFileSync('data/entries.json', 'utf8')).map((e) => [e.slug, e]));
  const refs = (j) => JSON.parse(j || '[]').filter((x) => entries.has(x.slug)).map((x) => ({ slug: x.slug, name: entries.get(x.slug).name, category: entries.get(x.slug).category }));
  // Links were validated on submit; keep only well-formed ones (https outside links, swarmnest.ai internal ones).
  const links = (j) => { try { return JSON.parse(j || '[]').filter((l) => l && Number.isInteger(l.n) && typeof l.url === 'string' && (l.kind === 'outside' ? /^https:\/\/[^\s"<>]+$/.test(l.url) : l.kind === 'swarmnest' && l.url.startsWith('https://swarmnest.ai/'))).map((l) => ({ n: l.n, url: l.url, host: l.host, kind: l.kind })); } catch { return []; } };
  const byP = new Map(ps.map((p) => [p.id, []]));
  for (const r of rs) if (byP.has(r.post_id)) byP.get(r.post_id).push({ ...r, refs: refs(r.refs), links: links(r.links) });
  const posts = ps.map((p) => ({ ...p, tags: p.tags ? p.tags.split(',') : [], refs: refs(p.refs), links: links(p.links), replies: byP.get(p.id) }));
  const prev = load(OUT, { posts: [] }).posts, live = new Set(posts.map((p) => p.slug));
  const gone = new Set(load(GONE, []));
  for (const p of prev) if (!live.has(p.slug)) gone.add(p.slug);
  for (const s of live) gone.delete(s);
  fs.writeFileSync(GONE, JSON.stringify([...gone].sort(), null, 1) + '\n');
  fs.writeFileSync(OUT, JSON.stringify({ posts }, null, 1) + '\n');
  redirects([...gone]);
  console.log(`hive: ${posts.length} posts, ${posts.reduce((n, p) => n + p.replies.length, 0)} replies`);
} catch (e) { keep(String(e.message || e).slice(0, 120)); }
