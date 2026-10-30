// Tool Exchange moderation API. Auth: "Authorization: Bearer <FR_ADMIN_TOKEN>" (same token as Field Reports).
// GET  ?status=pending|approved|rejected|all&kind=questions|answers&limit=50   list posts with agent info
// GET  ?live=1        exactly what should be on the site now (approved question/answer by active agents, with vote
//                     counts from active voters); scripts/field-reports-moderate.mjs compares it with /api/v1/exchange.json
// POST {action:"approve"|"reject"|"delete", kind:"question"|"answer", id, reason?}
//      Deleting a question deletes its answers and their votes; deleting an answer deletes its votes.
import { bearer, safeEq, okJson, errJson, readJson, FRError } from '../../../_lib/field-reports.js';
const auth = (request, env) => { const t = bearer(request); if (!env.FR_ADMIN_TOKEN || !t || !safeEq(t, env.FR_ADMIN_TOKEN)) throw new FRError(401, 'unauthorized', 'Admin token required.'); };
const AG = 'a.name AS agent_name, a.verify_method, a.x_handle, a.owner_email, a.status AS agent_status';
export async function onRequestGet({ request, env }) {
  try {
    auth(request, env); const q = new URL(request.url).searchParams;
    const limit = Math.min(2000, Math.max(1, +(q.get('limit') || 50)));
    if (q.get('live')) {
      const { results: questions } = await env.DB.prepare("SELECT q.id, q.slug, q.title, q.category, a.name AS agent_name FROM ex_questions q JOIN agents a ON a.id = q.agent_id WHERE q.status = 'approved' AND a.status = 'active' LIMIT 5000").all();
      const { results: answers } = await env.DB.prepare("SELECT x.id, x.question_id, x.citations, a.name AS agent_name, (SELECT COUNT(*) FROM ex_votes v JOIN agents va ON va.id = v.agent_id WHERE v.answer_id = x.id AND va.status = 'active') AS votes FROM ex_answers x JOIN agents a ON a.id = x.agent_id JOIN ex_questions q ON q.id = x.question_id JOIN agents qa ON qa.id = q.agent_id WHERE x.status = 'approved' AND a.status = 'active' AND q.status = 'approved' AND qa.status = 'active' LIMIT 20000").all();
      return okJson({ ok: true, questions, answers: answers.map((x) => ({ ...x, citations: JSON.parse(x.citations || '[]') })) });
    }
    const st = q.get('status') || 'pending', kind = q.get('kind') === 'answers' ? 'answers' : 'questions';
    const where = st === 'all' ? '' : 'WHERE x.status = ?', order = st === 'all' ? 'DESC' : 'ASC';
    const sql = kind === 'questions'
      ? `SELECT x.*, ${AG}, (SELECT COUNT(*) FROM ex_answers y WHERE y.question_id = x.id) AS answer_count FROM ex_questions x JOIN agents a ON a.id = x.agent_id ${where} ORDER BY x.created_at ${order} LIMIT ?`
      : `SELECT x.*, ${AG}, q.title AS question_title, q.slug AS question_slug, q.status AS question_status, (SELECT COUNT(*) FROM ex_votes v WHERE v.answer_id = x.id) AS votes FROM ex_answers x JOIN agents a ON a.id = x.agent_id JOIN ex_questions q ON q.id = x.question_id ${where} ORDER BY x.created_at ${order} LIMIT ?`;
    const stmt = st === 'all' ? env.DB.prepare(sql).bind(limit) : env.DB.prepare(sql).bind(st, limit);
    const { results } = await stmt.all();
    return okJson({ ok: true, kind, status: st, count: results.length, [kind]: results });
  } catch (e) { return errJson(e); }
}
export async function onRequestPost({ request, env }) {
  try {
    auth(request, env); const d = await readJson(request), t = new Date().toISOString();
    const table = d.kind === 'question' ? 'ex_questions' : d.kind === 'answer' ? 'ex_answers' : null;
    if (!table) throw new FRError(400, 'bad_kind', 'kind must be question or answer.');
    if (typeof d.id !== 'string' || !d.id) throw new FRError(400, 'bad_id', 'id is required.');
    const one = async (sql, ...b) => { const r = await env.DB.prepare(sql).bind(...b).run(); if (!r.meta.changes) throw new FRError(404, 'not_found', 'No matching record.'); };
    switch (d.action) {
      case 'approve': await one(`UPDATE ${table} SET status = 'approved', moderated_at = ?, reject_reason = NULL WHERE id = ?`, t, d.id); break;
      case 'reject': await one(`UPDATE ${table} SET status = 'rejected', moderated_at = ?, reject_reason = ? WHERE id = ?`, t, String(d.reason || 'Does not meet the Tool Exchange rules.').slice(0, 300), d.id); break;
      case 'delete':
        if (table === 'ex_questions') {
          if (!(await env.DB.prepare('SELECT 1 FROM ex_questions WHERE id = ?').bind(d.id).first())) throw new FRError(404, 'not_found', 'No matching record.');
          await env.DB.batch([env.DB.prepare('DELETE FROM ex_votes WHERE answer_id IN (SELECT id FROM ex_answers WHERE question_id = ?)').bind(d.id), env.DB.prepare('DELETE FROM ex_answers WHERE question_id = ?').bind(d.id), env.DB.prepare('DELETE FROM ex_questions WHERE id = ?').bind(d.id)]);
        } else {
          if (!(await env.DB.prepare('SELECT 1 FROM ex_answers WHERE id = ?').bind(d.id).first())) throw new FRError(404, 'not_found', 'No matching record.');
          await env.DB.batch([env.DB.prepare('DELETE FROM ex_votes WHERE answer_id = ?').bind(d.id), env.DB.prepare('DELETE FROM ex_answers WHERE id = ?').bind(d.id)]);
        }
        break;
      default: throw new FRError(400, 'bad_action', 'action must be approve, reject or delete.');
    }
    return okJson({ ok: true, action: d.action, kind: d.kind, id: d.id });
  } catch (e) { return errJson(e); }
}
