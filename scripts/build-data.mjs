import fs from 'node:fs';
const raw = fs.readFileSync('data/raw.txt','utf8').split('\n').filter(Boolean);
const status = {};
if (fs.existsSync('urlstatus.txt')) for (const l of fs.readFileSync('urlstatus.txt','utf8').split('\n')) { const [c,...u]=l.split(' '); if(u.length) status[u.join(' ')]=+c; }
const checked = process.env.CHECKED_AT || '2026-10-14';
// Per-url link check dates (scripts/link-check.mjs). A date is used only when it belongs to the status urlstatus.txt
// holds, otherwise the listing falls back to the date of the last full check.
const checkDates = fs.existsSync('data/urlcheck-dates.json') ? JSON.parse(fs.readFileSync('data/urlcheck-dates.json','utf8')) : {};
const checkedOn = (url) => { const d = checkDates[url]; return d && d.status === status[url] ? d.date : checked; };
const slugify = s => s.toLowerCase().replace(/&/g,' and ').replace(/\./g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const seen = new Set(); const out = [];
for (const line of raw) {
  const [category,name,url,docs_url,auth,pricing,...d] = line.split('|');
  const slug = slugify(name); if (seen.has(slug)) throw new Error('dup '+slug); seen.add(slug);
  out.push({ name, slug, category, description: d.join('|'), url, docs_url, auth, pricing, http_status: status[url] ?? null, last_checked_at: checkedOn(url), status: 'active' });
}
// facets: operating systems (explicit tags in data/entry-os.json, else from the text) and open source
const osOver = fs.existsSync('data/entry-os.json') ? JSON.parse(fs.readFileSync('data/entry-os.json','utf8')) : {};
const OSRX = [['macOS',/\bMac\b|macOS|Mac OS|Apple Silicon|\bMLX\b/],['Windows',/\bWindows\b(?! of)/],['Linux',/\bLinux\b/],['iOS',/\biOS\b|\biPhone\b/],['Android',/\bAndroid\b/]];
for (const e of out) {
  const t = e.name+' '+e.description.replace(/context windows?|time windows?|browser windows?|screenshots and windows/gi,'');
  const os = new Set(osOver[e.slug]||[]); for (const [n,rx] of OSRX) if (rx.test(t)) os.add(n);
  e.os = [...os];
  e.open_source = /^https?:\/\/(www\.)?(github\.com|gitlab\.com|codeberg\.org)\//.test(e.url) || /open[- ]source/i.test(e.description);
}
fs.writeFileSync('data/entries.json', JSON.stringify(out,null,1));
console.log('entries', out.length);

// ---- redirects: every historical URL -> current location in one hop ----
const cats = JSON.parse(fs.readFileSync('data/categories.json','utf8'));
const curCats = new Set(cats.map(c=>c.slug));
const catmap = JSON.parse(fs.readFileSync('data/catmap.json','utf8'));
const legacy = JSON.parse(fs.readFileSync('data/legacy.json','utf8'));
const curBySlug = Object.fromEntries(out.map(e=>[e.slug,e.category]));
const rules = new Map();
const resolveCat = c => { let n=0; while(!curCats.has(c)){ c=catmap[c]; if(!c||++n>5) return null; } return c; };
for (const c of legacy.cats) { if (curCats.has(c)) continue; const t=resolveCat(c); if(!t) throw new Error('no catmap for '+c); rules.set(`/directory/${c}/`, `/directory/${t}/`); }
for (const [c,s] of legacy.entries) {
  if (curBySlug[s]===c) continue;
  const from=`/directory/${c}/${s}/`;
  const rn = (legacy.renames||{})[s]; // renamed entries: old slug -> new slug
  if (curBySlug[s]) rules.set(from, `/directory/${curBySlug[s]}/${s}/`);
  else if (rn && curBySlug[rn]) rules.set(from, `/directory/${curBySlug[rn]}/${rn}/`);
  else { const t=resolveCat(c); if(t) rules.set(from, `/directory/${t}/`); }
}
fs.mkdirSync('public',{recursive:true});
fs.writeFileSync('public/_redirects', fs.readFileSync('data/redirects-static.txt','utf8').trimEnd()+'\n'+[...rules].map(([a,b])=>`${a} ${b} 301`).join('\n')+'\n');
console.log('redirect rules', rules.size);
if (rules.size>1900) throw new Error('too many redirects for _redirects limit');

// ---- shared search: one core for browser + API; vocab for typo correction ----
const tok = t => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const freq = new Map(); const bump=(w,n)=>{ if(w.length>=3 && !/^[0-9]+$/.test(w)) freq.set(w,(freq.get(w)||0)+n) };
for (const e of out) { tok(e.name).forEach(w=>bump(w,6)); }
for (const c of cats) { tok(c.name).forEach(w=>bump(w,8)); tok(c.slug).forEach(w=>bump(w,2)); }
for (const e of out) { tok(e.description).forEach(w=>bump(w,1)); }
try { const sk=JSON.parse(fs.readFileSync('data/skills.json','utf8')); const arr=Array.isArray(sk)?sk:(sk.skills||[]); for (const x of arr) { tok(x.title||'').forEach(w=>bump(w,4)); tok(x.category||'').forEach(w=>bump(w,4)); } } catch {}
for (const w of ['macos','mcp','swiftui','xcode','marketplace','template','templates','skills','pack','bundle']) bump(w,10);
const vocab=[...freq].filter(([w,f])=>f>=3).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1));
fs.writeFileSync('public/search-vocab.json', JSON.stringify(vocab));
const core=fs.readFileSync('search/core.js','utf8'), ui=fs.readFileSync('search/ui.js','utf8');
fs.writeFileSync('public/search.js', core+'\n'+ui);
fs.writeFileSync('public/search-all.js', core+'\n'+fs.readFileSync('search/ui-all.js','utf8'));
fs.mkdirSync('functions/_lib',{recursive:true});
fs.writeFileSync('functions/_lib/search-core.js', core+'\nexport default SwarmSearchCore;\n');
console.log('vocab', vocab.length);
