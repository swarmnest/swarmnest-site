// Daily human vs bot/agent traffic split for swarmnest.ai.
// usage: node scripts/traffic-split.mjs [--hours 24] [--log]   (--log appends one row to data/traffic-split.csv)
// Sources (all free tier, read-only):
//  1. Cloudflare Web Analytics beacon (RUM), swarmnest.ai site only. The account also hosts terastarscape.com; never add the two.
//     The beacon only fires when a page's JavaScript runs, so most crawlers are already excluded; headless browsers are not.
//  2. D1 traffic_daily: requests that reach Pages Functions (homepage, /mcp, /a2a, /api/*), counted by client class (functions/_lib/traffic.js). UTC days.
//  3. Pages Functions invocation total (account analytics).
// Static pages (directory, llms.txt, sitemap) are served without Functions, so crawler hits on them are NOT visible without a
// token that has Zone > Analytics:Read (or the AI Crawl Control page in the Cloudflare dashboard).
import fs from 'node:fs';
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || 'e48ffb81a1db5717af9ab1a0bfb937f8';
const DB = '04f3e818-eeb6-4cc4-bdcf-5e4f5add3e06';
const SITE = 'd0a73b8ae2ab4517a7309a7bb7637286'; // swarmnest.ai Web Analytics siteTag
const H = { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' };
const args = process.argv.slice(2); const hours = +(args[args.indexOf('--hours') + 1] || 24) || 24;
const end = new Date(); const start = new Date(end - hours * 3600e3);
const gql = async (query) => { const r = await (await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query }) })).json(); if (r.errors) throw new Error(JSON.stringify(r.errors)); return r.data.viewer.accounts[0]; };
const win = `datetime_geq:"${start.toISOString()}",datetime_lt:"${end.toISOString()}"`;
const rum = (await gql(`{viewer{accounts(filter:{accountTag:"${ACC}"}){rumPageloadEventsAdaptiveGroups(limit:5000,filter:{siteTag:"${SITE}",${win}}){count sum{visits} dimensions{userAgentBrowser deviceType refererHost countryName}}}}}`)).rumPageloadEventsAdaptiveGroups;
const b = { visits: 0, views: 0, headless: 0, browserVisits: 0, referred: 0, mobile: 0, country: {} };
for (const g of rum) {
  const d = g.dimensions, v = g.sum.visits; b.visits += v; b.views += g.count;
  if (/headless/i.test(d.userAgentBrowser)) { b.headless += v; continue; }
  b.browserVisits += v;
  if (d.refererHost && d.refererHost !== 'swarmnest.ai') b.referred += v;
  if (d.deviceType === 'mobile' || d.deviceType === 'tablet') b.mobile += v;
  b.country[d.countryName] = (b.country[d.countryName] || 0) + v;
}
// Burst filter: a JS-rendering crawler on rotating proxies shows up as one hour with hundreds of single-page, no-referrer
// desktop visits across hundreds of different pages (Oct 30, 02:00 UTC: 423 visits, 382 distinct paths). Hours whose
// non-headless visits exceed max(50, 5x the median hour) are treated as a crawler burst, not people.
const hourly = (await gql(`{viewer{accounts(filter:{accountTag:"${ACC}"}){rumPageloadEventsAdaptiveGroups(limit:500,filter:{siteTag:"${SITE}",${win}}){sum{visits} dimensions{datetimeHour userAgentBrowser}}}}}`)).rumPageloadEventsAdaptiveGroups;
const perHour = {}; for (const g of hourly) if (!/headless/i.test(g.dimensions.userAgentBrowser)) perHour[g.dimensions.datetimeHour] = (perHour[g.dimensions.datetimeHour] || 0) + g.sum.visits;
const hv = Array.from({ length: hours }, (_, i) => perHour[new Date(Math.floor(start / 3600e3) * 3600e3 + (i + 1) * 3600e3).toISOString().slice(0, 13) + ':00:00Z'] || 0).sort((x, y) => x - y);
const median = hv[Math.floor(hv.length / 2)] || 0, burstLimit = Math.max(50, 5 * median);
const bursts = Object.entries(perHour).filter(([, v]) => v > burstLimit);
const burstVisits = bursts.reduce((a, [, v]) => a + v, 0);
const internalNav = Math.max(0, b.views - b.visits);
const fn = (await gql(`{viewer{accounts(filter:{accountTag:"${ACC}"}){pagesFunctionsInvocationsAdaptiveGroups(limit:20,filter:{${win}}){sum{requests} dimensions{scriptName}}}}}`)).pagesFunctionsInvocationsAdaptiveGroups
  .filter(g => /production/.test(g.dimensions.scriptName)).reduce((a, g) => a + g.sum.requests, 0);
const days = [...new Set([start, end].map(d => d.toISOString().slice(0, 10)))];
const q = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify({ sql: `SELECT route, client, SUM(hits) hits FROM traffic_daily WHERE day IN (${days.map(d => `'${d}'`).join(',')}) GROUP BY route, client ORDER BY hits DESC` }) })).json();
const rows = q.result?.[0]?.results || [];
const sum = (f) => rows.filter(f).reduce((a, r) => a + r.hits, 0);
const agentRoutes = r => ['mcp', 'a2a', 'api'].includes(r.route);
const out = {
  window: `${start.toISOString()} .. ${end.toISOString()} (${hours}h)`,
  human_beacon: { beacon_visits: b.visits, beacon_pageviews: b.views, headless_visits: b.headless, browser_visits_upper_bound: b.browserVisits, crawler_burst_visits: burstVisits, crawler_burst_hours_utc: bursts.map(([h, v]) => h.slice(0, 13) + 'h=' + v), human_visits_estimate: b.browserVisits - burstVisits,
    engaged_signals: { external_referrer: b.referred, mobile: b.mobile, internal_page_navigations: internalNav },
    top_countries: Object.entries(b.country).sort((x, y) => y[1] - x[1]).slice(0, 5) },
  functions_requests_total: fn,
  logged_days_utc: days,
  agent_calls: { mcp: sum(r => r.route === 'mcp' && r.client !== 'self'), a2a: sum(r => r.route === 'a2a' && r.client !== 'self'), api: sum(r => r.route === 'api' && r.client !== 'self') },
  homepage_by_client: Object.fromEntries(rows.filter(r => r.route === 'home').map(r => [r.client, r.hits])),
  ai_crawler_agent_hits: sum(r => ['ai_crawler', 'ai_agent'].includes(r.client)),
  other_bots: sum(r => ['search_bot', 'social_bot', 'monitor', 'headless', 'script', 'unknown'].includes(r.client) && !agentRoutes(r)),
  self_checks: sum(r => r.client === 'self'),
  rows
};
console.log(JSON.stringify(out, null, 1));
if (args.includes('--log')) {
  const f = 'data/traffic-split.csv';
  if (!fs.existsSync(f)) fs.writeFileSync(f, 'date,beacon_visits,headless_visits,browser_visits,crawler_burst_visits,human_visits_estimate,referred_visits,mobile_visits,internal_navs,mcp_calls,a2a_calls,api_calls,ai_crawler_agent_hits,other_bot_hits,functions_requests\n');
  const date = new Date(end.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).toISOString().slice(0, 10);
  fs.appendFileSync(f, [date, b.visits, b.headless, b.browserVisits, burstVisits, b.browserVisits - burstVisits, b.referred, b.mobile, internalNav, out.agent_calls.mcp, out.agent_calls.a2a, out.agent_calls.api, out.ai_crawler_agent_hits, out.other_bots, fn].join(',') + '\n');
}
