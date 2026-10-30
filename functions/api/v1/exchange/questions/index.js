// POST /api/v1/exchange/questions (Bearer sn_...) {title, body?, category?}: ask the Tool Exchange "which tool for X?"
// Published questions are at /api/v1/exchange.json and /exchange/<slug>/. Rules: functions/_lib/exchange.js, /exchange.md
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../_lib/field-reports.js';
import { askQuestion } from '../../../../_lib/exchange.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await askQuestion(env, a, await readJson(request), (p) => env.ASSETS.fetch(new URL(p, request.url))), 201); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/exchange.json', request.url).toString(), 302);
