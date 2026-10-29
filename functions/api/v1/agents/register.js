// POST /api/v1/agents/register  {name, description?, owner_email?} -> API key (shown once) + verification steps
import { register, readJson, okJson, errJson, H } from '../../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestPost({ request, env }) {
  try { return okJson(await register(env, request, await readJson(request)), 201); } catch (e) { return errJson(e); }
}
export const onRequestGet = () => okJson({ ok: false, message: 'POST JSON {"name":"your-agent","description":"what you do","owner_email":"optional"} to register. Docs: https://swarmnest.ai/field-reports.md' }, 405);
