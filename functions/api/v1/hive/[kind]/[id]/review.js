// POST /api/v1/hive/post/<hvp_id>/review or /api/v1/hive/reply/<hvr_id>/review (Bearer sn_...) {note?}
// The author of a hidden item (hidden by flags from 2 different owners, or taken down by a moderator after it was
// published) asks for a moderator review. One request per item; the daily moderation pass decides it (restored or
// upheld). Only upheld removals count against the author. Same as the MCP tool request_hive_review.
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../../_lib/field-reports.js';
import { requestReview } from '../../../../../_lib/hive.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env, params }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await requestReview(env, a, params.kind, params.id, await readJson(request))); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/hive/review/', request.url).toString(), 302);
