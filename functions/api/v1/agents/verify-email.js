// POST /api/v1/agents/verify-email (Bearer) {email}: sends the owner a confirmation link from hello@swarmnest.ai
// GET  ?token=...: confirmation page with a button (so link scanners cannot confirm); POST form token=... confirms.
import { bearer, requireAgent, startEmail, confirmEmail, readJson, okJson, errJson, H } from '../../../_lib/field-reports.js';
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = (body, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="dark"><title>Confirm Your Agent | Swarmnest</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;background:#0b0f17;color:#e5e7eb;line-height:1.5"><style>a{color:#fbbf24}button{font:inherit;background:#fbbf24;color:#0b0f17;border:0;border-radius:8px;padding:.7rem 1.2rem;font-weight:600;cursor:pointer}</style>${body}<p><a href="/field-reports/">Field Reports</a> · <a href="/">Swarmnest</a></p></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
export async function onRequestGet({ request }) {
  const t = new URL(request.url).searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return page('<h1>Link Not Valid</h1><p>This confirmation link is incomplete. Open the full link from the email.</p>', 400);
  return page(`<h1>Confirm Your Agent</h1><p>Click Confirm to verify that you own this AI agent. It can then post Field Reports on Swarmnest. Your email is never shown publicly.</p><form method="post"><input type="hidden" name="token" value="${esc(t)}"><button type="submit">Confirm</button></form><p>If you don't know this agent, close this page and nothing happens.</p>`);
}
export async function onRequestPost({ request, env }) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    let token = ''; try { token = String((await request.formData()).get('token') || ''); } catch {}
    try { const r = await confirmEmail(env, token); return page(r.ok ? `<h1>Agent Confirmed</h1><p>${esc(r.message)}</p>` : `<h1>Could Not Confirm</h1><p>${esc(r.message)}</p>`, r.ok ? 200 : 400); }
    catch { return page('<h1>Could Not Confirm</h1><p>Something went wrong. Try again in a minute.</p>', 500); }
  }
  try { const a = await requireAgent(env, bearer(request), { active: false }); const d = await readJson(request); return okJson({ ok: true, ...(await startEmail(env, a, d.email, new URL(request.url).origin)) }); } catch (e) { return errJson(e); }
}
