/* Swarmnest search core — shared by the browser (public/search.js) and /api/v1/search. Do not edit the generated copies. */
var SwarmSearchCore=(function(){
var SW={to:1,'for':1,the:1,a:1,an:1,and:1,of:1,'in':1,on:1,'with':1,api:1,apis:1,tool:1,tools:1};
function stem(t){return t.length>5?t.replace(/ations?$/,'at').replace(/(ings?|ions?|ers?|es|ed|s|e)$/,''):t}
function nz(x){return x.toLowerCase().replace(/[-_\/]+/g,' ')}
function words(s){return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)}
function norm(q){return q.toLowerCase().replace(/[^a-z0-9+#.\s-]/g,' ').replace(/\s+/g,' ').trim().slice(0,200)}
function osa(a,b,max){var m=a.length,n=b.length;if(Math.abs(m-n)>max)return max+1;var p2=null,p=[],i,j;for(j=0;j<=n;j++)p[j]=j;
for(i=1;i<=m;i++){var c=[i],lo=i;for(j=1;j<=n;j++){var v=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1));
if(i>1&&j>1&&a.charCodeAt(i-1)===b.charCodeAt(j-2)&&a.charCodeAt(i-2)===b.charCodeAt(j-1))v=Math.min(v,p2[j-2]+1);c[j]=v;if(v<lo)lo=v}
if(lo>max)return max+1;p2=p;p=c}return p[n]}
// vocab: array of [word,freq] ; returns best correction for an unknown term or null
function correct(t,vocab,known){if(t.length<4||known[t]||/[0-9.+#]/.test(t))return null;var max=t.length>=8?2:1,best=null,bd=9,bf=-1;
for(var i=0;i<vocab.length;i++){var w=vocab[i][0];if(Math.abs(w.length-t.length)>max)continue;var d=osa(t,w,max);if(d>max)continue;
if(d<bd||(d===bd&&vocab[i][1]>bf)){best=w;bd=d;bf=vocab[i][1]}}return best}
function prepare(rows){rows.forEach(function(e){if(e._n!==undefined)return;e._n=e.name.toLowerCase();e._c=(e.category_name+' '+e.category).toLowerCase();e._d=e.description.toLowerCase();e._x=e.auth+' '+e.pricing;e._cn=nz(e.category_name);e._nn=nz(e.name);e._dn=nz(e.description)});return rows}
function mkVocab(vocab){var k={};vocab.forEach(function(v){k[v[0]]=1});return k}
function score(e,ts){var s=0;for(var i=0;i<ts.length;i++){var t=ts[i],m=0;if(e._n===t)m=12;else if(e._n.indexOf(t)===0)m=9;else if(e._n.indexOf(t)>-1)m=7;else if(e._c.indexOf(t)>-1)m=4;else if(e._d.indexOf(t)>-1)m=2;else if(e._x.indexOf(t)>-1)m=1;if(!m)return 0;s+=m}return s}
function bonus(e,Q,ts){if(Q.indexOf(' ')<0)return 0;var b=0;if(e._cn.indexOf(Q)>-1)b+=20;if(e._nn.indexOf(Q)>-1)b+=15;if(e._dn.indexOf(Q)>-1)b+=5;return b}
function run(rows,vocab,known,q,o){o=o||{};q=norm(q||'');var filt=rows.filter(function(e){return(!o.category||e.category===o.category)&&(!o.auth||e.auth===o.auth)&&(!o.pricing||e.pricing===o.pricing)});
var raw=q.split(' ').filter(Boolean).slice(0,8),corrected=false,fixed=raw.map(function(t){return t});
function pick(list){var k=list.filter(function(t){return !SW[t]});return k.length?k:list}
function go(list,Q){var ts=pick(list).map(stem);return filt.map(function(e){var s=ts.length?score(e,ts):1;return[s&&ts.length?s+bonus(e,Q,ts):s,e]}).filter(function(h){return h[0]>0})}
var hits=go(raw,raw.join(' '));
if(!hits.length&&raw.length){fixed=raw.map(function(t){var c=correct(t,vocab,known);if(c){corrected=true;return c}return t});
 if(corrected)hits=go(fixed,fixed.join(' '))}
// uncorrected terms may still be fine when another term is wrong: try correcting only terms that matched nothing alone
hits.sort(function(a,b){return b[0]-a[0]||a[1].name.length-b[1].name.length||(a[1].name<b[1].name?-1:1)});
return{query:q,corrected:corrected?fixed.join(' '):null,total:hits.length,hits:hits.map(function(h){return{score:h[0],e:h[1]}})}}
return{run:run,prepare:prepare,mkVocab:mkVocab,norm:norm,words:words}})();

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
