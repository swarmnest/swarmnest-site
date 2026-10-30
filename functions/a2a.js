// Minimal read-only A2A endpoint (JSON-RPC binding, A2A 1.0 + 0.3 compat).
// SendMessage / message/send: runs a Swarmnest directory search and replies with one Message
// (short text summary + top 5 results as a data part). No tasks, no streaming, no push.
import Core from './_lib/search-core.js';
const SITE = 'https://swarmnest.ai';
const H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, a2a-version, a2a-extensions', 'cache-control': 'no-store' };
const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const rpcErr = (id, code, message, s = 200) => out({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, s);

let IDX = null, VOC = null, KNOWN = null; // parsed once per isolate
async function load(env, u) {
  if (IDX) return;
  const [r, v] = await Promise.all([env.ASSETS.fetch(new URL('/api-index.json', u)), env.ASSETS.fetch(new URL('/search-vocab.json', u))]);
  const d = await r.json(); VOC = await v.json(); KNOWN = Core.mkVocab(VOC);
  IDX = Core.prepare(d.rows.map(r => ({ name: r[0], slug: r[1], category: r[2], category_name: r[3], description: r[4], url: r[5], docs_url: r[6], auth: r[7], pricing: r[8] })));
}

// Cheap per-isolate rate limit: 30 requests per minute per IP.
const HITS = new Map(); const LIMIT = 30, WINDOW = 60000;
function limited(ip) {
  const now = Date.now(); let h = HITS.get(ip);
  if (!h || now - h.t > WINDOW) { h = { t: now, n: 0 }; HITS.set(ip, h); }
  if (HITS.size > 5000) for (const [k, x] of HITS) if (now - x.t > WINDOW) HITS.delete(k);
  return ++h.n > LIMIT;
}

const STOP = new Set('a an the for to of in on and or with that which what who where how is are am be can could would should do does did you your me my i we our us please find search show list listed give get need want looking look recommend recommendation suggest best good top some any tool tools server servers service services app apps there here this these those it its about hello hi hey thanks thank'.split(' '));
const HELP = /^\s*(hi|hello|hey|help|what can you do|who are you|what do you do)\b/i;
function search(text) {
  const words = (text.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) || []).filter(w => !STOP.has(w));
  const mcp = words.includes('mcp'); const terms = words.filter(w => w !== 'mcp');
  const q = (terms.length ? terms : words).join(' ').slice(0, 200);
  if (!q) return { q: '', total: 0, hits: [] };
  let r = Core.run(IDX, VOC, KNOWN, q, {}); let hits = r.hits, total = r.total;
  if (!total && terms.length > 1) { // OR fallback: best hit per word, merged by score
    const seen = new Map();
    for (const w of terms) for (const h of Core.run(IDX, VOC, KNOWN, w, {}).hits.slice(0, 20)) { const k = h.e.slug + '|' + h.e.category; const p = seen.get(k); if (p) p.score += h.score; else seen.set(k, { ...h }); }
    hits = [...seen.values()].sort((a, b) => b.score - a.score); total = hits.length;
  }
  if (mcp) hits = [...hits].sort((a, b) => (b.e.category === 'mcp-servers') - (a.e.category === 'mcp-servers'));
  return { q, total, hits };
}
const item = e => ({ name: e.name, category: e.category_name || e.category, description: e.description, url: e.url, docs_url: e.docs_url || null, auth: e.auth || null, pricing: e.pricing || null, swarmnest_url: `${SITE}/directory/${e.category}/${e.slug}/` });

function reply(text) {
  const t = (text || '').trim().slice(0, 500);
  if (!t || (HELP.test(t) && t.split(/\s+/).length <= 8)) return {
    text: `I'm Swarmnest's directory agent. Send me what you need, for example "MCP server for Postgres" or "speech to text API", and I'll return the top 5 matches from the Swarmnest directory of 3,800+ AI agent tools, MCP servers and APIs, each with a link. For Agent Skills, Field Reports, the Tool Exchange and The Hive, connect to our MCP server at ${SITE}/mcp.`,
    data: { query: null, total: 0, results: [], directory: `${SITE}/directory/`, mcp_server: `${SITE}/mcp`, rest_api: `${SITE}/api/v1/search?q=` }
  };
  const r = search(t); const top = r.hits.slice(0, 5).map(h => item(h.e));
  const text2 = top.length
    ? `Found ${r.total} match${r.total === 1 ? '' : 'es'} for "${r.q}" in the Swarmnest directory. Top ${top.length}: ${top.map(x => `${x.name} (${x.category}) ${x.swarmnest_url}`).join('; ')}.`
    : `No Swarmnest directory matches for "${r.q || t}". Try fewer or different words, or browse ${SITE}/directory/.`;
  return { text: text2, data: { query: r.q, total: r.total, results: top, more: r.q ? `${SITE}/search/?q=${encodeURIComponent(r.q)}` : null } };
}
const textOf = parts => (Array.isArray(parts) ? parts : []).map(p => (p && typeof p.text === 'string' ? p.text : '')).join(' ');

const UNSUPPORTED = { SendStreamingMessage: 1, 'message/stream': 1, ListTasks: 1, GetExtendedAgentCard: 1, 'agent/getAuthenticatedExtendedCard': 1 };
const NO_TASK = { GetTask: 1, CancelTask: 1, SubscribeToTask: 1, 'tasks/get': 1, 'tasks/cancel': 1, 'tasks/resubscribe': 1 };
const PUSH = /PushNotificationConfig|pushNotificationConfig/;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'access-control-allow-methods': 'POST, GET, OPTIONS' } });
  if (request.method === 'GET') return out({ endpoint: `${SITE}/a2a`, protocol: 'A2A JSON-RPC 2.0 (A2A 1.0 and 0.3)', methods: ['SendMessage', 'message/send'], agent_card: `${SITE}/.well-known/agent-card.json`, note: 'POST a JSON-RPC request. Read-only directory search; no tasks, streaming or push notifications.' });
  if (request.method !== 'POST') return out({ error: 'method_not_allowed' }, 405);
  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  if (limited(ip)) return out({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit: 30 requests per minute. Try again shortly.' } }, 429);
  const raw = await request.text();
  if (raw.length > 16384) return rpcErr(null, -32600, 'Request too large (16 KB max).', 413);
  let req; try { req = JSON.parse(raw); } catch { return rpcErr(null, -32700, 'Parse error'); }
  if (Array.isArray(req)) return rpcErr(null, -32600, 'Batch requests are not supported.');
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcErr(req && req.id, -32600, 'Invalid Request');
  const id = req.id ?? null, m = req.method;
  const ver = (request.headers.get('a2a-version') || new URL(request.url).searchParams.get('A2A-Version') || '').trim();
  const legacy = m.includes('/');
  if (ver && !/^(0\.3|1\.0)(\.\d+)?$/.test(ver)) return rpcErr(id, -32009, `A2A version ${ver} is not supported. Supported: 1.0, 0.3.`);
  if (m === 'SendMessage' || m === 'message/send') {
    const msg = req.params && req.params.message;
    if (!msg || !Array.isArray(msg.parts) || !msg.parts.length) return rpcErr(id, -32602, 'Invalid params: params.message with at least one part is required.');
    if (msg.taskId) return rpcErr(id, -32001, 'Task not found: this agent does not create tasks.');
    const text = textOf(msg.parts);
    if (!text.trim()) return rpcErr(id, -32005, 'Only text parts are supported.');
    await load(env, new URL(request.url));
    const r = reply(text), contextId = typeof msg.contextId === 'string' && msg.contextId.length <= 100 ? msg.contextId : crypto.randomUUID(), messageId = crypto.randomUUID();
    if (m === 'message/send') return out({ jsonrpc: '2.0', id, result: { kind: 'message', messageId, contextId, role: 'agent', parts: [{ kind: 'text', text: r.text }, { kind: 'data', data: r.data }] } });
    return out({ jsonrpc: '2.0', id, result: { message: { messageId, contextId, role: 'ROLE_AGENT', parts: [{ text: r.text, mediaType: 'text/plain' }, { data: r.data, mediaType: 'application/json' }] } } });
  }
  if (NO_TASK[m]) return rpcErr(id, -32001, 'Task not found: this agent replies with messages and never creates tasks.');
  if (PUSH.test(m)) return rpcErr(id, -32003, 'Push notifications are not supported.');
  if (UNSUPPORTED[m]) return rpcErr(id, -32004, `${m} is not supported by this agent (read-only, no streaming, no tasks, no extended card).`);
  return rpcErr(id, -32601, `Method not found: ${m}`);
}
