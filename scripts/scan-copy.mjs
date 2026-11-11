// Pre-deploy copy check: fails if any built page, llms*.txt, JSON API or client script contains draft notes,
// internal caveats, placeholders or self-undermining disclaimers. Real product names and customer instructions are allowlisted.
// Usage: node scripts/scan-copy.mjs [dist]   (exit 1 on any match)
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
const dist = process.argv[2] || new URL('../dist', import.meta.url).pathname;
const TERMS = ['draft', 'not yet', 'lawyer', 'attorney', 'not legal advice', 'not reviewed', 'not tested', 'untested', 'placeholder', 'todo', 'tbd', 'fixme', 'xxx', 'coming soon', 'soon after launch', 'under construction', 'work in progress', 'wip', 'example\\.com', 'example\\.org', 'lorem ipsum', 'internal notes?', 'note to self', 'do not publish', 'for internal use', 'tba', 'to be (?:published|announced|added|confirmed|determined)', 'not for sale yet',
  // Wording that makes the site look new, small or unsponsored (user rule, Oct 2026).
  'where things stand', 'just launched', 'recently launched', 'newly launched', 'no sponsors yet', 'no sponsored listings', 'be the first to (?:advertise|sponsor)', 'first sponsor', 'founding (?:sponsors?|prices?|rates?)', 'early days', 'brand[- ]new (?:site|website|project)', 'young project', 'just getting started', 'low traffic', 'small audience', 'growing audience', 'nobody advertises', 'no advertisers'];
const RE = new RegExp(`(?<![\\w-])(?:${TERMS.join('|')})(?![\\w-])`, 'gi');
// Allowlisted phrases (removed before matching): real product names, and customer-facing instructions about the customer's own drafts.
export const ALLOW = [
  /JSON ?Placeholder/gi, /Lorem (Picsum|Flickr)/gi, /OAuth 2\.1 Draft/gi, /draft-ietf-[\w-]+/gi, /Internet-Draft/gi,
  /\bdraft(s|ed|ing)? (a polite|a reply|an |polite |replies|reply|posts?|emails?|invites?|only|for (human )?(approval|review))/gi, /\b(drafts?|draft replies) (only|for approval|you want|and unpublished|and sharing)/gi,
  /\b(Draft|Drafts) (a |an |search-friendly |posts |replies )/g, /(publish|migrate|keep) (any |the )?drafts?/gi, /\bdraft (reply|replies|post|posts|email|emails|invite|article|articles)\b/gi,
  /\ban agent can draft\b/gi, // product description: "an agent can draft and schedule posts"
  /present drafts/gi, /drafting\b/gi, /draft the invite/gi, /then a draft with/gi, /for this draft\./gi, /short thread draft/gi, /your first draft with Trint/gi, /(outlines|drafts), (drafts|meta descriptions|ranked)/gi,
  /reveal internal notes/gi, // support-agent template guardrail (a customer instruction)
  /placeholder (text|images?|data|photos?|api)/gi, /\{\{?[A-Z_]+\}?\} placeholders?/g,
];
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.(html|txt|json|js|xml)$/.test(f)) files.push(p); } }; walk(dist);
const visible = (html) => html
  .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*?\s(?:alt|title|aria-label|content|value|placeholder)="([^"]*)"[^>]*>/gi, ' $1 ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
// For client scripts, only string literals can reach the page.
const strings = (js) => (js.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || []).join(' \n ');
const hits = [];
for (const f of files) {
  const rel = relative(dist, f); let raw = readFileSync(f, 'utf8');
  if (rel.startsWith('_') || rel.endsWith('.map') || rel === 'search-vocab.json') continue; // search-vocab.json is a word index of listing text, not copy
  let text = f.endsWith('.html') ? visible(raw) : f.endsWith('.js') ? strings(raw) : raw;
  for (const a of ALLOW) text = text.replace(a, ' ');
  for (const m of text.matchAll(RE)) hits.push(`${rel}: "${text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).trim()}"`);
}
if (hits.length) { console.log(`COPY SCAN FAILED: ${hits.length} match(es) in ${files.length} files`); for (const h of hits.slice(0, 200)) console.log(' ', h); process.exit(1); }
console.log(`copy scan OK: ${files.length} files, 0 matches`);
