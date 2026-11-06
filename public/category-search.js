/* In-category search + filter chips. Client-side only; loads the index lazily on first focus/typing. */
(function(){function snInit(n){n=String(n||'');var p=n.replace(/[^\p{L}\p{N}\s&+-]/gu,' ').trim().split(/[\s&+/_-]+/).filter(function(w){return w&&!/^(the|a|an|of|for|and|ai|api|mcp)$/i.test(w)});var i=(!p.length?n.slice(0,2):(p.length===1?p[0].slice(0,2):p[0][0]+p[1][0])).toUpperCase()||'?';var h=0;for(var k=0;k<n.length;k++)h=(h*31+n.charCodeAt(k))>>>0;var bases=[38,210,160,280,12,190,320,55];var hue=bases[h%bases.length];var s=document.createElement('span');s.className='llogo';s.style.cssText='--logo-size:32px;--logo-hue:'+hue;s.setAttribute('aria-hidden','true');var x=document.createElement('span');x.className='llogo-init';x.textContent=i;s.appendChild(x);return s}function snCardHead(name){var wrap=document.createElement('span');wrap.className='card-head';wrap.appendChild(snInit(name));var t=document.createElement('h3');t.textContent=name;wrap.appendChild(t);return wrap}var f=document.getElementById('cs'),q=document.getElementById('cq'),list=document.getElementById('cs-list'),out=document.getElementById('cs-results'),st=document.getElementById('cs-status');
if(!f||!q||!list||!window.SwarmSearchCore)return;f.hidden=false;
var cat=list.getAttribute('data-cat'),cards=[].slice.call(list.children),chips=[].slice.call(f.querySelectorAll('.chip')),flt={},data=null,loading=null;
function load(){if(loading)return loading;loading=Promise.all([fetch('/search-index.json').then(function(r){return r.json()}),fetch('/search-vocab.json').then(function(r){return r.json()})]).then(function(a){var SC=SwarmSearchCore;
var rows=SC.prepare(a[0].filter(function(r){return r[2]===cat}).map(function(r){return{name:r[0],description:r[1],category:r[2],category_name:r[3],auth:r[4],pricing:r[5],swarmnest_url:r[6]}}));data={rows:rows,vocab:a[1],known:SC.mkVocab(a[1])}}).catch(function(){loading=null;throw 0});return loading}
var PL={free:'Free',freemium:'Free tier',paid:'Paid',unknown:'See site'},AL={none:'No auth',key:'API key',oauth:'OAuth',unknown:'See docs'};
function badge(t){var b=document.createElement('span');b.className='badge';b.textContent=t;return b}
function msg(n,extra){st.textContent=n+' result'+(n===1?'':'s')+(extra||'')}
function apply(){var term=q.value.trim(),active=term||flt.pricing||flt.auth;
if(!active){out.hidden=true;out.replaceChildren();list.hidden=false;cards.forEach(function(c){c.hidden=false});st.textContent='';return}
if(!term){var n=0;out.hidden=true;list.hidden=false;cards.forEach(function(c){var ok=(!flt.pricing||c.dataset.pricing===flt.pricing)&&(!flt.auth||c.dataset.auth===flt.auth);c.hidden=!ok;if(ok)n++});msg(n);return}
load().then(function(){if(q.value.trim()!==term)return;var r=SwarmSearchCore.run(data.rows,data.vocab,data.known,term,{category:cat,pricing:flt.pricing,auth:flt.auth});
list.hidden=true;out.hidden=false;
if(!r.hits.length){var p=document.createElement('p');p.textContent='No matches in this category. Try fewer words or clear the filters, or search the whole directory.';out.replaceChildren(p);msg(0);return}
out.replaceChildren.apply(out,r.hits.map(function(h){var e=h.e,a=document.createElement('a');a.className='card with-logo';a.href=e.swarmnest_url;var d=document.createElement('p');d.textContent=e.description;a.append(snCardHead(e.name),d,badge(PL[e.pricing]||e.pricing),badge(AL[e.auth]||e.auth));return a}));
msg(r.total,r.corrected?' — showing results for "'+r.corrected+'"':'')}).catch(function(){list.hidden=false;out.hidden=true;st.textContent='Search is unavailable right now. Browse the list below.'})}
var tm;q.addEventListener('focus',function(){load().catch(function(){})},{once:true});
q.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(apply,60)});
chips.forEach(function(b){b.addEventListener('click',function(){var k=b.dataset.f,on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',on);if(on)flt[k]=b.dataset.v;else delete flt[k];apply()})});
})();
