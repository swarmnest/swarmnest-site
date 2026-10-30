#!/usr/bin/env node
// Link check for directory listings: fetches every listed url (same request as check.sh) and records, per url, the
// HTTP status and the date of the check in data/urlcheck-dates.json ({url: {status, date}}). urlstatus.txt keeps the
// status (build-data.mjs reads both). Listing pages show "Page Last Responded <date>" from these dates: it means a
// fetch of the listed page answered, not that the tool works (Field Reports cover real usage).
// Safety: a url that answered before but fails now keeps its old status and date (a one-off timeout or rate limit
// shouldn't mark a working listing as down); the weekly review decides real removals.
// Usage: node scripts/link-check.mjs [--from results.txt]   (results lines: "<code> <url>", e.g. from check.sh)
import fs from 'node:fs';
import { execFile } from 'node:child_process';
const ok = (c) => c >= 200 && c < 400;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const entries = JSON.parse(fs.readFileSync('data/entries.json', 'utf8'));
const raw = fs.readFileSync('data/raw.txt', 'utf8').split('\n').filter(Boolean).map((l) => l.split('|')[2]);
const urls = [...new Set([...entries.map((e) => e.url), ...raw])];
const status = new Map();
for (const l of (fs.existsSync('urlstatus.txt') ? fs.readFileSync('urlstatus.txt', 'utf8') : '').split('\n')) { const [c, ...u] = l.split(' '); if (u.length) status.set(u.join(' '), +c); }
const dates = fs.existsSync('data/urlcheck-dates.json') ? JSON.parse(fs.readFileSync('data/urlcheck-dates.json', 'utf8')) : {};
const fromIdx = process.argv.indexOf('--from');
const results = new Map();
if (fromIdx > 0) { for (const l of fs.readFileSync(process.argv[fromIdx + 1], 'utf8').split('\n')) { const [c, ...u] = l.split(' '); if (u.length) results.set(u.join(' '), +c); } }
else {
  const check = (u) => new Promise((res) => execFile('curl', ['-s', '-o', '/dev/null', '-L', '-m', '20', '-w', '%{http_code}', '-A', 'Mozilla/5.0 (compatible; SwarmnestBot/1.0; +https://swarmnest.ai)', u], (e, out) => res(+String(out || '0').trim() || 0)));
  let i = 0; await Promise.all(Array.from({ length: 32 }, async () => { while (i < urls.length) { const u = urls[i++]; results.set(u, await check(u)); } }));
}
let fresh = 0, keptOld = 0, failedNew = 0;
for (const u of urls) {
  if (!results.has(u)) continue;
  const c = results.get(u), prev = status.get(u);
  if (ok(c)) { status.set(u, c); dates[u] = { status: c, date: today }; fresh++; }
  else if (prev != null && ok(prev)) keptOld++;
  else { status.set(u, c); dates[u] = { status: c, date: today }; failedNew++; }
}
fs.writeFileSync('urlstatus.txt', [...status].filter(([u]) => urls.includes(u)).sort((a, b) => a[0].localeCompare(b[0])).map(([u, c]) => `${c} ${u}`).join('\n') + '\n');
fs.writeFileSync('data/urlcheck-dates.json', JSON.stringify(Object.fromEntries(Object.entries(dates).filter(([u]) => urls.includes(u)).sort()), null, 0) + '\n');
console.log(`link check ${today}: ${fresh} answered, ${keptOld} failed now but answered before (old status kept), ${failedNew} not answering`);
