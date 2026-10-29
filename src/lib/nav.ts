// Shared navigation data: groups with counts, top categories, popular links.
import { GROUPS, byCat, CATS } from './data';
export const groupPath = (slug: string) => `/directory/group/${slug}/`;
export const catCount = (slug: string) => byCat(slug).length;
export const NAV_GROUPS = GROUPS.map((g) => {
  const cats = g.cats.map((c) => ({ slug: c.slug, name: c.name, blurb: c.blurb, count: catCount(c.slug) }));
  return { slug: g.slug, name: g.name, blurb: g.blurb, cats, total: cats.reduce((n, c) => n + c.count, 0),
    top: [...cats].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 4) };
});
export const groupForCat = (slug: string) => NAV_GROUPS.find((g) => g.cats.some((c) => c.slug === slug));
const cat = (slug: string) => { const c = CATS.find((x) => x.slug === slug); return c ? { slug, name: c.name, count: catCount(slug), href: `/directory/${slug}/` } : null; };
export const POPULAR_CATS = ['mcp-servers', 'llm-apis', 'agent-frameworks', 'ai-coding-assistants', 'browser-automation', 'vector-databases', 'web-scraping-apis', 'search-apis', 'speech-transcription', 'text-to-speech', 'code-execution', 'workflow-automation']
  .map(cat).filter(Boolean) as { slug: string; name: string; count: number; href: string }[];
export const CHIPS = [
  { name: 'MCP Servers', href: '/directory/mcp-servers/' },
  { name: 'LLM APIs', href: '/directory/llm-apis/' },
  { name: 'Coding Agents', href: '/directory/ai-coding-assistants/' },
  { name: 'macOS Skills', href: '/agent-skills/category/apple-macos-skills/' },
  { name: 'Browser Automation', href: '/directory/browser-automation/' },
  { name: 'Vector Databases', href: '/directory/vector-databases/' },
];
// Top-level header links (after the Directory dropdown), shared by the desktop bar and the mobile Menu sheet.
// `match` decides which section is highlighted. The Community slot is reserved for Field Reports:
// set show: true (and point href at the live page) when it ships. Keep this list short: the desktop bar
// fits six items from 820px up (tighter spacing applies between 820px and 1000px, see styles.css).
export type TopLink = { key: string; name: string; href: string; show: boolean; match: (path: string) => boolean };
export const TOP_NAV: TopLink[] = [
  { key: 'guides', name: 'Guides', href: '/guides/', show: true, match: (p) => p.startsWith('/guides/') || p === '/smithery-alternatives/' },
  { key: 'skills', name: 'Agent Skills', href: '/agent-skills/', show: true, match: (p) => p.startsWith('/agent-skills/') },
  { key: 'market', name: 'Marketplace', href: '/marketplace/', show: true, match: (p) => p.startsWith('/marketplace/') },
  { key: 'community', name: 'Community', href: '/community/', show: true, match: (p) => p.startsWith('/community/') || p.startsWith('/field-reports/') },
  { key: 'adv', name: 'Advertise', href: '/advertise/', show: true, match: (p) => p.startsWith('/advertise/') },
];
export const topNav = () => TOP_NAV.filter((l) => l.show);
