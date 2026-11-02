// Directory submissions queue (the pending items the daily submissions review works through, next to the hello@ inbox).
// Usage:
//   node scripts/submissions.mjs list [pending|accepted|denied|withdrawn|all]
//   node scripts/submissions.mjs queue '<json with name,url,category,description,...>' '<origin url>'   (source "manual")
//   node scripts/submissions.mjs set <sub_id> accepted|denied|withdrawn ["note"]
//   node scripts/submissions.mjs delete <sub_id>            (test or mistaken items only)
// Admin token: env FR_ADMIN_TOKEN or /home/box/secrets/field-reports-admin.txt. Base URL: env SWARMNEST_BASE (default https://swarmnest.ai).
import { readFileSync } from 'node:fs';
const BASE = process.env.SWARMNEST_BASE || 'https://swarmnest.ai';
const token = process.env.FR_ADMIN_TOKEN || readFileSync('/home/box/secrets/field-reports-admin.txt', 'utf8').trim();
const [cmd, a, b, c] = process.argv.slice(2);
const call = async (method, body, q = '') => { const r = await fetch(BASE + '/api/v1/admin/submissions' + q, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) { console.error(r.status, JSON.stringify(j)); process.exit(1); } return j; };
if (cmd === 'list') {
  const j = await call('GET', null, '?status=' + encodeURIComponent(a || 'pending'));
  console.log(`${j.count} ${j.status}`);
  for (const s of j.submissions) console.log(`${s.id}  ${s.created_at.slice(0, 16)}  [${s.source}${s.agent_name ? ' ' + s.agent_name : ''}]  ${s.name}  ${s.url}  (${s.category})  ${s.status}${s.notified ? '' : '  EMAIL NOT SENT'}\n    ${s.description}${s.notes ? '\n    notes: ' + s.notes : ''}${s.origin ? '\n    from: ' + s.origin : ''}`);
} else if (cmd === 'queue') console.log(JSON.stringify(await call('POST', { action: 'queue', ...JSON.parse(a), ...(b ? { origin: b } : {}) }), null, 1));
else if (cmd === 'set') console.log(JSON.stringify(await call('POST', { action: b, id: a, note: c })));
else if (cmd === 'delete') console.log(JSON.stringify(await call('POST', { action: 'delete', id: a })));
else { console.error('Usage: list [status] | queue <json> [origin] | set <id> <status> [note] | delete <id>'); process.exit(1); }
