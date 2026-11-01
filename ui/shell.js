const $=i=>document.getElementById(i);
let S={mode:'top',tabs:[],profiles:[]},BM={list:[],bar:false},seen=new Set(),finding=false,lastA=null,suppress=false;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const XI='<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',PI='<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const anchor=(e,right)=>{const r=e.currentTarget.getBoundingClientRect();return{x:right?r.right:r.left,y:r.bottom+6,align:right?'right':'left'}};
const TMAX=220,TMIN=40;
// ширина вкладок одинаковая: до 220px, уменьшается, когда места не хватает
function tabW(){if(S.mode==='side')return 0;const n=Math.max(S.tabs.length,1),avail=window.innerWidth-8-150-40-8;return Math.max(TMIN,Math.min(TMAX,Math.floor(avail/n)))}
function startDrag(e,t,d){
 if(e.button!==0||S.mode!=='top'||e.target.closest('.x'))return;
 const sx=e.clientX,sy=e.clientY,strip=$('tabs');let on=false,ind=null,idx=0;
 const others=()=>[...strip.querySelectorAll('.tab')].filter(x=>x!==d);
 const calc=x=>{let n=0;for(const o of others()){const r=o.getBoundingClientRect();if(x>r.left+r.width/2)n++}return n};
 const move=ev=>{
  if(!on){if(Math.hypot(ev.clientX-sx,ev.clientY-sy)<7)return;on=true;d.classList.add('drag');d.setPointerCapture(e.pointerId);ind=el('div',null,'ins');strip.append(ind)}
  d.style.transform='translate('+(ev.clientX-sx)+'px,'+Math.max(-6,Math.min(ev.clientY-sy,70))+'px)';
  idx=calc(ev.clientX);const L=others(),sr=strip.getBoundingClientRect();
  const left=idx<L.length?L[idx].getBoundingClientRect().left:(L.length?L[L.length-1].getBoundingClientRect().right:sr.left);
  ind.style.left=(left-sr.left+strip.scrollLeft-1)+'px'};
 const up=ev=>{d.removeEventListener('pointermove',move);d.removeEventListener('pointerup',up);d.removeEventListener('pointercancel',up);
  if(!on)return;try{d.releasePointerCapture(e.pointerId)}catch{}
  d.classList.remove('drag');d.style.transform='';if(ind)ind.remove();
  const out=ev.clientY>74||ev.clientY<-20||ev.clientX<0||ev.clientX>window.innerWidth;   // утащили за пределы строки вкладок: отделяем в новое окно
  if(out&&S.tabs.length>1)api.detachTab({id:t.id,x:ev.screenX,y:ev.screenY});
  else{const cur=S.tabs.findIndex(x=>x.id===t.id);if(idx!==cur)api.moveTab({id:t.id,to:idx})}
  suppress=true;setTimeout(()=>{suppress=false},0)};
 d.addEventListener('pointermove',move);d.addEventListener('pointerup',up);d.addEventListener('pointercancel',up);
}
function tab(t,w){const cmp=w&&w<110;
 const d=el('div',null,'tab'+(t.id===S.active?' act':'')+(cmp?' cmp':'')+(seen.has(t.id)?'':' new'));d.style.setProperty('--c',t.color);d.title=t.title;
 d.append(el('span',t.letter,'dot'),el('span',t.title,'ttl'));const x=el('button',null,'x');x.innerHTML=XI;x.title='Закрыть (Ctrl+W)';
 x.onclick=e=>{e.stopPropagation();api.closeTab(t.id)};d.append(x);
 d.onclick=()=>{if(!suppress)api.activate(t.id)};d.onauxclick=e=>{if(e.button===1)api.closeTab(t.id)};
 d.onpointerdown=e=>startDrag(e,t,d);
 d.oncontextmenu=e=>{e.preventDefault();api.tabMenu({id:t.id,anchor:{x:e.clientX,y:e.clientY,align:'left'}})};return d}
function render(){
 const side=S.mode==='side',R=document.documentElement.style,w=tabW();document.body.className=S.mode;
 R.setProperty('--ox',side?'240px':'0px');R.setProperty('--by',(side?42:82)+'px');R.setProperty('--oy',((side?42:82)+(BM.bar?30:0))+'px');R.setProperty('--tw',(w||TMAX)+'px');
 const a=$('addr');if(document.activeElement!==a)a.value=S.url||'';
 $('star').classList.toggle('on',!!S.starred);$('back').disabled=!S.canBack;$('fwd').disabled=!S.canFwd;
 $('shc').textContent=S.blocked>0?(S.blocked>99?'99+':String(S.blocked)):'';$('shield').classList.toggle('off',!S.adOn);
 $('shield').title=S.adOn?'Блокировка рекламы и трекеров включена. Заблокировано на странице: '+(S.blocked||0):'Блокировка выключена (нажми, чтобы включить)';
 $('empty').classList.toggle('on',!S.tabs.length);$('ph').classList.toggle('on',!!S.waiting);$('lbar').classList.toggle('on',!!S.loading);
 const B=$('bmbar');B.hidden=!BM.bar;B.replaceChildren();
 if(BM.bar){for(const b of BM.list){const x=el('button',b.title||b.url,'bm');x.title=b.url;x.onclick=()=>api.bmOpenBar({url:b.url});
   x.onauxclick=e=>{if(e.button===1)api.bmOpenBar({url:b.url,newTab:true})};B.append(x)}
  if(!BM.list.length)B.append(el('span','Закладок пока нет: нажми ☆ в адресной строке','m'))}
 const T=$('tabs'),G=$('groups');T.replaceChildren();G.replaceChildren();
 if(!side){for(const t of S.tabs)T.append(tab(t,w));const act=T.querySelector('.act');if(act)act.scrollIntoView({block:'nearest',inline:'nearest'})}
 else{for(const p of S.profiles){const h=el('div',null,'gh'),d=el('span',p.icon||p.name[0].toUpperCase(),'dot');d.style.setProperty('--c',p.color);h.append(d,el('span',p.name));
   if(p.id[0]!=='_'){const b=el('button',null,'ib sm');b.innerHTML=PI;b.title='Новая вкладка в этом аккаунте';b.onclick=()=>api.newTab(p.id);h.append(b)}
   G.append(h);for(const t of S.tabs.filter(x=>x.pid===p.id))G.append(tab(t,0))}
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
$('star').onclick=()=>api.bmToggle();$('dl').onclick=()=>api.toggleDownloads();$('shield').onclick=()=>api.adToggle();
$('mgr').onclick=()=>api.openManager();$('set').onclick=()=>api.openSettings();$('mode').onclick=()=>api.setMode(S.mode==='top'?'side':'top');
$('addr').onkeydown=e=>{if(e.key==='Enter'){api.navigate($('addr').value);$('addr').blur()}};
$('fq').oninput=()=>{const q=$('fq').value;if(q)api.find({text:q,forward:true,next:false});else{api.stopFind();$('fc').textContent=''}};
$('fq').onkeydown=e=>{if(e.key==='Enter')api.find({text:$('fq').value,forward:!e.shiftKey,next:true});else if(e.key==='Escape')closeFind()};
$('fn').onclick=()=>api.find({text:$('fq').value,forward:true,next:true});$('fp').onclick=()=>api.find({text:$('fq').value,forward:false,next:true});$('fx').onclick=closeFind;
$('tabs').addEventListener('wheel',e=>{$('tabs').scrollLeft+=e.deltaY});
let lastR='';const sendAnchor=()=>{const r=$('dl').getBoundingClientRect(),k=[r.left,r.right,r.top,r.bottom].join();if(k!==lastR){lastR=k;api.dlAnchor({left:r.left,right:r.right,top:r.top,bottom:r.bottom})}};
api.onDlHit(()=>{const b=$('dl');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')});
window.addEventListener('resize',()=>{render();sendAnchor()});new MutationObserver(sendAnchor).observe(document.body,{attributes:true});
render();sendAnchor();
