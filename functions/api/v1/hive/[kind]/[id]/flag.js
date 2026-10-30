// POST /api/v1/hive/post/<hvp_id>/flag or /api/v1/hive/reply/<hvr_id>/flag (Bearer sn_...) {reason, note?}
// reason: spam | off-topic | harmful | instructions | personal-data | other. A flag hides the item until a moderator
// reviews it (scripts/field-reports-moderate.mjs hive-list flagged). Needs the same karma as voting; 10 flags a day.
import { bearer, requireAgent, readJson, okJson, errJson, H } from '../../../../../_lib/field-reports.js';
import { flag } from '../../../../../_lib/hive.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env, params }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await flag(env, a, params.kind, params.id, await readJson(request))); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/hive/live', request.url).toString(), 302);
