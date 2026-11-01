const $=i=>document.getElementById(i);
let S={mode:'top',tabs:[],profiles:[]},BM={list:[],bar:false},seen=new Set(),finding=false,lastA=null;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const XI='<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',PI='<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const anchor=(e,right)=>{const r=e.currentTarget.getBoundingClientRect();return{x:right?r.right:r.left,y:r.bottom+6,align:right?'right':'left'}};
function tab(t){const d=el('div',null,'tab'+(t.id===S.active?' act':'')+(seen.has(t.id)?'':' new'));d.style.setProperty('--c',t.color);d.title=t.title;
 d.append(el('span',t.letter,'dot'),el('span',t.title,'ttl'));const x=el('button',null,'x');x.innerHTML=XI;x.title='Закрыть (Ctrl+W)';
 x.onclick=e=>{e.stopPropagation();api.closeTab(t.id)};d.append(x);d.onclick=()=>api.activate(t.id);
 d.onauxclick=e=>{if(e.button===1)api.closeTab(t.id)};return d}
function render(){
 const side=S.mode==='side',R=document.documentElement.style;document.body.className=S.mode;
 R.setProperty('--ox',side?'240px':'0px');R.setProperty('--by',(side?42:82)+'px');R.setProperty('--oy',((side?42:82)+(BM.bar?30:0))+'px');
 const a=$('addr');if(document.activeElement!==a)a.value=S.url||'';
 $('star').classList.toggle('on',!!S.starred);$('back').disabled=!S.canBack;$('fwd').disabled=!S.canFwd;
 $('empty').classList.toggle('on',!S.tabs.length);$('ph').classList.toggle('on',!!S.waiting);$('lbar').classList.toggle('on',!!S.loading);
 const B=$('bmbar');B.hidden=!BM.bar;B.replaceChildren();
 if(BM.bar){for(const b of BM.list){const x=el('button',b.title||b.url,'bm');x.title=b.url;x.onclick=()=>api.bmOpenBar({url:b.url});
   x.onauxclick=e=>{if(e.button===1)api.bmOpenBar({url:b.url,newTab:true})};B.append(x)}
  if(!BM.list.length)B.append(el('span','Закладок пока нет: нажми ☆ в адресной строке','m'))}
 const T=$('tabs'),G=$('groups');T.replaceChildren();G.replaceChildren();
 if(!side)for(const t of S.tabs)T.append(tab(t));
 else{for(const p of S.profiles){const h=el('div',null,'gh'),d=el('span',p.icon||p.name[0].toUpperCase(),'dot');d.style.setProperty('--c',p.color);h.append(d,el('span',p.name));
   if(p.id[0]!=='_'){const b=el('button',null,'ib sm');b.innerHTML=PI;b.title='Новая вкладка в этом аккаунте';b.onclick=()=>api.newTab(p.id);h.append(b)}
   G.append(h);for(const t of S.tabs.filter(x=>x.pid===p.id))G.append(tab(t))}
  const n=el('button','+ Новая вкладка…','nb');n.onclick=e=>api.newTabMenu(anchor(e,false));G.append(n)}
 for(const t of S.tabs)seen.add(t.id)}
function openFind(){finding=true;$('aw').hidden=true;$('findbox').hidden=false;$('fq').focus();$('fq').select()}
function closeFind(){finding=false;$('findbox').hidden=true;$('aw').hidden=false;$('fc').textContent='';api.stopFind()}
api.onTabs(s=>{if(finding&&s.active!==lastA)closeFind();lastA=s.active;S=s;render()});
api.onBmState(s=>{BM=s;render()});
api.onDlSummary(s=>{const b=$('dl');b.classList.toggle('act',s.active>0);$('dlb').style.transform='scaleX('+(s.active?Math.max(s.percent,4)/100:0)+')';b.title=s.active?'Загрузки: '+s.active+' ('+s.percent+'%)':'Загрузки (Ctrl+J)'});
api.onFocusAddr(()=>{const a=$('addr');a.focus();a.select()});
api.onShowFind(openFind);api.onFindResult(r=>{$('fc').textContent=r.total?r.n+'/'+r.total:'0'});
api.onUpdate(u=>{const T=$('updt'),B=$('updbar'),F=B.firstElementChild;
 if(u.state==='downloading'){T.hidden=B.hidden=false;T.textContent='Загрузка обновления '+u.percent+'%';F.style.width=u.percent+'%'}
 else if(u.state==='installing'){T.hidden=B.hidden=false;T.textContent='Устанавливаю обновление…';F.style.width='100%'}
 else T.hidden=B.hidden=true});
$('plus').onclick=e=>api.newTabMenu(anchor(e,false));$('menu').onclick=e=>api.showMenu(anchor(e,true));
$('back').onclick=()=>api.nav('back');$('fwd').onclick=()=>api.nav('forward');$('rl').onclick=()=>api.nav('reload');
$('star').onclick=()=>api.bmToggle();$('dl').onclick=()=>api.toggleDownloads();
$('mgr').onclick=()=>api.openManager();$('set').onclick=()=>api.openSettings();$('mode').onclick=()=>api.setMode(S.mode==='top'?'side':'top');
$('addr').onkeydown=e=>{if(e.key==='Enter'){api.navigate($('addr').value);$('addr').blur()}};
$('fq').oninput=()=>{const q=$('fq').value;if(q)api.find({text:q,forward:true,next:false});else{api.stopFind();$('fc').textContent=''}};
$('fq').onkeydown=e=>{if(e.key==='Enter')api.find({text:$('fq').value,forward:!e.shiftKey,next:true});else if(e.key==='Escape')closeFind()};
$('fn').onclick=()=>api.find({text:$('fq').value,forward:true,next:true});$('fp').onclick=()=>api.find({text:$('fq').value,forward:false,next:true});$('fx').onclick=closeFind;
let lastR='';const sendAnchor=()=>{const r=$('dl').getBoundingClientRect(),k=[r.left,r.right,r.top,r.bottom].join();if(k!==lastR){lastR=k;api.dlAnchor({left:r.left,right:r.right,top:r.top,bottom:r.bottom})}};
api.onDlHit(()=>{const b=$('dl');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')});
window.addEventListener('resize',sendAnchor);new MutationObserver(sendAnchor).observe(document.body,{attributes:true});
render();sendAnchor();
