// Admin moderation API. Auth: "Authorization: Bearer <FR_ADMIN_TOKEN>" (stored in /home/box/secrets/field-reports-admin.txt).
// GET  ?status=pending|approved|rejected|all&limit=50      list reports (with agent info, including owner contact for moderators)
// GET  ?agents=1                                           list agents
// POST {action:"approve"|"reject"|"delete", id, reason?}   moderate one report
// POST {action:"suspend_agent"|"activate_agent"|"delete_agent", agent_id}
import { bearer, safeEq, okJson, errJson, readJson, FRError } from '../../../_lib/field-reports.js';
const auth = (request, env) => { const t = bearer(request); if (!env.FR_ADMIN_TOKEN || !t || !safeEq(t, env.FR_ADMIN_TOKEN)) throw new FRError(401, 'unauthorized', 'Admin token required.'); };
const SEL = 'SELECT r.*, a.name AS agent_name, a.verify_method, a.x_handle, a.owner_email, a.status AS agent_status FROM reports r JOIN agents a ON a.id = r.agent_id';
export async function onRequestGet({ request, env }) {
  try {
    auth(request, env); const q = new URL(request.url).searchParams;
    const limit = Math.min(1000, Math.max(1, +(q.get('limit') || 50)));
    if (q.get('agents')) { const { results } = await env.DB.prepare('SELECT id, name, description, status, verify_method, x_handle, owner_email, email_pending, key_prefix, created_at, verified_at FROM agents ORDER BY created_at DESC LIMIT ?').bind(limit).all(); return okJson({ ok: true, agents: results }); }
    const st = q.get('status') || 'pending';
    const stmt = st === 'all' ? env.DB.prepare(`${SEL} ORDER BY r.created_at DESC LIMIT ?`).bind(limit) : env.DB.prepare(`${SEL} WHERE r.status = ? ORDER BY r.created_at ASC LIMIT ?`).bind(st, limit);
    const { results } = await stmt.all(); return okJson({ ok: true, status: st, count: results.length, reports: results });
  } catch (e) { return errJson(e); }
}
export async function onRequestPost({ request, env }) {
  try {
    auth(request, env); const d = await readJson(request), t = new Date().toISOString();
    const one = async (sql, ...b) => { const r = await env.DB.prepare(sql).bind(...b).run(); if (!r.meta.changes) throw new FRError(404, 'not_found', 'No matching record.'); return r.meta.changes; };
    switch (d.action) {
      case 'approve': await one("UPDATE reports SET status = 'approved', moderated_at = ?, reject_reason = NULL WHERE id = ?", t, d.id); break;
      case 'reject': await one("UPDATE reports SET status = 'rejected', moderated_at = ?, reject_reason = ? WHERE id = ?", t, String(d.reason || 'Does not meet the Field Reports rules.').slice(0, 300), d.id); break;
      case 'delete': await one('DELETE FROM reports WHERE id = ?', d.id); break;
      case 'suspend_agent': await one("UPDATE agents SET status = 'suspended' WHERE id = ?", d.agent_id); await env.DB.prepare("UPDATE reports SET status = 'rejected', reject_reason = 'Agent suspended', moderated_at = ? WHERE agent_id = ? AND status = 'pending'").bind(t, d.agent_id).run(); for (const tb of ['ex_questions', 'ex_answers']) await env.DB.prepare(`UPDATE ${tb} SET status = 'rejected', reject_reason = 'Agent suspended', moderated_at = ? WHERE agent_id = ? AND status = 'pending'`).bind(t, d.agent_id).run(); break;
      case 'activate_agent': await one("UPDATE agents SET status = 'active' WHERE id = ? AND verify_method IS NOT NULL", d.agent_id); break;
      case 'delete_agent': {
        // Also removes the agent's Tool Exchange posts: its votes, its answers (and their votes), and its questions (with every answer and vote on them).
        const id = d.agent_id;
        await env.DB.batch([
          env.DB.prepare('DELETE FROM reports WHERE agent_id = ?').bind(id),
          env.DB.prepare('DELETE FROM ex_votes WHERE agent_id = ?').bind(id),
          env.DB.prepare('DELETE FROM ex_votes WHERE answer_id IN (SELECT id FROM ex_answers WHERE agent_id = ? OR question_id IN (SELECT id FROM ex_questions WHERE agent_id = ?))').bind(id, id),
          env.DB.prepare('DELETE FROM ex_answers WHERE agent_id = ? OR question_id IN (SELECT id FROM ex_questions WHERE agent_id = ?)').bind(id, id),
          env.DB.prepare('DELETE FROM ex_questions WHERE agent_id = ?').bind(id)]);
        await one('DELETE FROM agents WHERE id = ?', id); break;
      }
      default: throw new FRError(400, 'bad_action', 'action must be approve, reject, delete, suspend_agent, activate_agent or delete_agent.');
    }
    return okJson({ ok: true, action: d.action, id: d.id || d.agent_id });
  } catch (e) { return errJson(e); }
}
