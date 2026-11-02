// Directory submissions queue (admin). Auth: "Authorization: Bearer <FR_ADMIN_TOKEN>" (same token as Field Reports).
// GET  ?status=pending|accepted|denied|withdrawn|all&limit=100   list queue items (pending first by age), with contact emails
// POST {action:"queue", origin, name, url, category, description, ...}   queue an item from another channel (source "manual";
//      sends the same notification email to hello@ as every other source)
// POST {action:"accepted"|"denied"|"withdrawn", id, note?}   record the review decision (does not touch the directory)
// POST {action:"delete", id}   remove a test or mistaken item entirely
// POST {action:"renotify", id}  resend the notification email for an item whose first email failed
import { bearer, safeEq, okJson, errJson, readJson, FRError, H } from '../../../_lib/field-reports.js';
import { submitListing, notify } from '../../../_lib/submissions.js';
const auth = (request, env) => { const t = bearer(request); if (!env.FR_ADMIN_TOKEN || !t || !safeEq(t, env.FR_ADMIN_TOKEN)) throw new FRError(401, 'unauthorized', 'Admin token required.'); };
export const onRequestOptions = () => new Response(null, { status: 204, headers: H });
export async function onRequestGet({ request, env }) {
  try {
    auth(request, env); const q = new URL(request.url).searchParams;
    const st = q.get('status') || 'pending', limit = Math.min(1000, Math.max(1, +(q.get('limit') || 100)));
    const cols = 'id, source, agent_id, agent_name, name, url, category, description, docs_url, pricing, auth, notes, contact_email, origin, status, decision_note, notified, created_at, decided_at';
    const { results } = st === 'all' ? await env.DB.prepare(`SELECT ${cols} FROM submissions ORDER BY created_at DESC LIMIT ?`).bind(limit).all()
      : await env.DB.prepare(`SELECT ${cols} FROM submissions WHERE status = ? ORDER BY created_at ASC LIMIT ?`).bind(st, limit).all();
    return okJson({ ok: true, status: st, count: results.length, submissions: results });
  } catch (e) { return errJson(e); }
}
export async function onRequestPost({ request, env }) {
  try {
    auth(request, env); const b = await readJson(request), action = String(b.action || '');
    if (action === 'queue') { const { action: _, origin, ...input } = b; return okJson(await submitListing(env, { source: 'manual', origin }, input, (p) => env.ASSETS.fetch(new URL(p, request.url))), 201); }
    const id = String(b.id || ''); const x = /^sub_[a-z0-9]{6,20}$/.test(id) ? await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first() : null;
    if (!x) throw new FRError(404, 'unknown_submission', `No submission "${id.slice(0, 40)}".`);
    if (action === 'delete') { await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run(); return okJson({ ok: true, deleted: id }); }
    if (action === 'renotify') return okJson({ ok: true, id, notified: await notify(env, x, null, undefined, '-r' + Date.now()) });
    if (!['accepted', 'denied', 'withdrawn'].includes(action)) throw new FRError(400, 'bad_action', 'action must be queue, accepted, denied, withdrawn, delete or renotify.');
    const t = new Date().toISOString();
    await env.DB.prepare('UPDATE submissions SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?').bind(action, String(b.note || '').slice(0, 300) || null, t, id).run();
    return okJson({ ok: true, id, status: action, decided_at: t });
  } catch (e) { return errJson(e); }
}
