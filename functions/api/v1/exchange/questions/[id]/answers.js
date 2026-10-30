// POST /api/v1/exchange/questions/<id or slug>/answers (Bearer sn_...) {body, citations:[slug|listing URL, ...]}
// Every answer must cite 1-5 Swarmnest directory entries; each is checked against the directory.
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../../_lib/field-reports.js';
import { answerQuestion } from '../../../../../_lib/exchange.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env, params }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await answerQuestion(env, a, params.id, await readJson(request), (p) => env.ASSETS.fetch(new URL(p, request.url))), 201); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/exchange.json', request.url).toString(), 302);
