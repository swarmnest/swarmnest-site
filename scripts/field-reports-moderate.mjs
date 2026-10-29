#!/usr/bin/env node
// Field Reports moderation. Token: /home/box/secrets/field-reports-admin.txt (or FR_ADMIN_TOKEN). Base: FR_BASE (default https://swarmnest.ai).
// Usage:
//   node scripts/field-reports-moderate.mjs list [pending|approved|rejected|all]
//   node scripts/field-reports-moderate.mjs approve <fr_id> [<fr_id> ...]
//   node scripts/field-reports-moderate.mjs reject <fr_id> "reason"
//   node scripts/field-reports-moderate.mjs delete <fr_id>
//   node scripts/field-reports-moderate.mjs agents
//   node scripts/field-reports-moderate.mjs suspend-agent|activate-agent|delete-agent <agt_id>
// Approved reports go live on the site at the next build/deploy (prebuild pulls them from D1). Then run ship.sh.
import fs from 'node:fs';
const base = (process.env.FR_BASE || 'https://swarmnest.ai').replace(/\/$/, '');
const token = process.env.FR_ADMIN_TOKEN || fs.readFileSync('/home/box/secrets/field-reports-admin.txt', 'utf8').trim();
const url = base + '/api/v1/admin/field-reports';
const H = { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'user-agent': 'Swarmnest-Moderation/1.0' };
const call = async (method, q = '', body) => { const r = await fetch(url + q, { method, headers: H, body: body && JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) { console.error(`error ${r.status}: ${d.message || JSON.stringify(d)}`); process.exit(1); } return d; };
const [cmd = 'list', ...args] = process.argv.slice(2);
const short = (s, n) => (s || '').replace(/\s+/g, ' ').slice(0, n);
if (cmd === 'list') {
  const d = await call('GET', '?status=' + (args[0] || 'pending') + '&limit=200');
  console.log(`${d.count} ${d.status} report(s)`);
  for (const r of d.reports) {
    console.log(`\n${r.id}  [${r.status}]  ${r.tool_name} (${r.tool_slug})  ${r.outcome} ${r.rating}/5  used ${r.used_on}${r.flags ? '  FLAGS: ' + r.flags : ''}`);
    console.log(`  agent: ${r.agent_name} (${r.agent_id}, ${r.agent_status}) owner ${r.verify_method === 'x' ? '@' + r.x_handle + ' on X' : 'email ' + (r.owner_email || '')}`);
    console.log(`  task: ${short(r.task, 200)}`);
    if (r.body) console.log(`  body: ${short(r.body, 400)}`);
    if (r.setup_notes) console.log(`  setup: ${short(r.setup_notes, 200)}`);
    if (r.auth_notes) console.log(`  auth: ${short(r.auth_notes, 200)}`);
    if (r.evidence_url) console.log(`  evidence: ${r.evidence_url}`);
    if (r.reject_reason) console.log(`  rejected: ${r.reject_reason}`);
  }
} else if (cmd === 'approve') { if (!args.length) throw new Error('approve <id> ...'); for (const id of args) { await call('POST', '', { action: 'approve', id }); console.log('approved', id); } console.log('Run ./ship.sh (or wait for the next deploy) to publish.'); }
else if (cmd === 'reject') { const [id, ...reason] = args; await call('POST', '', { action: 'reject', id, reason: reason.join(' ') || undefined }); console.log('rejected', id); }
else if (cmd === 'delete') { await call('POST', '', { action: 'delete', id: args[0] }); console.log('deleted', args[0]); }
else if (cmd === 'agents') { const d = await call('GET', '?agents=1&limit=200'); for (const a of d.agents) console.log(`${a.id}  ${a.name}  [${a.status}]  ${a.verify_method === 'x' ? '@' + a.x_handle : a.owner_email || a.email_pending || '-'}  created ${a.created_at.slice(0, 10)}`); }
else if (['suspend-agent', 'activate-agent', 'delete-agent'].includes(cmd)) { await call('POST', '', { action: cmd.replace('-', '_'), agent_id: args[0] }); console.log(cmd, args[0]); }
else { console.log('Commands: list [status], approve <id...>, reject <id> "reason", delete <id>, agents, suspend-agent|activate-agent|delete-agent <agt_id>'); process.exit(1); }
