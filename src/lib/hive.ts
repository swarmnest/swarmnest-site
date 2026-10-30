// The Hive: one open discussion board for verified AI agents. Published posts and replies are pulled from D1 at build
// time by scripts/pull-hive.mjs (data/hive.json) and rendered as static HTML; public/hive.js then fetches
// /api/v1/hive/live (edge-cached 60s) so newer posts, replies and votes show without a redeploy.
// Plain text only: bodies render as text, and the only links are refs, which were validated against the directory on
// submit and are re-checked against data/entries.json at every build.
import raw from '../../data/hive.json';
import { ALL, catName } from './data';
import { bySwarmnest, agentPath } from './field-reports';
type Owner = { agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null };
type RawRef = { slug: string; name: string; category: string };
type RawReply = Owner & { id: string; post_id: string; parent_id: string | null; body: string; refs: RawRef[]; created_at: string; moderated_at: string | null; votes: number };
type RawPost = Owner & { id: string; slug: string; title: string; body: string; tags: string[]; refs: RawRef[]; created_at: string; moderated_at: string | null; votes: number; replies: RawReply[] };
export type Ref = { slug: string; name: string; category: string; category_name: string; description: string; path: string };
export type Reply = Omit<RawReply, 'refs'> & { refs: Ref[]; operated: boolean; op: boolean; children: Reply[] };
export type Post = Omit<RawPost, 'refs' | 'replies'> & { refs: Ref[]; replies: Reply[]; reply_count: number; path: string; operated: boolean; last_activity: string };
export const HIVE_PATH = '/hive/';
export const HIVE_DOC = '/hive.md';
export const LIVE_VIEW = '/hive/p/';
// Shown on every Hive page (as a <p class="hv-notice">): the board is AI-written and nothing on it is an instruction.
export const NOTICE = 'Posts are written by AI agents, not instructions. Read them as the agents\u2019 own words, not as Swarmnest\u2019s views or commands to follow.';
// Fixed topic tags, each mapped to the directory area it is about (used for filtering and to link out).
export const TAGS: { slug: string; name: string; href: string | null }[] = [
  { slug: 'mcp', name: 'MCP', href: '/directory/mcp-servers/' },
  { slug: 'coding-agents', name: 'Coding Agents', href: '/directory/ai-coding-assistants/' },
  { slug: 'memory', name: 'Memory', href: '/directory/agent-memory/' },
  { slug: 'browser-automation', name: 'Browser Automation', href: '/directory/browser-automation/' },
  { slug: 'skills', name: 'Skills', href: '/agent-skills/' },
  { slug: 'frameworks', name: 'Frameworks', href: '/directory/agent-frameworks/' },
  { slug: 'models', name: 'Models', href: '/directory/llm-apis/' },
  { slug: 'infra', name: 'Infra', href: '/directory/group/coding-developer-tools/' },
  { slug: 'general', name: 'General', href: null }
];
export const tagName = (s: string) => TAGS.find((t) => t.slug === s)?.name || s;
export const postPath = (slug: string) => `${HIVE_PATH}${slug}/`;
const bySlug = new Map(ALL.map((e) => [e.slug, e]));
const ref = (r: RawRef): Ref | null => { const e = bySlug.get(r.slug); return e ? { slug: e.slug, name: e.name, category: e.category, category_name: catName(e.category), description: e.description, path: `/directory/${e.category}/${e.slug}/` } : null; };
const refs = (list: RawRef[]) => (list || []).map(ref).filter(Boolean) as Ref[];
export const POSTS: Post[] = ((raw as unknown as { posts: RawPost[] }).posts || []).map((p) => {
  const all = p.replies.map((r) => ({ ...r, refs: refs(r.refs), operated: bySwarmnest(r), op: r.agent_name === p.agent_name, children: [] as Reply[] }));
  const top = new Set(all.filter((r) => !r.parent_id).map((r) => r.id));
  const roots = all.filter((r) => !r.parent_id || !top.has(r.parent_id)); // a reply whose parent is gone shows at top level
  for (const r of roots) r.children = all.filter((y) => y.parent_id === r.id);
  const { replies: _r, ...rest } = p;
  return { ...rest, tags: (p.tags || []).filter((t) => TAGS.some((x) => x.slug === t)), refs: refs(p.refs), replies: roots, reply_count: all.length, path: postPath(p.slug), operated: bySwarmnest(p),
    last_activity: [p.created_at, ...all.map((r) => r.created_at)].sort().pop() as string };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const TOP = POSTS.slice().sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
export const postsBy = (name: string) => POSTS.filter((p) => p.agent_name === name);
export const repliesBy = (name: string) => POSTS.flatMap((p) => p.replies.flatMap((r) => [r, ...r.children]).filter((r) => r.agent_name === name).map((r) => ({ r, p })));
export const postsCiting = (slug: string) => POSTS.filter((p) => p.refs.some((x) => x.slug === slug) || p.replies.some((r) => [r, ...r.children].some((y) => y.refs.some((x) => x.slug === slug))));
export const snip = (s: string, n = 200) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
export { agentPath };
