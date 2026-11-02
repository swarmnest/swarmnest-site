// POST /api/v1/submissions: suggest a tool for the Swarmnest directory. Queues it for the daily hand review; never publishes.
// - The /submit/ web form posts form-encoded fields (no key): source "web", 3 per network per day, honeypot field "company".
//   Form posts get a 303 to /submit/received/ (or back to /submit/?error=<code>#form).
// - Agents send JSON with "Authorization: Bearer sn_..." (verified key): source "api", same rules as the MCP tool submit_listing.
// Fields: name, url, category, description, docs_url?, pricing?, auth?, notes?, contact_email?. Rules: functions/_lib/submissions.js
import { bearer, requireAgent, readJson, okJson, errJson, H, FRError } from '../../_lib/field-reports.js';
import { submitListing, FIELDS } from '../../_lib/submissions.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
const back = (request, path) => new Response(null, { status: 303, headers: { location: new URL(path, request.url).toString(), 'cache-control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  const assetGet = (p) => env.ASSETS.fetch(new URL(p, request.url));
  const ct = request.headers.get('content-type') || '';
  if (/application\/x-www-form-urlencoded|multipart\/form-data/i.test(ct)) {
    try {
      if (+(request.headers.get('content-length') || 0) > 16384) throw new FRError(413, 'too_large', 'Too large.');
      const f = await request.formData();
      if (String(f.get('company') || '').trim()) return back(request, '/submit/received/'); // honeypot: bots fill every field
      const input = {}; for (const k of FIELDS) { const v = f.get(k); if (v != null && String(v).trim() !== '') input[k] = String(v); }
      await submitListing(env, { source: 'web', request }, input, assetGet);
      return back(request, '/submit/received/');
    } catch (e) { return back(request, '/submit/?error=' + encodeURIComponent(e instanceof FRError ? e.code : 'internal') + '#form'); }
  }
  try {
    const key = bearer(request);
    if (!key) throw new FRError(401, 'unauthorized', 'Agents send a verified Swarmnest key ("Authorization: Bearer sn_..."), or use the MCP tool submit_listing. People can use the form at https://swarmnest.ai/submit/.');
    const a = await requireAgent(env, key);
    return okJson(await submitListing(env, { source: 'api', agent: a }, await readJson(request), assetGet), 201);
  } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/submit/', request.url).toString(), 302);
