import { ALL_GUIDES } from '../lib/guides';
import { LAUNCH } from '../lib/config';
import { TEMPLATES, USECASES, PRODUCTS } from '../lib/content';
import { ALL, CATS, GROUPS, byCat, SITE } from '../lib/data';
import { SKILLS, CATEGORIES, FORMATS, platformsUsed, GUIDES } from '../lib/skills';
export const GET = () => new Response(`# Swarmnest

> Swarmnest is a hub for AI agents and the people who run them. Its core is a hand-checked directory of ${ALL.length} tools, APIs, MCP servers and data sources, available as human pages and as JSON. It also has ${USECASES.length} use cases, ${TEMPLATES.length} ready-made agent templates, and a marketplace of Swarmnest's own products.

## Machine-Readable
- [MCP server](${SITE}/mcp): remote Model Context Protocol endpoint (Streamable HTTP, no API key) with read-only tools search_directory, get_entry, list_categories, search_skills, get_skill and list_marketplace_products. Setup for Claude, Cursor, VS Code and Windsurf: ${SITE}/mcp-server/
- [Directory JSON](${SITE}/directory.json): every entry with name, slug, category, description, url, docs_url, auth, pricing
- [API: list](${SITE}/api/v1/directory.json)
- [API: one entry](${SITE}/api/v1/directory/{slug}.json): replace {slug}, e.g. ${SITE}/api/v1/directory/${ALL[0].slug}.json
- [API: search](${SITE}/api/v1/search?q=translate&category=translation-apis&limit=10): GET, params q (keywords, all must match), category (slug), auth (none|key|oauth), pricing (free|freemium|paid), limit (max 100). Returns ranked JSON results. Human search: ${SITE}/search/
- [API: categories](${SITE}/api/v1/categories.json)
- [OpenAPI description](${SITE}/openapi.json)
- [Full text version of this site](${SITE}/llms-full.txt)
- [Sitemap](${SITE}/sitemap.xml)

## Directory Categories (${CATS.length} in ${GROUPS.length} groups)
${GROUPS.map(g=>`### ${g.name}\n${g.blurb}\n${g.cats.map(c=>`- [${c.name}](${SITE}/directory/${c.slug}/): ${c.blurb} (${byCat(c.slug).length} entries)`).join('\n')}`).join('\n\n')}

## Agent Skills (${SKILLS.length} Skills, Plugins, Rules and Templates; All Third-Party)
- [Hub and search](${SITE}/agent-skills/) and [JSON](${SITE}/api/v1/agent-skills.json): static JSON of every listing with format, category, declared platforms, has_scripts (true, false or null), uses_network, needs_credentials, license and source_url
- Formats: ${FORMATS.map(f=>`[${f.name}](${SITE}/agent-skills/format/${f.slug}/)`).join(', ')}
- Platforms (as declared by the source): ${platformsUsed.map(p=>`[${p.name}](${SITE}/agent-skills/platform/${p.slug}/)`).join(', ')}. JSON per platform: ${SITE}/api/v1/agent-skills/platform/{platform}.json
- Categories (${CATEGORIES.length}): ${CATEGORIES.map(c=>`[${c.name}](${SITE}/agent-skills/category/${c.slug}/)`).join(', ')}. JSON per category: ${SITE}/api/v1/agent-skills/category/{category}.json. One skill with install steps: ${SITE}/api/v1/agent-skills/{slug}.json
${GUIDES.map(g=>`- [${g.title}](${SITE}/agent-skills/guides/${g.slug}/): ${g.blurb}`).join('\n')}
- [Submit a skill](${SITE}/agent-skills/submit/)

## Pages
- [Guides](${SITE}/guides/): comparisons, best-of lists and migration guides, grouped by topic
${ALL_GUIDES.filter(g=>!g.path.startsWith('/agent-skills/')).map(g=>`- [${g.short}](${SITE}${g.path}): ${g.blurb}`).join('\n')}
- [About](${SITE}/about/)
- [Submit a tool](${SITE}/submit/): email hello@swarmnest.ai
- [Terms](${SITE}/terms/)
- [Privacy](${SITE}/privacy/)
- [API terms](${SITE}/api-terms/)
- [All legal policies](${SITE}/legal/)
- [Refunds](${SITE}/refunds/)
- [Takedown](${SITE}/takedown/)
- [Advertise](${SITE}/advertise/): labeled sponsored placements, $29 to $99 a month; never affects ranking
- [Sponsorship terms](${SITE}/sponsorship-terms/)

## AI Agent Use Cases: Jobs Agents Can Do
- [Index](${SITE}/use-cases/) and [JSON](${SITE}/api/v1/use-cases.json)
${USECASES.map(u=>`- [${u.name}](${SITE}/use-cases/${u.slug}/): ${u.goal}`).join('\n')}

## Agent Templates (Ready-Made Agents: Instructions, Guardrails, Tools, Persona and Tone)
- [Index](${SITE}/agent-templates/) and [JSON](${SITE}/api/v1/agent-templates.json)
${TEMPLATES.map(p=>`- [${p.name}](${SITE}/agent-templates/${p.slug}/): ${p.role}`).join('\n')}

## Marketplace (${LAUNCH?'for sale':'Coming Soon, Not for Sale Yet'})
- [Marketplace](${SITE}/marketplace/) and [JSON](${SITE}/api/v1/products.json)
${PRODUCTS.map(p=>`- [${p.title}](${SITE}/marketplace/${p.slug}/): ${p.summary}${LAUNCH?' ('+p.price+')':''}`).join('\n')}

## Notes
- Fields: auth is none, key or oauth; pricing is free, freemium or paid.
- Descriptions are original summaries and may lag the vendors' own docs; follow docs_url for authority.
- Swarmnest is not affiliated with listed tools. Contact: hello@swarmnest.ai
`,{headers:{'content-type':'text/plain; charset=utf-8'}});
