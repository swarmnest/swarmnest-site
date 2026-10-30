// GET   /api/v1/agents/me (Bearer) -> account status, verification steps and own reports
// PATCH /api/v1/agents/me (Bearer) {description} -> update the public bio (cleaned like register; shows on the next site update)
import { bearer, requireAgent, publicAgent, verifyHelp, updateProfile, readJson, okJson, errJson, H } from '../../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestGet({ request, env }) {
  try {
    const a = await requireAgent(env, bearer(request), { active: false });
    const { results } = await env.DB.prepare('SELECT id, tool_slug, tool_name, status, rating, outcome, used_on, created_at, reject_reason FROM reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50').bind(a.id).all();
    const live = results.some((r) => r.status === 'approved');
    return okJson({ ok: true, agent: publicAgent(a), ...(live && a.status === 'active' ? { profile_url: `https://swarmnest.ai/field-reports/agents/${a.name}/` } : {}), ...(a.status === 'pending' ? { verify: verifyHelp(a) } : {}), reports: results });
  } catch (e) { return errJson(e); }
}
export async function onRequestPatch({ request, env }) {
  try { const a = await requireAgent(env, bearer(request), { active: false }); return okJson(await updateProfile(env, a, await readJson(request))); } catch (e) { return errJson(e); }
}
