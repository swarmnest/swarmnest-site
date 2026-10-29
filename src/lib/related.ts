// "Related on Swarmnest": one topic map that links the same idea across the Directory, Agent Skills,
// the Marketplace, Use Cases and Agent Templates. Unknown slugs are dropped at build time.
import { CATS } from './data';
import catmap from '../../data/catmap.json';
const CM = catmap as Record<string, string>;
import { CATEGORIES } from './skills';
import { PRODUCTS, USECASES, TEMPLATES } from './content';
type Topic = { dir?: string[]; skills?: string[]; products?: string[]; usecases?: string[]; templates?: string[]; hub?: [string, string][] };
const TOPICS: Topic[] = [
  { dir: ['mcp-servers', 'mcp-sdks-dev-tools', 'ai-tool-directories', 'macos-mcp-servers', 'mcp-directories', 'agent-protocols'], skills: ['mcp-building-skills'], products: ['mcp-server-starter-kit'], hub: [['/smithery-alternatives/', 'Smithery Alternatives']] },
  { dir: ['macos-mcp-servers', 'mac-ai-agent-apps', 'mac-computer-use', 'mac-local-llm-runners'], skills: ['apple-macos-skills', 'mac-automation-skills', 'mac-admin-skills', 'mac-computer-use-skills', 'swift-swiftui-and-xcode-skills', 'homebrew-skills'], products: ['macos-app-dev-skills-pack'], usecases: ['build-and-ship-a-mac-app', 'automate-your-mac'], templates: ['mac-app-developer', 'mac-automation-assistant'], hub: [['/macos/', 'macOS Hub']] },
  { skills: ['apple-ios-skills', 'swift-swiftui-and-xcode-skills', 'app-store-connect-skills'], products: ['macos-app-dev-skills-pack'], hub: [['/macos/', 'macOS Hub']] },
  { dir: ['ai-coding-assistants', 'code-execution', 'developer-tools', 'cloud-dev-environments', 'code-security'], skills: ['code-review-skills', 'debugging-skills', 'software-engineering-skills', 'testing-skills', 'git-workflow-skills', 'cursor-rules'], products: ['coding-agent-skills-pack', 'project-memory-kit'], usecases: ['diagnose-deploy-failures'], templates: ['devops-helper'] },
  { dir: ['ci-cd', 'serverless-hosting', 'container-orchestration', 'uptime-monitoring'], skills: ['cloud-deployment-skills', 'cloudflare-skills'], products: ['coding-agent-skills-pack'], usecases: ['diagnose-deploy-failures'], templates: ['devops-helper'] },
  { dir: ['search-apis', 'web-search-engines', 'web-scraping-apis', 'scraping-libraries', 'content-extraction', 'academic-research', 'research-assistants'], products: ['web-research-skill-pack'], usecases: ['research-a-topic-with-sources'], templates: ['research-analyst'] },
  { dir: ['browser-automation', 'mac-computer-use', 'screenshot-apis'], skills: ['browser-automation-skills', 'mac-computer-use-skills'], products: ['web-research-skill-pack'] },
  { dir: ['support-helpdesk', 'live-chat-support', 'chat-bot-libraries'], products: ['customer-support-prompt-pack', 'ai-receptionist-kit'], usecases: ['answer-customer-questions'], templates: ['support-agent'] },
  { dir: ['crm-sales', 'lead-enrichment', 'email-apis', 'email-verification'], products: ['lead-research-workflow', 'ai-sdr-outbound-workflow'], usecases: ['find-prospects'], templates: ['lead-researcher'] },
  { dir: ['social-media-apis', 'newsletters', 'seo-tools', 'cms-content'], skills: ['content-creation-skills', 'writing-skills', 'marketing-skills'], products: ['content-repurposing-workflow'], usecases: ['rank-in-search', 'run-social-media'], templates: ['seo-writer', 'social-media-manager'] },
  { dir: ['workflow-automation', 'workflow-orchestration', 'visual-agent-builders'], skills: ['agent-workflow-skills'], products: ['workflow-reliability-pack'] },
  { dir: ['observability-evals', 'llm-benchmarks', 'security-guardrails'], skills: ['security-skills'], products: ['agent-eval-guardrails-pack'] },
  { dir: ['agent-frameworks', 'agent-memory', 'agent-standards-specs'], skills: ['skill-authoring-skills', 'plugin-bundles', 'agentsmd-templates'], products: ['agent-templates-pack', 'project-memory-kit', 'agent-builder-bundle'] },
  { dir: ['voice-agents', 'sms-voice', 'text-to-speech', 'speech-transcription'], skills: ['audio-skills'], products: ['ai-receptionist-kit'] },
  { dir: ['open-data', 'open-data-portals', 'datasets', 'government-statistics', 'data-viz-bi'], skills: ['data-analysis-skills', 'spreadsheet-skills'], usecases: ['analyze-open-data'], templates: ['data-analyst'] },
  { dir: ['calendars-scheduling', 'meetings-conferencing'], skills: ['workspace-integration-skills'], usecases: ['manage-inbox-and-schedule'], templates: ['executive-assistant'] },
  { dir: ['llm-apis', 'model-hosting-inference', 'local-inference', 'mac-local-llm-runners'], skills: ['ai-app-building-skills', 'machine-learning-skills'], products: ['agent-builder-bundle'] },
];
export type RelLink = { href: string; name: string; kind: string };
const dir = (s0: string): RelLink | null => { const s = CATS.some((x) => x.slug === s0) ? s0 : (CM[s0] || s0); const c = CATS.find((x) => x.slug === s); return c ? { href: `/directory/${s}/`, name: c.name, kind: 'Directory' } : null; };
const skl = (s: string): RelLink | null => { const c = CATEGORIES.find((x) => x.slug === s); return c ? { href: `/agent-skills/category/${s}/`, name: c.name, kind: 'Agent Skills' } : null; };
const prd = (s: string): RelLink | null => { const p = PRODUCTS.find((x) => x.slug === s); return p ? { href: `/marketplace/${s}/`, name: p.title, kind: `Marketplace · ${p.price}` } : null; };
const uc = (s: string): RelLink | null => { const u = USECASES.find((x) => x.slug === s); return u ? { href: `/use-cases/${s}/`, name: u.name, kind: 'Use Case' } : null; };
const tpl = (s: string): RelLink | null => { const t = TEMPLATES.find((x) => x.slug === s); return t ? { href: `/agent-templates/${t.slug}/`, name: t.name, kind: 'Agent Template' } : null; };
const linksOf = (t: Topic): RelLink[] => [
  ...(t.hub || []).map(([href, name]) => ({ href, name, kind: 'Hub' })),
  ...(t.products || []).map(prd), ...(t.skills || []).map(skl), ...(t.dir || []).map(dir), ...(t.usecases || []).map(uc), ...(t.templates || []).map(tpl),
].filter((l, i, a) => l && a.findIndex((x) => x && x.href === l.href) === i) as RelLink[];
// self: the current page path. Returns links from every topic that contains this page, without the page itself.
export function relatedFor(self: string, max = 8): RelLink[] {
  const seen = new Set([self]); const out: RelLink[] = [];
  for (const t of TOPICS) {
    const ls = linksOf(t); if (!ls.some((l) => l.href === self)) continue;
    for (const l of ls) if (!seen.has(l.href)) { seen.add(l.href); out.push(l); }
  }
  // Mix kinds so one type does not crowd out the others.
  const byKind = new Map<string, RelLink[]>(); for (const l of out) { const k = l.kind.split(' ·')[0]; byKind.set(k, [...(byKind.get(k) || []), l]); }
  const mixed: RelLink[] = []; let added = true;
  while (mixed.length < max && added) { added = false; for (const arr of byKind.values()) { const l = arr.shift(); if (l && mixed.length < max) { mixed.push(l); added = true; } } }
  return mixed;
}
