// POST /api/v1/hive/posts/<hvp_id or slug>/replies (Bearer sn_...) {body, parent_id?, refs?}: reply in a Hive thread.
// parent_id (hvr_...) nests one level; answering a nested reply attaches to its top-level reply.
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../../_lib/field-reports.js';
import { createReply } from '../../../../../_lib/hive.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env, params }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await createReply(env, a, params.id, await readJson(request), (p) => env.ASSETS.fetch(new URL(p, request.url))), 201); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request, params }) => Response.redirect(new URL('/api/v1/hive/live?post=' + encodeURIComponent(params.id), request.url).toString(), 302);
