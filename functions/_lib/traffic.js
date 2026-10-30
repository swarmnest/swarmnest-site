// Classifies requests that reach Pages Functions and keeps a daily count per (route, client class) in D1.
// Free-tier safe: counts are buffered per isolate and flushed as one D1 batch at most every FLUSH_MS
// (or when MAX_PENDING hits are waiting), so heavy traffic does not turn into one D1 write per request.
const FLUSH_MS = 15000, MAX_PENDING = 50;
const RULES = [
  ['self', /Swarmnest\//i],
  ['ai_agent', /ChatGPT-User|Claude-User|Perplexity-User|MistralAI-User|DuckAssistBot|claude-code|Claude-Code|Cursor\/|mcp-remote|modelcontextprotocol|mcp-client|\bMCP\b|a2a-|Moltbook|Manus|Devin|OpenAI-Agent|Operator/i],
  ['ai_crawler', /GPTBot|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|Claude-SearchBot|PerplexityBot|CCBot|Google-Extended|GoogleOther|Bytespider|Amazonbot|Applebot-Extended|meta-externalagent|meta-externalfetcher|FacebookBot|cohere-ai|YouBot|Diffbot|ImagesiftBot|PetalBot|Timpibot|omgili|AI2Bot|Kangaroo Bot|PanguBot|Scrapy|firecrawl|Jina|TavilyBot|Exabot|LinkupBot|Brightbot|iaskspider/i],
  ['search_bot', /Googlebot|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Applebot|Sogou|SeznamBot|Qwantbot|MojeekBot|AhrefsBot|SemrushBot|MJ12bot|DotBot|DataForSeoBot|serpstatbot|BLEXBot/i],
  ['social_bot', /facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|Discordbot|TelegramBot|WhatsApp|redditbot|Embedly|Iframely|SkypeUriPreview/i],
  ['monitor', /UptimeRobot|Pingdom|StatusCake|Better ?Stack|Uptime-Kuma|mcptry|Site24x7|Checkly|HetrixTools|Cloudflare-Healthchecks|Smithery|Glama|PulseMCP/i],
  ['headless', /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Lighthouse|Chrome-Lighthouse/i],
  ['script', /^(curl|Wget|python|aiohttp|httpx|axios|node|undici|Go-http-client|Java\/|okhttp|libwww|Ruby|PHP|Deno|Bun|Dart|reqwest|got|insomnia|PostmanRuntime|HTTPie)|bot|crawl|spider|fetch|scan/i]
];
export function clientClass(request) {
  const ua = request.headers.get('user-agent') || '';
  const vb = (request.cf && request.cf.verifiedBotCategory) || '';
  if (!ua) return 'unknown';
  for (const [k, re] of RULES) if (re.test(ua)) return k;
  if (vb) return /AI/i.test(vb) ? 'ai_crawler' : /Search/i.test(vb) ? 'search_bot' : 'monitor';
  return /^Mozilla\//.test(ua) ? 'browser' : 'script';
}
export function routeClass(path) {
  if (path === '/' || path === '') return 'home';
  if (path === '/mcp' || path.startsWith('/mcp/')) return 'mcp';
  if (path === '/a2a' || path.startsWith('/a2a/')) return 'a2a';
  if (/^\/api\/(fulfill|stripe-webhook|sponsor|subscribe)|^\/download\//.test(path)) return 'commerce';
  if (path.startsWith('/api/')) return 'api';
  return 'other';
}
const pending = new Map(); let lastFlush = 0, pendingHits = 0;
export function countRequest(context) {
  try {
    const { request, env } = context;
    if (!env.DB || request.method === 'OPTIONS') return;
    const url = new URL(request.url);
    if (url.hostname !== 'swarmnest.ai') return; // skip preview/staging deployments
    const day = new Date().toISOString().slice(0, 10);
    const key = day + '|' + routeClass(url.pathname) + '|' + clientClass(request);
    pending.set(key, (pending.get(key) || 0) + 1); pendingHits++;
    const now = Date.now();
    if (now - lastFlush < FLUSH_MS && pendingHits < MAX_PENDING) return;
    lastFlush = now;
    const rows = [...pending.entries()]; pending.clear(); pendingHits = 0;
    const st = env.DB.prepare('INSERT INTO traffic_daily (day, route, client, hits) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(day, route, client) DO UPDATE SET hits = hits + excluded.hits');
    context.waitUntil(env.DB.batch(rows.map(([k, n]) => st.bind(...k.split('|'), n))).catch(() => {}));
  } catch { /* never let counting break a request */ }
}
