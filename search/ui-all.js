/* Unified site search (static index, no server calls): categories first, then tools, skills, packs, use cases and templates. */
(function(){function snInit(n){n=String(n||'');var p=n.replace(/[^\p{L}\p{N}\s&+-]/gu,' ').trim().split(/[\s&+/_-]+/).filter(function(w){return w&&!/^(the|a|an|of|for|and|ai|api|mcp)$/i.test(w)});var i=(!p.length?n.slice(0,2):(p.length===1?p[0].slice(0,2):p[0][0]+p[1][0])).toUpperCase()||'?';var h=0;for(var k=0;k<n.length;k++)h=(h*31+n.charCodeAt(k))>>>0;var bases=[38,210,160,280,12,190,320,55];var hue=bases[h%bases.length];var s=document.createElement('span');s.className='llogo';s.style.cssText='--logo-size:32px;--logo-hue:'+hue;s.setAttribute('aria-hidden','true');var x=document.createElement('span');x.className='llogo-init';x.textContent=i;s.appendChild(x);return s}function snCardHead(name){var wrap=document.createElement('span');wrap.className='card-head';wrap.appendChild(snInit(name));var t=document.createElement('h3');t.textContent=name;wrap.appendChild(t);return wrap}var rows=null,vocab=null,known=null,P=null;
var KIND={c:'Directory Category',g:'Directory Group',k:'Agent Skills Category',h:'Hub',e:'Tool',s:'Agent Skill',p:'Marketplace',u:'Use Case',t:'Agent Template'};
var TAB={all:null,dir:{e:1,c:1,g:1,t:1},skills:{s:1,k:1},market:{p:1}};
var SYN={mac:'macos',osx:'macos',macbook:'macos',db:'database',dbs:'databases',k8s:'kubernetes',js:'javascript',ts:'typescript',tts:'tts',stt:'stt',llms:'llm',agents:'agent'};
function load(){return P||(P=Promise.all([fetch('/search-all.json').then(function(r){return r.json()}),fetch('/search-vocab.json').then(function(r){return r.json()})]).then(function(a){
rows=SwarmSearchCore.prepare(a[0].map(function(r){return{t:r[0],name:r[1],description:r[2],url:r[3],label:String(r[4]||''),category:r[0],category_name:String(r[4]||'')+' '+(r[5]||''),auth:'',pricing:''}}));vocab=a[1];known=SwarmSearchCore.mkVocab(vocab)}))}
function syn(q){return q.toLowerCase().split(/\s+/).map(function(w){return SYN[w]||w}).join(' ')}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
window.swarmSearchAll=function(input,out,opts){opts=opts||{};var max=opts.max||12,tab='all',status=opts.status||null,more=opts.more!==false;
function render(){var q=input.value.trim();if(!q){out.classList.add('hidden');out.replaceChildren();if(status)status.textContent='';return}
load().then(function(){var r=SwarmSearchCore.run(rows,vocab,known,syn(q)),allow=TAB[tab];
var hits=r.hits.map(function(h){return h.e}).filter(function(e){return !allow||allow[e.t]});
var cats=hits.filter(function(e){return e.t==='c'||e.t==='k'||e.t==='g'||e.t==='h'}).slice(0,opts.maxCats||5);
var rest=hits.filter(function(e){return !(e.t==='c'||e.t==='k'||e.t==='g'||e.t==='h')});
out.classList.remove('hidden');var kids=[];
var msg=hits.length?(hits.length+' result'+(hits.length===1?'':'s')+(r.corrected?' for "'+r.corrected+'"':'')):'No matches. Try fewer words or a broader term.';
if(status)status.textContent=msg;kids.push(el('p','small sr-head',msg));
if(cats.length){var ul=el('ul','sr-cats');ul.setAttribute('aria-label','Matching Categories');cats.forEach(function(e){var li=el('li'),a=el('a');a.href=e.url;var n=el('span',null,e.name);var k=el('span','k',KIND[e.t]+(e.label&&e.t!=='h'?' · '+e.label:''));a.append(n,k);li.append(a);ul.append(li)});kids.push(ul)}
rest.slice(0,max).forEach(function(e){var a=el('a','card with-logo');a.href=e.url;a.append(snCardHead(e.name),el('p',null,e.description));var b=el('span','badge t',KIND[e.t]);a.append(b);if(e.label&&e.t!=='u'&&e.t!=='t'){a.append(el('span','badge',e.label))}kids.push(a)});
if(more&&rest.length>max){var m=el('p','sr-more'),ma=el('a','btn alt','See All '+hits.length+' Results');ma.href='/search/?q='+encodeURIComponent(q);m.append(ma);kids.push(m)}
out.replaceChildren.apply(out,kids)})}
var tm;input.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(render,input.value.trim()?80:0)});input.addEventListener('focus',load,{once:true});
if(opts.tabs){opts.tabs.querySelectorAll('button[data-tab]').forEach(function(b){b.addEventListener('click',function(){tab=b.getAttribute('data-tab');opts.tabs.querySelectorAll('button[data-tab]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});render()})})}
if(input.value)render();return{render:render}}})();
