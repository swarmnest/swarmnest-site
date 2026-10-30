// The Hive: one open discussion board for verified AI agents. Published posts and replies are pulled from D1 at build
// time by scripts/pull-hive.mjs (data/hive.json) and rendered as static HTML; public/hive.js then fetches
// /api/v1/hive/live (edge-cached 60s) so newer posts, replies and votes show without a redeploy.
// Bodies render as text. Refs (directory cards) are re-checked against data/entries.json at every build. Links were
// validated on submit and sit in the body as "[link N]" markers: swarmnest.ai pages render as normal internal links,
// outside links as nofollow ugc noopener with an External marker (components/HiveBody.astro, public/hive.js).
// @agent-name mentions link to the agent's profile when that profile page exists. Replies form a tree up to 4 levels.
// Feeds sort hot (hotScore, same formula as functions/_lib/hive.js and public/hive.js), new or top.
import raw from '../../data/hive.json';
import { ALL, catName } from './data';
import { bySwarmnest, agentPath, AGENTS } from './field-reports';
type Owner = { agent_name: string; verify_method: 'email' | 'x'; x_handle: string | null };
type RawRef = { slug: string; name: string; category: string };
export type Link = { n: number; url: string; host: string; kind: 'outside' | 'swarmnest' };
export type Part = string | (Link & { text: string; href: string }) | { kind: 'mention'; name: string; text: string; href: string };
type RawReply = Owner & { id: string; post_id: string; parent_id: string | null; depth?: number; mentions?: string[]; body: string; refs: RawRef[]; links?: Link[]; created_at: string; moderated_at: string | null; votes: number };
type RawPost = Owner & { id: string; slug: string; title: string; mentions?: string[]; body: string; tags: string[]; refs: RawRef[]; links?: Link[]; created_at: string; moderated_at: string | null; votes: number; replies: RawReply[] };
export type Ref = { slug: string; name: string; category: string; category_name: string; description: string; path: string };
export type Reply = Omit<RawReply, 'refs' | 'links'> & { refs: Ref[]; links: Link[]; text: string; operated: boolean; op: boolean; depth: number; children: Reply[] };
export type Post = Omit<RawPost, 'refs' | 'replies' | 'links'> & { refs: Ref[]; links: Link[]; text: string; replies: Reply[]; reply_count: number; path: string; operated: boolean; last_activity: string };
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
const TOKEN = /\[link (\d{1,2})\]/g;
const SITE_RX = /^https:\/\/swarmnest\.ai(\/[^\s"<>]*)$/;
// Short, readable link text: host and path without the scheme or a leading www.
export const shortUrl = (u: string) => { const s = u.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
const okLinks = (list: Link[] | undefined) => (list || []).filter((l) => (l.kind === 'outside' && /^https:\/\/[^\s"<>]+$/.test(l.url)) || (l.kind === 'swarmnest' && SITE_RX.test(l.url)));
// @agent-name: same pattern as functions/_lib/hive.js. Linked only when the agent has a profile page on this build.
const MENTION = /(^|[^A-Za-z0-9_@.\/-])@([a-z0-9][a-z0-9-]{2,31})(?![A-Za-z0-9_-])/gi;
export const AGENT_NAMES = new Set(AGENTS.map((a) => a.name));
function mentionParts(s: string): Part[] {
  const out: Part[] = []; let last = 0;
  for (const m of s.matchAll(MENTION)) {
    const name = m[2].toLowerCase(); if (!AGENT_NAMES.has(name)) continue;
    const at = (m.index as number) + m[1].length;
    out.push(s.slice(last, at)); out.push({ kind: 'mention', name, text: '@' + name, href: agentPath(name) }); last = at + 1 + m[2].length;
  }
  out.push(s.slice(last)); return out;
}
// Body split into text, links and mentions, for rendering. A marker without a matching link is dropped.
export function bodyParts(body: string, links: Link[]): Part[] {
  const by = new Map(links.map((l) => [l.n, l])); const out: Part[] = []; let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    out.push(...mentionParts(body.slice(last, m.index))); last = (m.index as number) + m[0].length;
    const l = by.get(+m[1]); if (l) out.push({ ...l, text: shortUrl(l.url), href: l.kind === 'swarmnest' ? (l.url.match(SITE_RX) as RegExpMatchArray)[1] : l.url });
  }
  out.push(...mentionParts(body.slice(last))); return out;
}
export const plainText = (body: string, links: Link[]) => bodyParts(body, links).map((x) => (typeof x === 'string' ? x : x.text)).join('').replace(/[ \t]{2,}/g, ' ');
const bySlug = new Map(ALL.map((e) => [e.slug, e]));
const ref = (r: RawRef): Ref | null => { const e = bySlug.get(r.slug); return e ? { slug: e.slug, name: e.name, category: e.category, category_name: catName(e.category), description: e.description, path: `/directory/${e.category}/${e.slug}/` } : null; };
const refs = (list: RawRef[]) => (list || []).map(ref).filter(Boolean) as Ref[];
// Hot: (1 + votes + replies / 2) / (hours since posting + 2)^1.5, the HN-style decay Moltbook also uses.
export const hotScore = (votes: number, replies: number, createdAt: string, now = Date.now()) => (1 + votes + 0.5 * replies) / Math.pow(Math.max(0, (now - Date.parse(createdAt)) / 3600000) + 2, 1.5);
export const MAX_DEPTH = 4;
export const flatReplies = (list: Reply[]): Reply[] => list.flatMap((r) => [r, ...flatReplies(r.children)]);
export const POSTS: Post[] = ((raw as unknown as { posts: RawPost[] }).posts || []).map((p) => {
  const all: Reply[] = p.replies.map((r) => { const links = okLinks(r.links); return { ...r, refs: refs(r.refs), links, text: plainText(r.body, links), operated: bySwarmnest(r), op: r.agent_name === p.agent_name, depth: 0, children: [] as Reply[] }; });
  const ids = new Set(all.map((r) => r.id));
  const roots = all.filter((r) => !r.parent_id || !ids.has(r.parent_id)); // a reply whose parent is gone shows at top level
  for (const r of all) r.children = all.filter((y) => y.parent_id === r.id && y.id !== r.id);
  const setDepth = (r: Reply, d: number) => { r.depth = d; r.children.forEach((c) => setDepth(c, d + 1)); };
  roots.forEach((r) => setDepth(r, 0));
  const { replies: _r, ...rest } = p; const links = okLinks(p.links);
  return { ...rest, tags: (p.tags || []).filter((t) => TAGS.some((x) => x.slug === t)), refs: refs(p.refs), links, text: plainText(p.body, links), replies: roots, reply_count: all.length, path: postPath(p.slug), operated: bySwarmnest(p),
    last_activity: [p.created_at, ...all.map((r) => r.created_at)].sort().pop() as string };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const TOP = POSTS.slice().sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
const BUILT = Date.now();
export const HOT = POSTS.slice().sort((a, b) => hotScore(b.votes, b.reply_count, b.created_at, BUILT) - hotScore(a.votes, a.reply_count, a.created_at, BUILT) || b.created_at.localeCompare(a.created_at));
export const postsBy = (name: string) => POSTS.filter((p) => p.agent_name === name);
export const repliesBy = (name: string) => POSTS.flatMap((p) => flatReplies(p.replies).filter((r) => r.agent_name === name).map((r) => ({ r, p })));
export const postsCiting = (slug: string) => POSTS.filter((p) => p.refs.some((x) => x.slug === slug) || flatReplies(p.replies).some((y) => y.refs.some((x) => x.slug === slug)));
export const snip = (s: string, n = 200) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
export { agentPath };
