// Offline test for directory submissions (functions/_lib/submissions.js, MCP submit_listing, POST /api/v1/submissions).
// Runs against an in-memory SQLite copy of migrations/0010_submissions.sql and the built dist/ JSON (run after a build).
// Usage: node scripts/test-submissions.mjs   Exits 1 on any failure. No network: Resend is mocked.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { submitListing, buildNotice } from '../functions/_lib/submissions.js';
import { TOOLS } from '../functions/_lib/mcp-core.js';
import { onRequestPost } from '../functions/api/v1/submissions.js';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0010_submissions.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { const st = db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; },
  first(col) { const r = st.get(...args); return col ? (r ? r[col] : null) : (r ?? null); }, all() { return { results: st.all(...args) }; }, run() { st.run(...args); return { success: true }; } }; return o; } };
const sent = [];
const fetchMock = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; };
const env = { DB, RESEND_API_KEY: 'test', FR_ADMIN_TOKEN: 'x', ASSETS: { fetch: async (u) => new Response(readFileSync(new URL('../dist' + new URL(u).pathname, import.meta.url))) } };
const get = async (p) => new Response(readFileSync(new URL('../dist' + p, import.meta.url)));
const agent = { id: 'agt_test', name: 'TestAgent' };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const tryIt = async (input, ctx = { source: 'mcp', agent }) => { try { return await submitListing(env, ctx, input, get, fetchMock); } catch (e) { return { err: e.code, status: e.status, msg: e.message }; } };
const base = { name: 'Zzq Test Tool', url: 'https://zzq-test-tool.example.com/', category: 'agent-marketplaces', description: 'A test directory of agents with a heartbeat status per row.' };

const t = TOOLS.find((x) => x.name === 'submit_listing');
ok(t && t.annotations.readOnlyHint === false && t.inputSchema.required.join() === 'name,url,category,description', 'MCP tool submit_listing is listed with required fields');
const r1 = await tryIt({ ...base, pricing: 'free', auth: 'none', contact_email: 'a@b.co' });
ok(r1.status === 'queued_for_review' && /^sub_/.test(r1.submission.id), 'valid submission is queued_for_review');
ok(db.prepare("SELECT status, source, agent_id FROM submissions WHERE id = ?").get(r1.submission.id)?.status === 'pending', 'row stored as pending (not published)');
ok(sent.length === 1 && sent[0].to[0] === 'hello@swarmnest.ai' && /^Directory Submission: Zzq Test Tool \(via MCP\)/.test(sent[0].subject) && sent[0].reply_to === 'a@b.co', 'review email goes to hello@ with Directory Submission subject');
ok((await tryIt({ ...base, name: 'Other Name' })).err === 'already_queued', 'same url already pending is refused');
ok((await tryIt({ ...base, url: 'https://other.example.org/' })).err === 'already_queued', 'same name already pending is refused');
ok((await tryIt({ ...base, name: 'OpenAI API', url: 'https://openai.com/api/' })).err === 'already_listed', 'tool already in directory is refused');
ok((await tryIt({ ...base, name: 'Q1', url: 'https://bit.ly/abc' })).err === 'blocked_link', 'link shortener refused');
ok((await tryIt({ ...base, name: 'Q2', url: 'https://1.2.3.4/' })).err === 'blocked_link', 'IP address refused');
ok((await tryIt({ ...base, name: 'Q3', url: 'https://xn--pple-43d.com/' })).err === 'blocked_link', 'punycode look-alike refused');
ok((await tryIt({ ...base, name: 'Q4', url: 'http://plain.example.com/' })).err === 'blocked_link', 'plain http refused');
ok((await tryIt({ ...base, name: 'Q5', url: 'https://q5.example.com/', category: 'nope' })).err === 'unknown_category', 'unknown category refused');
ok((await tryIt({ ...base, name: 'Q6', url: 'https://q6.example.com/', category: 'Agent & API Marketplaces' })).status === 'queued_for_review', 'category by name works');
ok((await tryIt({ ...base, name: 'Q7', url: 'https://q7.example.com/', description: 'short' })).err === 'bad_description', 'short description refused');
ok((await tryIt({ ...base, name: 'Q8', url: 'https://q8.example.com/', extra: 1 })).err === 'bad_field', 'unknown field refused');
ok((await tryIt({ ...base, name: 'Q9', url: 'https://q9.example.com/' })).status === 'queued_for_review', 'third submission today allowed');
ok((await tryIt({ ...base, name: 'Q10', url: 'https://q10.example.com/' })).err === 'rate_limited', 'fourth submission per agent per day is rate limited');
// Web form path
const form = (fields, ip = '9.9.9.9') => new Request('https://swarmnest.ai/api/v1/submissions', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }, body: new URLSearchParams(fields).toString() });
const realFetch = globalThis.fetch; globalThis.fetch = fetchMock;
let res = await onRequestPost({ request: form({ ...base, name: 'Web One', url: 'https://web-one.example.com/' }), env });
ok(res.status === 303 && res.headers.get('location').endsWith('/submit/received/'), 'web form submission redirects to /submit/received/');
ok(db.prepare("SELECT source FROM submissions WHERE name = 'Web One'").get()?.source === 'web', 'web form row has source web');
res = await onRequestPost({ request: form({ ...base, name: 'Web Two', url: 'https://bit.ly/x' }), env });
ok(res.status === 303 && /error=blocked_link/.test(res.headers.get('location')), 'web form error redirects back with code');
res = await onRequestPost({ request: form({ ...base, name: 'Spam', url: 'https://spam.example.com/', company: 'x' }), env });
ok(res.status === 303 && !db.prepare("SELECT 1 FROM submissions WHERE name = 'Spam'").get(), 'honeypot is dropped silently');
res = await onRequestPost({ request: new Request('https://swarmnest.ai/api/v1/submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base) }), env });
ok(res.status === 401, 'JSON without agent key is 401');
globalThis.fetch = realFetch;
ok(/Pending review\. Nothing has been published/.test(buildNotice({ ...base, id: 'sub_x', source: 'manual', origin: 'https://thecolony.ai/' }).text), 'notice says nothing is published');
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
