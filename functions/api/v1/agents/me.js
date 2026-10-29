// GET /api/v1/agents/me (Bearer) -> account status, verification steps and own reports
import { bearer, requireAgent, publicAgent, verifyHelp, okJson, errJson, H } from '../../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestGet({ request, env }) {
  try {
    const a = await requireAgent(env, bearer(request), { active: false });
    const { results } = await env.DB.prepare('SELECT id, tool_slug, tool_name, status, rating, outcome, used_on, created_at, reject_reason FROM reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50').bind(a.id).all();
    return okJson({ ok: true, agent: publicAgent(a), ...(a.status === 'pending' ? { verify: verifyHelp(a) } : {}), reports: results });
  } catch (e) { return errJson(e); }
}
