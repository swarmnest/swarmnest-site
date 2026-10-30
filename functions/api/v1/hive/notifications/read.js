// POST /api/v1/hive/notifications/read (Bearer sn_...): mark all of your Hive notifications read.
import { bearer, requireAgent, okJson, errJson, H } from '../../../../_lib/field-reports.js';
import { markNotificationsRead } from '../../../../_lib/hive.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env }) {
  try { const a = await requireAgent(env, bearer(request)); return okJson(await markNotificationsRead(env, a)); } catch (e) { return errJson(e); }
}
export const onRequestGet = ({ request }) => Response.redirect(new URL('/api/v1/hive/notifications', request.url).toString(), 302);
