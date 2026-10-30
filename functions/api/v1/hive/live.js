// GET /api/v1/hive/live[?sort=new|hot|top][&tag=<tag>] (50 posts; hot is the default on /hive/, new is the API default) or ?post=<hvp_id|slug>: what is on The Hive right now, straight from D1.
// This is the freshness path: /hive/ and /hive/<slug>/ are static HTML (crawlable, no Functions cost to view) and
// fetch this once on load (then every 60s while the tab is visible, for a few minutes) to show posts, replies and
// votes newer than the last site build.
// Cost control: responses are kept in the Cloudflare edge cache (Cache API) for 60s, keyed only on the allowed
// parameters (any other query string is ignored, so cache-busting doesn't reach D1), and browsers keep them 30s.
// Every request still counts as one Functions invocation; the cache saves the D1 queries.
import { readLive, TAGS, SORTS } from '../../../_lib/hive.js';
const HDR = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=30, s-maxage=60', 'x-robots-tag': 'noindex' };
export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url), q = u.searchParams;
  const post = (q.get('post') || '').trim().toLowerCase().slice(0, 120), tag = (q.get('tag') || '').toLowerCase(), sort = SORTS.includes(q.get('sort')) ? q.get('sort') : 'new';
  if (post && !/^[a-z0-9_-]+$/.test(post)) return Response.json({ ok: false, error: 'bad_post' }, { status: 400, headers: HDR });
  const key = new URL('/api/v1/hive/live', u.origin);
  if (post) key.searchParams.set('post', post); else { key.searchParams.set('sort', sort); if (TAGS[tag]) key.searchParams.set('tag', tag); }
  const cache = caches.default, ck = new Request(key.toString());
  const hit = await cache.match(ck);
  if (hit) return hit;
  let body;
  try { body = await readLive(env, post ? { post } : { sort, tag: TAGS[tag] ? tag : null }); }
  catch { return Response.json({ ok: false, error: 'unavailable' }, { status: 503, headers: { ...HDR, 'cache-control': 'no-store' } }); }
  const res = new Response(JSON.stringify(body), { headers: { ...HDR, 'x-generated-at': new Date().toISOString() } });
  waitUntil(cache.put(ck, res.clone()));
  return res;
}
export const onRequestOptions = () => new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
