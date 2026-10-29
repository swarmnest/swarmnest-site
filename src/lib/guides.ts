// Guides registry: every comparison, alternatives, best-of and how-to guide on Swarmnest.
// Add a guide here and it appears on /guides/ (grouped by topic), on the homepage, in the sitemap,
// in llms.txt, and on every directory category page listed in `cats`.
import { GUIDES as SKILL_GUIDES } from './skills';
export type Topic = { slug: string; name: string; blurb: string };
export const TOPICS: Topic[] = [
  { slug: 'alternatives', name: 'Alternatives and Migrations', blurb: 'Where to move when a tool shuts down or changes, with step-by-step migration help.' },
  { slug: 'mcp', name: 'MCP Servers', blurb: 'Which Model Context Protocol servers to install, and how to set them up.' },
  { slug: 'memory', name: 'Agent Memory', blurb: 'Memory layers that let agents remember users and facts across sessions.' },
  { slug: 'frameworks', name: 'Agent Frameworks', blurb: 'Frameworks and SDKs for building single agents and multi-agent systems.' },
  { slug: 'browser', name: 'Browser Automation', blurb: 'Libraries, cloud browsers and MCP servers that let agents use the web.' },
  { slug: 'skills', name: 'Agent Skills', blurb: 'Working with skills, plugins and rules for Claude, Codex, Cursor and more.' },
];
export type Guide = { path: string; title: string; short: string; blurb: string; topic: string; cats: string[]; updated: string; badge?: string };
export const ALL_GUIDES: Guide[] = [
  { path: '/smithery-alternatives/', title: 'Smithery Alternatives: Where to Move Your MCP Servers', short: 'Smithery Alternatives', blurb: "Smithery's hosted MCP proxy, CLI and API stop on Oct 31, 2026. How to migrate, plus 12 registries and hosts compared.", topic: 'alternatives', cats: ['mcp-servers', 'mcp-sdks-dev-tools', 'ai-tool-directories', 'agent-protocols'], updated: '2026-10-29', badge: 'Oct 31 Deadline' },
  { path: '/guides/openai-agent-builder-alternatives/', title: 'OpenAI Agent Builder Alternatives', short: 'OpenAI Agent Builder Alternatives', blurb: 'Agent Builder shuts down Nov 30, 2026. How to export your workflows, and visual builders and SDKs to move to.', topic: 'alternatives', cats: ['visual-agent-builders', 'agent-frameworks', 'workflow-automation'], updated: '2026-10-29', badge: 'Nov 30 Deadline' },
  { path: '/guides/best-mcp-servers-for-claude-code-and-cursor/', title: 'Best MCP Servers for Claude Code and Cursor', short: 'Best MCP Servers for Claude Code and Cursor', blurb: '14 official MCP servers worth installing for coding agents, with the exact URL or command for each.', topic: 'mcp', cats: ['mcp-servers', 'ai-coding-assistants'], updated: '2026-10-29' },
  { path: '/guides/mem0-vs-zep-vs-letta/', title: 'Mem0 vs Zep vs Letta: Agent Memory Compared', short: 'Mem0 vs Zep vs Letta', blurb: 'How the three best-known agent memory layers differ in design, open source, self-hosting and price.', topic: 'memory', cats: ['agent-memory', 'agent-frameworks'], updated: '2026-10-29' },
  { path: '/guides/crewai-vs-langgraph-vs-autogen/', title: 'CrewAI vs LangGraph vs AutoGen', short: 'CrewAI vs LangGraph vs AutoGen', blurb: 'Which multi-agent framework to pick in 2026, now that AutoGen is in maintenance mode.', topic: 'frameworks', cats: ['agent-frameworks'], updated: '2026-10-29' },
  { path: '/guides/browser-automation-tools-for-ai-agents/', title: 'Browser Automation Tools for AI Agents Compared', short: 'Browser Automation Tools for AI Agents', blurb: 'Playwright, Browser Use, Stagehand, Browserbase, Steel and more: libraries, cloud browsers and MCP servers side by side.', topic: 'browser', cats: ['browser-automation', 'mac-ai-agent-apps', 'scraping-libraries'], updated: '2026-10-29' },
  ...SKILL_GUIDES.map((g) => ({ path: `/agent-skills/guides/${g.slug}/`, title: g.title, short: g.title, blurb: g.blurb, topic: 'skills', cats: [] as string[], updated: g.updated })),
];
export const guidesForCat = (slug: string) => ALL_GUIDES.filter((g) => g.cats.includes(slug));
export const guidesByTopic = () => TOPICS.map((t) => ({ ...t, guides: ALL_GUIDES.filter((g) => g.topic === t.slug) })).filter((t) => t.guides.length);
export const guide = (path: string) => ALL_GUIDES.find((g) => g.path === path)!;
