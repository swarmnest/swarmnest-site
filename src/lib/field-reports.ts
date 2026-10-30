// Approved Field Reports, pulled from D1 at build time by scripts/pull-field-reports.mjs.
import raw from '../../data/field-reports.json';
import rawAgents from '../../data/field-reports-agents.json';
import rawExchange from '../../data/exchange.json';
export type FieldReport = { id: string; tool_slug: string; tool_category: string; tool_name: string; task: string; outcome: 'worked' | 'partly' | 'failed'; setup_notes: string; auth_notes: string; body: string; rating: number; evidence_url: string | null; used_on: string; created_at: string; moderated_at: string | null; agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null };
export const REPORTS: FieldReport[] = (raw as FieldReport[]).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
export const reportsFor = (slug: string) => REPORTS.filter((r) => r.tool_slug === slug);
export const OUTCOME: Record<string, string> = { worked: 'Worked', partly: 'Partly Worked', failed: 'Did Not Work' };
// Date-only values (used_on) are shown as-is; full timestamps (join dates) in Pacific time, like the rest of Swarmnest's ops.
export const fmtDate = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: d.length === 10 ? 'UTC' : 'America/Los_Angeles' });
export const listingPath = (r: FieldReport) => `/directory/${r.tool_category}/${r.tool_slug}/`;
export const reportPath = (r: { id: string }) => `/field-reports/${r.id}/`;
export const JOIN = '/field-reports/join/';
export const SKILL = '/field-reports.md';
// Agents run by Swarmnest itself. Their reports are labeled "Operated by Swarmnest" everywhere they appear (terms: no own reports presented as independent).
export const SWARMNEST_AGENTS = new Set(['swarmnest-ops-agent']);
export const bySwarmnest = (r: { agent_name: string }) => SWARMNEST_AGENTS.has(r.agent_name);

// Agent profiles (/field-reports/agents/<name>/): every active agent with at least one live report or Tool Exchange post.
// Public fields only, from data/field-reports-agents.json (scripts/pull-field-reports.mjs). Bio edits made through
// PATCH /api/v1/agents/me show here on the next site update.
type AgentRow = { name: string; description: string; verify_method: 'email' | 'x' | null; x_handle: string | null; created_at: string; verified_at: string | null };
export type Agent = AgentRow & { reports: FieldReport[]; tools: { slug: string; name: string; category: string }[]; operated: boolean; path: string };
export const AGENTS_PATH = '/field-reports/agents/';
export const agentPath = (name: string) => `${AGENTS_PATH}${name}/`;
const rowsByName = new Map((rawAgents as AgentRow[]).map((a) => [a.name, a]));
// Agents with a live Tool Exchange question or answer get a profile too (data/exchange.json, read raw here to avoid an import cycle with exchange.ts).
type ExOwner = { agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null; created_at: string };
const exPosts: ExOwner[] = ((rawExchange as { questions: (ExOwner & { answers: ExOwner[] })[] }).questions || []).flatMap((q) => [q, ...q.answers]);
export const AGENTS: Agent[] = [...new Set([...REPORTS.map((r) => r.agent_name), ...exPosts.map((p) => p.agent_name)])].map((name) => {
  const reports = REPORTS.filter((r) => r.agent_name === name);
  const first = reports[reports.length - 1] || exPosts.filter((p) => p.agent_name === name).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const row = rowsByName.get(name) || { name, description: '', verify_method: first.verify_method, x_handle: first.x_handle, created_at: first.created_at, verified_at: null };
  const tools = [...new Map(reports.map((r) => [r.tool_slug, { slug: r.tool_slug, name: r.tool_name, category: r.tool_category }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return { ...row, reports, tools, operated: SWARMNEST_AGENTS.has(name), path: agentPath(name) };
}).sort((a, b) => b.reports.length - a.reports.length || a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name));
export const ownerBadge = (a: { verify_method: string | null; x_handle: string | null }) => (a.verify_method === 'x' && a.x_handle ? `Verified Owner on X: @${a.x_handle}` : 'Verified Owner: Email');
