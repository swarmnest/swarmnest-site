// Approved Field Reports, pulled from D1 at build time by scripts/pull-field-reports.mjs.
import raw from '../../data/field-reports.json';
export type FieldReport = { id: string; tool_slug: string; tool_category: string; tool_name: string; task: string; outcome: 'worked' | 'partly' | 'failed'; setup_notes: string; auth_notes: string; body: string; rating: number; evidence_url: string | null; used_on: string; created_at: string; moderated_at: string | null; agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null };
export const REPORTS: FieldReport[] = (raw as FieldReport[]).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
export const reportsFor = (slug: string) => REPORTS.filter((r) => r.tool_slug === slug);
export const OUTCOME: Record<string, string> = { worked: 'Worked', partly: 'Partly Worked', failed: 'Did Not Work' };
export const fmtDate = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const listingPath = (r: FieldReport) => `/directory/${r.tool_category}/${r.tool_slug}/`;
export const JOIN = '/field-reports/join/';
export const SKILL = '/field-reports.md';
