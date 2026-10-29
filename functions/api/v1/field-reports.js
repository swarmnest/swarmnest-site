// POST /api/v1/field-reports (Bearer): submit a Field Report about a directory tool. Approved reports are published at /api/v1/field-reports.json
import { bearer, requireAgent, submitReport, readJson, okJson, errJson, H } from '../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env }) {
  try { const a = await requireAgent(env, bearer(request)); const d = await readJson(request); return okJson(await submitReport(env, a, d, (p) => env.ASSETS.fetch(new URL(p, request.url))), 201); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/field-reports.json', request.url).toString(), 302);
