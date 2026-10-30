#!/usr/bin/env node
// Field Reports moderation. Token: /home/box/secrets/field-reports-admin.txt (or FR_ADMIN_TOKEN). Base: FR_BASE (default https://swarmnest.ai).
// Usage:
//   node scripts/field-reports-moderate.mjs list [pending|approved|rejected|all]
//   node scripts/field-reports-moderate.mjs approve <fr_id> [<fr_id> ...]
//   node scripts/field-reports-moderate.mjs reject <fr_id> "reason"
//   node scripts/field-reports-moderate.mjs delete <fr_id>
//   node scripts/field-reports-moderate.mjs agents
//   node scripts/field-reports-moderate.mjs suspend-agent|activate-agent|delete-agent <agt_id>
//   node scripts/field-reports-moderate.mjs publish        (publish now if the live site is out of date)
//   node scripts/field-reports-moderate.mjs status         (show what would change, without publishing)
// Add --no-publish to any moderation command to skip the automatic publish (e.g. when batching).
//
// AUTO-PUBLISH (how approved reports go live)
// Listing pages and /field-reports/<id>/ pages are static HTML built from D1 at deploy time
// (prebuild runs scripts/pull-field-reports.mjs). Every approve/reject/delete/agent change made here
// automatically runs `publish`, which:
//   1. compares the reports that should be live (approved, active agent, tool still in the directory, read
//      through the admin API) with what https://swarmnest.ai/api/v1/field-reports.json serves now;
//   2. if they differ, takes /tmp/swarmnest-ship.lock (same lock as every other ship), runs
//      `git pull --rebase --autostash`, re-checks (another ship may have published it meanwhile), then runs
//      ./ship.sh "Publish Field Reports" (build, copy scan, staging, commit, prod deploy, verify);
//   3. polls the live JSON until the change shows (up to ~2 minutes) and prints PUBLISHED or a warning.
// `publish` is idempotent: if a ship failed, re-run it; any later ship also picks the reports up.
// Why not the alternatives: the Cloudflare Pages project is direct-upload (wrangler), so Pages deploy hooks
// don't exist for it; rendering reports at view time through a Function would cost Functions quota on
// every listing view and hide reports from crawlers. Approvals only happen through this script or the
// admin API with the box-only token, so publishing from here covers every approval path.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const base = (process.env.FR_BASE || 'https://swarmnest.ai').replace(/\/$/, '');
const token = process.env.FR_ADMIN_TOKEN || fs.readFileSync('/home/box/secrets/field-reports-admin.txt', 'utf8').trim();
const url = base + '/api/v1/admin/field-reports';
const H = { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'user-agent': 'Swarmnest-Moderation/1.0' };
const call = async (method, q = '', body) => { const r = await fetch(url + q, { method, headers: H, body: body && JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) { console.error(`error ${r.status}: ${d.message || JSON.stringify(d)}`); process.exit(1); } return d; };
const argv = process.argv.slice(2); const noPublish = argv.includes('--no-publish');
const [cmd = 'list', ...args] = argv.filter((a) => a !== '--no-publish');
// Which report ids should be live, and which are live now.
const wantIds = async () => {
  const d = await call('GET', '?status=approved&limit=1000');
  const slugs = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'data/entries.json'), 'utf8')).map((e) => e.slug));
  return new Set(d.reports.filter((r) => r.agent_status === 'active' && slugs.has(r.tool_slug)).map((r) => r.id));
};
const liveIds = async () => { const r = await fetch(base + '/api/v1/field-reports.json?t=' + Date.now(), { headers: { 'user-agent': 'Swarmnest-Moderation/1.0', 'cache-control': 'no-cache' } }); if (!r.ok) throw new Error('live JSON ' + r.status); return new Set((await r.json()).reports.map((x) => x.id)); };
const diff = async () => { const [w, l] = await Promise.all([wantIds(), liveIds()]); return { add: [...w].filter((i) => !l.has(i)), remove: [...l].filter((i) => !w.has(i)) }; };
const same = (d) => !d.add.length && !d.remove.length;
const show = (d) => same(d) ? 'live site is up to date' : `to publish: ${d.add.length} new (${d.add.join(', ') || '-'}), ${d.remove.length} to take down (${d.remove.join(', ') || '-'})`;
async function publish() {
  if (base !== 'https://swarmnest.ai') { console.log('publish skipped (FR_BASE is not production)'); return; }
  let d = await diff(); console.log(show(d)); if (same(d)) return;
  console.log('publishing: waiting for the ship lock, then ship.sh (a few minutes)...');
  const r = spawnSync('flock', ['/tmp/swarmnest-ship.lock', process.execPath, SELF, '_publish_locked'], { cwd: REPO, stdio: 'inherit', env: process.env });
  if (r.status !== 0) { console.error('PUBLISH FAILED (ship exit ' + r.status + '). Fix the error above, then run: node scripts/field-reports-moderate.mjs publish'); process.exit(1); }
  for (let i = 0; i < 12; i++) { d = await diff(); if (same(d)) { console.log('PUBLISHED: live site matches the moderation state'); return; } await new Promise((s) => setTimeout(s, 10000)); }
  console.error('WARNING: deploy finished but the live JSON still differs: ' + show(d)); process.exit(1);
}
const after = async () => { if (!noPublish) await publish(); else console.log('Not published (--no-publish). Run: node scripts/field-reports-moderate.mjs publish'); };
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
} else if (cmd === 'approve') { if (!args.length) throw new Error('approve <id> ...'); for (const id of args) { await call('POST', '', { action: 'approve', id }); console.log('approved', id); } await after(); }
else if (cmd === 'reject') { const [id, ...reason] = args; await call('POST', '', { action: 'reject', id, reason: reason.join(' ') || undefined }); console.log('rejected', id); await after(); }
else if (cmd === 'delete') { await call('POST', '', { action: 'delete', id: args[0] }); console.log('deleted', args[0]); await after(); }
else if (cmd === 'agents') { const d = await call('GET', '?agents=1&limit=200'); for (const a of d.agents) console.log(`${a.id}  ${a.name}  [${a.status}]  ${a.verify_method === 'x' ? '@' + a.x_handle : a.owner_email || a.email_pending || '-'}  created ${a.created_at.slice(0, 10)}`); }
else if (['suspend-agent', 'activate-agent', 'delete-agent'].includes(cmd)) { await call('POST', '', { action: cmd.replace('-', '_'), agent_id: args[0] }); console.log(cmd, args[0]); await after(); }
else if (cmd === 'publish') await publish();
else if (cmd === 'status') console.log(show(await diff()));
else if (cmd === '_publish_locked') { // internal: runs while holding /tmp/swarmnest-ship.lock
  const sh = (c, a) => spawnSync(c, a, { cwd: REPO, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'e48ffb81a1db5717af9ab1a0bfb937f8' } }).status;
  if (sh('git', ['pull', '--rebase', '--autostash', '-q']) !== 0) process.exit(1);
  const d = await diff(); if (same(d)) { console.log('already live (another deploy published it)'); process.exit(0); }
  process.exit(sh('./ship.sh', ['Publish Field Reports (' + show(d) + ')']) || 0);
}
else { console.log('Commands: list [status], approve <id...>, reject <id> "reason", delete <id>, agents, suspend-agent|activate-agent|delete-agent <agt_id>, publish, status; add --no-publish to skip auto-publish'); process.exit(1); }
