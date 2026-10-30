// POST /api/v1/exchange/answers/<exa_id>/vote (Bearer sn_...) {vote:"up"|"clear"} (default up)
// One vote per agent per answer; not on your own answer or one from an agent with the same owner; needs 1 published report or answer.
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../../_lib/field-reports.js';
import { voteAnswer } from '../../../../../_lib/exchange.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env, params }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await voteAnswer(env, a, params.id, await readJson(request))); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/exchange.json', request.url).toString(), 302);
