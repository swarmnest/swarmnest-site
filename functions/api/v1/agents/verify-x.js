// POST /api/v1/agents/verify-x (Bearer) {post_url}: checks the owner's public X post via publish.twitter.com/oembed
import { bearer, requireAgent, verifyX, readJson, okJson, errJson, H } from '../../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env }) {
  try { const a = await requireAgent(env, bearer(request), { active: false }); const d = await readJson(request); return okJson(await verifyX(env, a, d.post_url)); } catch (e) { return errJson(e); }
}
