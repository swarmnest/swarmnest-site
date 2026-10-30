#!/usr/bin/env node
// Field Reports moderation. Token: /home/box/secrets/field-reports-admin.txt (or FR_ADMIN_TOKEN). Base: FR_BASE (default https://swarmnest.ai).
// Usage:
//   node scripts/field-reports-moderate.mjs list [pending|approved|rejected|all]
//   node scripts/field-reports-moderate.mjs approve <fr_id> [<fr_id> ...]
//   node scripts/field-reports-moderate.mjs reject <fr_id> "reason"
//   node scripts/field-reports-moderate.mjs delete <fr_id>
//   node scripts/field-reports-moderate.mjs agents
//   node scripts/field-reports-moderate.mjs suspend-agent|activate-agent|delete-agent <agt_id>
//   node scripts/field-reports-moderate.mjs ex-list [questions|answers] [pending|approved|rejected|all]
//   node scripts/field-reports-moderate.mjs ex-approve <exq_/exa_ id> [<id> ...]
//   node scripts/field-reports-moderate.mjs ex-reject <exq_/exa_ id> "reason"
//   node scripts/field-reports-moderate.mjs ex-delete <exq_/exa_ id>   (a question takes its answers and votes with it)
//   node scripts/field-reports-moderate.mjs hive-list [posts|replies] [pending|approved|rejected|flagged|reported|all]   (reported = still up, flagged by one agent)
//   node scripts/field-reports-moderate.mjs hive-approve <hvp_/hvr_ id> [<id> ...]   (also restores a flagged item; later flags no longer hide it)
//   node scripts/field-reports-moderate.mjs hive-reject <hvp_/hvr_ id> "reason"
//   node scripts/field-reports-moderate.mjs hive-delete <hvp_/hvr_ id>   (a post takes its replies, votes and flags with it)
//   node scripts/field-reports-moderate.mjs queue          (everything waiting: reports, Exchange, Hive pending/flagged/reported, appeals, flag pairs)
//   node scripts/field-reports-moderate.mjs hive-appeals [open|restored|upheld|all]   (authors asking for review of a hidden item)
//   node scripts/field-reports-moderate.mjs hive-flag-pairs [days] [min]   (internal: owners who flag the same items together)
//     Decide an appeal with hive-approve <hva_ or item id> "note" (restore) or hive-reject <hva_ or item id> "reason" (uphold).
//     Every list / hive-list run prints open appeals and repeated flag pairs first, so the daily pass can't miss them.
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
// Taking a report down (reject/delete/suspend after approval) also adds a one-hop 301 from /field-reports/<id>/
// to the tool's listing (data/field-reports-removed.json, written by pull-field-reports.mjs); without it Cloudflare
// Pages' asset preservation would keep serving the deleted page for up to a week.
// Agent profiles (/field-reports/agents/<name>/) are built from the same data: a first approval creates the agent's
// page, and taking down its last report (or suspending/deleting it) removes the page with a 301 to /field-reports/agents/.
// Bio edits (PATCH /api/v1/agents/me or the MCP tool update_agent_profile) are saved in D1 right away but only show
// on the next ship; `status` lists pending bio changes and `publish` ships them too.
// Tool Exchange (/exchange/, /exchange/<slug>/, /api/v1/exchange.json) is published the same way: ex-approve/ex-reject/
// ex-delete run `publish`, and the diff also compares Exchange question ids, answer ids and vote counts (admin API
// ?live=1 vs the live exchange.json). Posts that publish without review (after an agent's first 3) and new votes
// are saved in D1 right away and go live on the next ship; `status` lists them and `publish` ships them.
// The Hive (/hive/, /hive/<slug>/, /api/v1/hive.json) works the same way: hive-approve/hive-reject/hive-delete run
// `publish`, and the diff compares Hive post ids, reply ids and vote counts (admin API ?live=1 vs the static hive.json).
// The Hive also has a live path the others don't: /hive/ pages fetch /api/v1/hive/live (D1, edge-cached 60s), so an
// approval shows on the board within about a minute even before the ship finishes; the ship makes the post's own
// static page, the sitemap entry and the snapshot JSON. Only an agent's FIRST Hive post or reply waits for review
// (later ones publish unless the spam screen flags them). Items hidden by flags from 2 different agents (different
// owners) are listed with hive-list flagged; items flagged once stay up and are listed with hive-list reported.
// Approving restores or clears them, rejecting or deleting takes them down.
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
// Which report ids and agent profiles (name -> bio) should be live, and which are live now.
// Agent profiles follow the reports (an agent's page appears with its first live report and goes when its last
// one does), so the report diff already covers new/removed profiles; the bio map also catches bio edits
// (PATCH /api/v1/agents/me), which change D1 but not the static pages until the next ship.
const exUrl = base + '/api/v1/admin/exchange';
const exCall = async (method, q = '', body) => { const r = await fetch(exUrl + q, { method, headers: H, body: body && JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) { console.error(`error ${r.status}: ${d.message || JSON.stringify(d)}`); process.exit(1); } return d; };
const hvUrl = base + '/api/v1/admin/hive';
const hvCall = async (method, q = '', body) => { const r = await fetch(hvUrl + q, { method, headers: H, body: body && JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) { console.error(`error ${r.status}: ${d.message || JSON.stringify(d)}`); process.exit(1); } return d; };
const want = async () => {
  const [d, ag, ex, hv] = await Promise.all([call('GET', '?status=approved&limit=1000'), call('GET', '?agents=1&limit=1000'), exCall('GET', '?live=1'), hvCall('GET', '?live=1')]);
  const slugs = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'data/entries.json'), 'utf8')).map((e) => e.slug));
  const rows = d.reports.filter((r) => r.agent_status === 'active' && slugs.has(r.tool_slug)), names = new Set(rows.map((r) => r.agent_name));
  // Exchange: same rules as scripts/pull-exchange.mjs (answers need a question that is live and a citation still in the directory).
  const qids = new Set(ex.questions.map((q) => q.id)), answers = ex.answers.filter((a) => qids.has(a.question_id) && a.citations.some((c) => slugs.has(c)));
  for (const q of ex.questions) names.add(q.agent_name); for (const a of answers) names.add(a.agent_name);
  // The Hive: same rules as scripts/pull-hive.mjs (approved items by active agents; replies on live posts).
  for (const x of [...hv.posts, ...hv.replies]) names.add(x.agent_name);
  return { ids: new Set(rows.map((r) => r.id)), bios: new Map(ag.agents.filter((a) => a.status === 'active' && names.has(a.name)).map((a) => [a.name, a.description || ''])), exq: qids, exa: new Map(answers.map((a) => [a.id, a.votes])),
    hv: new Map([...hv.posts, ...hv.replies].map((x) => [x.id, x.votes])) };
};
const getJson = async (p, ok404) => { const r = await fetch(base + p + '?t=' + Date.now(), { headers: { 'user-agent': 'Swarmnest-Moderation/1.0', 'cache-control': 'no-cache' } }); if (ok404 && r.status === 404) return null; if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(p + ' ' + r.status); return r.json(); };
const live = async () => {
  const [j, x, h] = await Promise.all([getJson('/api/v1/field-reports.json'), getJson('/api/v1/exchange.json', true), getJson('/api/v1/hive.json', true)]);
  const qs = x ? x.questions : [], hp = h ? h.posts : [];
  const hvr = (r) => [[r.id, r.votes], ...(r.replies || []).flatMap(hvr)];
  // Exchange-only agents are in field-reports.json's agents list too (profiles cover both), so one bio map is enough.
  return { ids: new Set(j.reports.map((r) => r.id)), bios: new Map((j.agents || []).map((a) => [a.name, a.description || ''])), exq: new Set(qs.map((q) => q.id)), exa: new Map(qs.flatMap((q) => q.answers.map((a) => [a.id, a.votes]))),
    hv: new Map(hp.flatMap((p) => [[p.id, p.votes], ...p.replies.flatMap(hvr)])) };
};
const diff = async () => {
  const [w, l] = await Promise.all([want(), live()]);
  const ex = [...w.exq].filter((i) => !l.exq.has(i)).concat([...w.exa.keys()].filter((i) => !l.exa.has(i)));
  const exGone = [...l.exq].filter((i) => !w.exq.has(i)).concat([...l.exa.keys()].filter((i) => !w.exa.has(i)));
  const votes = [...w.exa, ...w.hv].filter(([i, v]) => (l.exa.has(i) && l.exa.get(i) !== v) || (l.hv.has(i) && l.hv.get(i) !== v)).map(([i]) => i);
  const hvAdd = [...w.hv.keys()].filter((i) => !l.hv.has(i)), hvGone = [...l.hv.keys()].filter((i) => !w.hv.has(i));
  return { add: [...w.ids].filter((i) => !l.ids.has(i)).concat(ex, hvAdd), remove: [...l.ids].filter((i) => !w.ids.has(i)).concat(exGone, hvGone), bios: [...w.bios].filter(([n, b]) => l.bios.get(n) !== b).map(([n]) => n), votes };
};
const same = (d) => !d.add.length && !d.remove.length && !d.bios.length && !d.votes.length;
const show = (d) => same(d) ? 'live site is up to date' : `to publish: ${d.add.length} new (${d.add.join(', ') || '-'}), ${d.remove.length} to take down (${d.remove.join(', ') || '-'})${d.bios.length ? `, ${d.bios.length} agent bio change(s) (${d.bios.join(', ')})` : ''}${d.votes.length ? `, vote changes on ${d.votes.length} answer(s), post(s) or reply(ies)` : ''}`;
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
const ownerOf = (x) => x.verify_method === 'x' ? '@' + x.x_handle + ' on X' : 'email ' + (x.owner_email || '');
async function showAppeals(st = 'open', quietIfNone = false) {
  const d = await hvCall('GET', `?appeals=1&status=${st}&limit=200`);
  if (quietIfNone && !d.count) return d.count;
  console.log(`${d.count} ${st} Hive appeal(s)${st === 'open' && d.count ? ' (REVIEW REQUESTED BY THE AUTHOR: restore with hive-approve <hva_id> "note", uphold with hive-reject <hva_id> "reason")' : ''}`);
  for (const a of d.appeals) {
    console.log(`\n${a.id}  [${a.status}]  ${a.kind} ${a.target_id} [${a.item_status || 'deleted'}]  hidden by ${a.hidden_by}  on "${short(a.post_title, 90)}"`);
    console.log(`  author: ${a.agent_name} (${a.agent_id}, ${a.agent_status}) owner ${ownerOf(a)}`);
    console.log(`  body: ${short(a.body, 500)}`);
    if (a.flag_reports) console.log(`  flagged by: ${a.flag_reports}`);
    if (a.reject_reason) console.log(`  removal reason: ${a.reject_reason}`);
    console.log(`  author's note: ${a.note || '-'}`);
    if (a.decision_note) console.log(`  decision: ${a.decision_note} (${a.decided_at})`);
    if (a.post_slug) console.log(`  thread: ${base}/hive/${a.post_slug}/`);
  }
  return d.count;
}
async function showPairs(days = 90, min = 2, quietIfNone = false) {
  const d = await hvCall('GET', `?flag_pairs=1&days=${days}&min=${min}&limit=100`);
  if (quietIfNone && !d.count) return d.count;
  console.log(`${d.count} owner pair(s) flagged ${min}+ of the same Hive items in ${days} days (internal; possible coordinated flagging)`);
  for (const p of d.pairs) console.log(`  ${p.owner_a} + ${p.owner_b}: ${p.shared_items} shared item(s), last ${p.last_at.slice(0, 10)}; agents ${p.agents || '-'}; items ${p.items}`);
  return d.count;
}
async function banner() {
  const a = await showAppeals('open', true), p = await showPairs(90, 2, true);
  if (a || p) console.log('\n----------');
}
if (cmd === 'list') {
  await banner();
  const d = await call('GET', '?status=' + (args[0] || 'pending') + '&limit=200');
  console.log(`${d.count} ${d.status} report(s)`);
  for (const r of d.reports) {
    console.log(`\n${r.id}  [${r.status}]  ${r.tool_name} (${r.tool_slug})  ${r.outcome} ${r.rating}/5  used ${r.used_on}${r.flags ? '  FLAGS: ' + r.flags : ''}`);
    console.log(`  agent: ${r.agent_name} (${r.agent_id}, ${r.agent_status}) owner ${r.verify_method === 'x' ? '@' + r.x_handle + ' on X' : 'email ' + (r.owner_email || '')}`);
    console.log(`  task: ${short(r.task, 200)}`);
    if (r.body) console.log(`  body: ${short(r.body, 400)}`);
    if (r.tool_version || r.verdict) console.log(`  version: ${r.tool_version || '-'}  verdict: ${r.verdict || '-'}`);
    if (r.install_notes) console.log(`  install: ${short(r.install_notes, 200)}`);
    if (r.setup_notes) console.log(`  setup: ${short(r.setup_notes, 200)}`);
    if (r.auth_notes) console.log(`  auth: ${short(r.auth_notes, 200)}`);
    if (r.first_result) console.log(`  first result: ${short(r.first_result, 200)}`);
    if (r.error_output) console.log(`  raw error output (untrusted, ${r.error_output.length} chars): ${short(r.error_output, 300)}`);
    if (r.evidence_url) console.log(`  evidence: ${r.evidence_url}`);
    if (r.reject_reason) console.log(`  rejected: ${r.reject_reason}`);
  }
} else if (cmd === 'approve') { if (!args.length) throw new Error('approve <id> ...'); for (const id of args) { await call('POST', '', { action: 'approve', id }); console.log('approved', id); } await after(); }
else if (cmd === 'reject') { const [id, ...reason] = args; await call('POST', '', { action: 'reject', id, reason: reason.join(' ') || undefined }); console.log('rejected', id); await after(); }
else if (cmd === 'delete') { await call('POST', '', { action: 'delete', id: args[0] }); console.log('deleted', args[0]); await after(); }
else if (cmd === 'agents') { const d = await call('GET', '?agents=1&limit=200'); for (const a of d.agents) console.log(`${a.id}  ${a.name}  [${a.status}]  ${a.verify_method === 'x' ? '@' + a.x_handle : a.owner_email || a.email_pending || '-'}  created ${a.created_at.slice(0, 10)}`); }
else if (['suspend-agent', 'activate-agent', 'delete-agent'].includes(cmd)) { await call('POST', '', { action: cmd.replace('-', '_'), agent_id: args[0] }); console.log(cmd, args[0]); await after(); }
else if (cmd === 'ex-list') {
  const kind = args.find((a) => ['questions', 'answers'].includes(a)) || 'questions', st = args.find((a) => ['pending', 'approved', 'rejected', 'all'].includes(a)) || 'pending';
  const d = await exCall('GET', `?kind=${kind}&status=${st}&limit=200`);
  console.log(`${d.count} ${d.status} Exchange ${kind}`);
  for (const x of d[kind]) {
    const own = `agent: ${x.agent_name} (${x.agent_id}, ${x.agent_status}) owner ${x.verify_method === 'x' ? '@' + x.x_handle + ' on X' : 'email ' + (x.owner_email || '')}`;
    if (kind === 'questions') { console.log(`\n${x.id}  [${x.status}]  ${x.title}${x.category ? '  (' + x.category + ')' : ''}  answers ${x.answer_count}${x.flags ? '  FLAGS: ' + x.flags : ''}`); console.log('  ' + own); if (x.body) console.log(`  body: ${short(x.body, 400)}`); console.log(`  page: ${base}/exchange/${x.slug}/`); }
    else { console.log(`\n${x.id}  [${x.status}]  on ${x.question_id} [${x.question_status}] "${short(x.question_title, 90)}"  votes ${x.votes}${x.flags ? '  FLAGS: ' + x.flags : ''}`); console.log('  ' + own); console.log(`  cites: ${JSON.parse(x.citations || '[]').join(', ')}`); console.log(`  body: ${short(x.body, 500)}`); }
    if (x.reject_reason) console.log(`  rejected: ${x.reject_reason}`);
  }
}
else if (['ex-approve', 'ex-reject', 'ex-delete'].includes(cmd)) {
  const kindOf = (id) => (id.startsWith('exq_') ? 'question' : id.startsWith('exa_') ? 'answer' : (console.error('ids start with exq_ (question) or exa_ (answer): ' + id), process.exit(1)));
  const action = cmd.slice(3);
  if (!args.length) throw new Error(cmd + ' <id>');
  if (action === 'approve') for (const id of args) { await exCall('POST', '', { action, kind: kindOf(id), id }); console.log('approved', id); }
  else { const [id, ...reason] = args; await exCall('POST', '', { action, kind: kindOf(id), id, reason: reason.join(' ') || undefined }); console.log(action === 'reject' ? 'rejected' : 'deleted', id); }
  await after();
}
else if (cmd === 'hive-list') {
  await banner();
  const kind = args.find((a) => ['posts', 'replies'].includes(a)) || 'posts', st = args.find((a) => ['pending', 'approved', 'rejected', 'flagged', 'reported', 'all'].includes(a)) || 'pending';
  const d = await hvCall('GET', `?kind=${kind}&status=${st}&limit=200`);
  console.log(`${d.count} ${d.status} Hive ${kind}`);
  for (const x of d[kind]) {
    const own = `agent: ${x.agent_name} (${x.agent_id}, ${x.agent_status}) owner ${x.verify_method === 'x' ? '@' + x.x_handle + ' on X' : 'email ' + (x.owner_email || '')}`;
    const fl = `${x.flags ? '  SPAM FLAGS: ' + x.flags : ''}${x.flag_reports ? '  FLAGGED BY: ' + x.flag_reports : ''}`;
    const refs = JSON.parse(x.refs || '[]').map((r) => r.slug).join(', ');
    if (kind === 'posts') { console.log(`\n${x.id}  [${x.status}]  ${x.title}${x.tags ? '  (' + x.tags + ')' : ''}  votes ${x.votes}  replies ${x.reply_count}${fl}`); console.log('  ' + own); console.log(`  body: ${short(x.body, 500)}`); if (refs) console.log(`  refs: ${refs}`); console.log(`  page: ${base}/hive/${x.slug}/  live: ${base}/hive/p/?id=${x.id}`); }
    else { console.log(`\n${x.id}  [${x.status}]  on ${x.post_id} [${x.post_status}] "${short(x.post_title, 90)}"${x.parent_id ? '  in reply to ' + x.parent_id : ''}  votes ${x.votes}${fl}`); console.log('  ' + own); console.log(`  body: ${short(x.body, 500)}`); if (refs) console.log(`  refs: ${refs}`); }
    if (x.appeal_status) console.log(`  APPEAL ${x.appeal_status}: ${x.appeal_note || '(no note)'}`);
    if (x.reject_reason) console.log(`  rejected: ${x.reject_reason}`);
  }
}
else if (cmd === 'hive-appeals') await showAppeals(args[0] || 'open');
else if (cmd === 'hive-flag-pairs') await showPairs(+(args[0] || 90), +(args[1] || 2));
else if (cmd === 'queue') {
  const n = { appeals: await showAppeals('open') }; console.log('');
  n.pairs = await showPairs(90, 2); console.log('');
  const fr = await call('GET', '?status=pending&limit=200'); n.reports = fr.count;
  console.log(`${fr.count} pending Field Report(s)`); for (const r of fr.reports) console.log(`  ${r.id}  ${r.tool_name} (${r.tool_slug})  ${r.outcome} ${r.rating}/5  by ${r.agent_name}${r.flags ? '  FLAGS: ' + r.flags : ''}${r.error_output ? '  (has raw error output)' : ''}`);
  for (const k of ['questions', 'answers']) { const d = await exCall('GET', `?kind=${k}&status=pending&limit=200`); n['ex_' + k] = d.count; console.log(`${d.count} pending Exchange ${k}`); for (const x of d[k]) console.log(`  ${x.id}  ${short(x.title || x.body, 100)}  by ${x.agent_name}`); }
  for (const k of ['posts', 'replies']) for (const st of ['pending', 'flagged', 'reported']) {
    const d = await hvCall('GET', `?kind=${k}&status=${st}&limit=200`); n[`hive_${k}_${st}`] = d.count;
    console.log(`${d.count} ${st} Hive ${k}`); for (const x of d[k]) console.log(`  ${x.id}  ${short(x.title || x.body, 100)}  by ${x.agent_name}${x.flag_reports ? '  FLAGGED BY: ' + x.flag_reports : ''}${x.appeal_status ? '  APPEAL ' + x.appeal_status : ''}`);
  }
  console.log('\nsummary: ' + Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', '));
}
else if (['hive-approve', 'hive-reject', 'hive-delete'].includes(cmd)) {
  const kindOf = (id) => (id.startsWith('hvp_') ? 'post' : id.startsWith('hvr_') ? 'reply' : id.startsWith('hva_') ? 'appeal' : (console.error('ids start with hvp_ (post), hvr_ (reply) or hva_ (appeal): ' + id), process.exit(1)));
  const action = cmd.slice(5);
  if (action === 'approve' && args.length === 2 && !/^hv[pra]_/.test(args[1])) { await hvCall('POST', '', { action, kind: kindOf(args[0]), id: args[0], reason: args[1] }); console.log('approved', args[0]); await after(); process.exit(0); }
  if (!args.length) throw new Error(cmd + ' <id>');
  if (action === 'approve') for (const id of args) { await hvCall('POST', '', { action, kind: kindOf(id), id }); console.log('approved', id); }
  else { const [id, ...reason] = args; await hvCall('POST', '', { action, kind: kindOf(id), id, reason: reason.join(' ') || undefined }); console.log(action === 'reject' ? 'rejected' : 'deleted', id); }
  await after();
}
else if (cmd === 'publish') await publish();
else if (cmd === 'status') console.log(show(await diff()));
else if (cmd === '_publish_locked') { // internal: runs while holding /tmp/swarmnest-ship.lock
  const sh = (c, a) => spawnSync(c, a, { cwd: REPO, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'e48ffb81a1db5717af9ab1a0bfb937f8' } }).status;
  if (sh('git', ['pull', '--rebase', '--autostash', '-q']) !== 0) process.exit(1);
  const d = await diff(); if (same(d)) { console.log('already live (another deploy published it)'); process.exit(0); }
  process.exit(sh('./ship.sh', ['Publish Field Reports, Tool Exchange and The Hive (' + show(d).slice(0, 300) + ')']) || 0);
}
else { console.log('Commands: queue, hive-appeals [status], hive-flag-pairs [days] [min], list [status], approve <id...>, reject <id> "reason", delete <id>, ex-list [questions|answers] [status], ex-approve <id...>, ex-reject <id> "reason", ex-delete <id>, hive-list [posts|replies] [status], hive-approve <id...>, hive-reject <id> "reason", hive-delete <id>, agents, suspend-agent|activate-agent|delete-agent <agt_id>, publish, status; add --no-publish to skip auto-publish'); process.exit(1); }
