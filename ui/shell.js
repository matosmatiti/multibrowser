const $=i=>document.getElementById(i);
let S={mode:'top',tabs:[],profiles:[]},BM={list:[],bar:false},seen=new Set(),finding=false,lastA=null,suppress=false,dragging=false,lastKey='',lastBm='',selected=new Set(),lastSel=null;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const XI='<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',PI='<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const anchor=(e,right)=>{const r=e.currentTarget.getBoundingClientRect();return{x:right?r.right:r.left,y:r.bottom+6,align:right?'right':'left'}};
const TMAX=220,TMIN=40,SPK='<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',MUT='<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
// ширина вкладок одинаковая: до 220px, уменьшается, когда места не хватает
function tabW(){if(S.mode==='side')return 0;const np=S.tabs.filter(t=>t.pinned).length,n=Math.max(S.tabs.length-np,1),avail=window.innerWidth-8-150-76-np*45-8;return Math.max(TMIN,Math.min(TMAX,Math.floor(avail/n)))}
function startDrag(e,t,d){
 if(e.button!==0||S.mode!=='top'||e.target.closest('.x')||e.target.closest('.au'))return;
 const sx=e.clientX,sy=e.clientY,strip=$('tabs'),rect=d.getBoundingClientRect(),gx=8+(sx-rect.left),gy=sy;
 let on=false,ind=null,idx=0,detached=false;
 const others=()=>[...strip.querySelectorAll('.tab')].filter(x=>x!==d);
 const calc=x=>{let n=0;for(const o of others()){const r=o.getBoundingClientRect();if(x>r.left+r.width/2)n++}return n};
 const off=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)};
 function move(ev){
  if(detached){api.dragMove({x:ev.screenX,y:ev.screenY});return}
  if(!on){if(Math.hypot(ev.clientX-sx,ev.clientY-sy)<7)return;on=true;dragging=true;d.classList.add('drag');ind=el('div',null,'ins');strip.append(ind);try{document.body.setPointerCapture(e.pointerId)}catch{}}
  // потянули за пределы строки вкладок: окно отделяется сразу и идёт за курсором
  if(ev.clientY>62||ev.clientY<-26||ev.clientX<-10||ev.clientX>window.innerWidth+10){
   detached=true;d.classList.remove('drag');d.style.transform='';d.style.display='none';if(ind)ind.remove();
   api.dragStart({id:t.id,x:ev.screenX,y:ev.screenY,gx,gy});return}
  d.style.transform='translate('+(ev.clientX-sx)+'px,'+Math.max(-6,Math.min(ev.clientY-sy,70))+'px)';
  idx=calc(ev.clientX);const L=others(),sr=strip.getBoundingClientRect();
  const left=idx<L.length?L[idx].getBoundingClientRect().left:(L.length?L[L.length-1].getBoundingClientRect().right:sr.left);
  ind.style.left=(left-sr.left+strip.scrollLeft-1)+'px'}
 function up(ev){
  off();dragging=false;try{document.body.releasePointerCapture(e.pointerId)}catch{}
  if(detached){api.dragEnd({x:ev.screenX,y:ev.screenY});d.style.display='';suppress=true;setTimeout(()=>{suppress=false},0);return}
  if(!on)return;d.classList.remove('drag');d.style.transform='';if(ind)ind.remove();
  const cur=S.tabs.findIndex(x=>x.id===t.id);if(idx!==cur)api.moveTab({id:t.id,to:idx});
  suppress=true;setTimeout(()=>{suppress=false},0)}
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
}
function setDot(d,icon,fb){if(icon&&icon.startsWith('img:')){d.textContent='';d.style.background='transparent';const im=document.createElement('img');im.src=icon.slice(4);d.append(im)}else if(icon&&icon.startsWith('emoji:'))d.textContent=icon.slice(6);else d.textContent=icon||fb}
function tab(t,w){const cmp=w&&w<110&&!t.pinned;
 const d=el('div',null,'tab'+(t.id===S.active?' act':'')+(cmp?' cmp':'')+(t.pinned?' pin':'')+(selected.has(t.id)?' sel':'')+((t.audible&&!t.muted)?' aud':'')+(seen.has(t.id)?'':' new'));d.style.setProperty('--c',t.color);d.title=t.title;
 const dot=el('span',null,'dot');setDot(dot,t.kindIcon||(S.icons&&S.icons[t.pid]),t.letter);d.append(dot,el('span',t.title,'ttl'));
 if(t.audible||t.muted){const a=el('button',null,'au');a.innerHTML=t.muted?MUT:SPK;a.title=t.muted?'Включить звук':'Отключить звук';a.onclick=e=>{e.stopPropagation();api.muteTab(t.id)};a.onpointerdown=e=>e.stopPropagation();d.append(a)}
 const x=el('button',null,'x');x.innerHTML=XI;x.title='Закрыть (Ctrl+W)';x.onclick=e=>{e.stopPropagation();api.closeTab(t.id)};d.append(x);
 d.onclick=e=>{if(suppress)return;
  if(e.ctrlKey||e.metaKey){if(selected.has(t.id))selected.delete(t.id);else{if(!selected.size&&S.active!=null)selected.add(S.active);selected.add(t.id)}lastSel=t.id;lastKey='';render();return}
  if(e.shiftKey&&lastSel!=null){const ids=S.tabs.map(x=>x.id),a=ids.indexOf(lastSel),b=ids.indexOf(t.id);if(a>=0&&b>=0)selected=new Set(ids.slice(Math.min(a,b),Math.max(a,b)+1));lastKey='';render();return}
  if(selected.size){selected.clear();lastKey='';render()}lastSel=t.id;api.activate(t.id)};d.onauxclick=e=>{if(e.button===1)api.closeTab(t.id)};
 d.onpointerdown=e=>startDrag(e,t,d);
 d.oncontextmenu=e=>{e.preventDefault();api.tabMenu({id:t.id,anchor:{x:e.clientX,y:e.clientY,align:'left'},ids:selected.has(t.id)?[...selected]:[]})};return d}
function render(){
 const side=S.mode==='side',R=document.documentElement.style,w=tabW();document.body.className=S.mode+(S.incognito?' inc':'');
 R.setProperty('--ox',side?'240px':'0px');R.setProperty('--by',(side?42:82)+'px');R.setProperty('--oy',((side?42:82)+(BM.bar?30:0))+'px');R.setProperty('--tw',(w||TMAX)+'px');
 const a=$('addr');if(document.activeElement!==a)a.value=S.url||'';
 $('star').classList.toggle('on',!!S.starred);$('back').disabled=!S.canBack;$('fwd').disabled=!S.canFwd;$('incb').hidden=!S.incognito;
 $('shc').textContent=S.blocked>0?(S.blocked>99?'99+':String(S.blocked)):'';$('shield').classList.toggle('off',!S.adOn);
 $('shield').title=S.adOn?'Блокировка рекламы и трекеров включена. Заблокировано на странице: '+(S.blocked||0):'Блокировка выключена (нажми, чтобы включить)';
 $('empty').classList.toggle('on',!S.tabs.length);$('ph').classList.toggle('on',!!S.waiting);$('lbar').classList.toggle('on',!!S.loading);
 // панель закладок и вкладки перестраиваются только при изменении данных (иначе клики теряются при частых обновлениях)
 const bk=JSON.stringify([BM,S.mode]);
 if(bk!==lastBm){lastBm=bk;const B=$('bmbar');B.hidden=!BM.bar;B.replaceChildren();
  if(BM.bar){const folders=[...new Set(BM.list.map(b=>b.folder).filter(Boolean))];
   for(const b of BM.list.filter(b=>!b.folder)){const x=el('button',b.title||b.url,'bm');x.title=b.url;x.onclick=()=>api.bmOpenBar({url:b.url});
    x.onauxclick=e=>{if(e.button===1){e.preventDefault();api.bmOpenBar({url:b.url,newTab:true})}};
    x.oncontextmenu=e=>{e.preventDefault();api.bmChipMenu({id:b.id,anchor:{x:e.clientX,y:e.clientY,align:'left'}})};B.append(x)}
   for(const f of folders){const x=el('button','▾ '+f,'bm fd');x.onclick=e=>{const r=e.currentTarget.getBoundingClientRect();api.bmFolderMenu({name:f,anchor:{x:r.left,y:r.bottom+4,align:'left'}})};B.append(x)}
   if(!BM.list.length)B.append(el('span','Закладок пока нет: нажми ☆ в адресной строке','m'))}}
 for(const id of [...selected])if(!S.tabs.some(x=>x.id===id))selected.delete(id);
 const ik=Object.keys(S.icons||{}).map(k=>k+':'+(S.icons[k]||'').length).join();
 const key=JSON.stringify([ik,[...selected],S.mode,S.active,w,S.tabs.map(t=>[t.id,t.title,t.color,t.letter,t.audible,t.muted,t.pinned]),side?S.profiles:0]);
 if(key===lastKey||dragging)return;lastKey=key;
 const T=$('tabs'),G=$('groups');T.replaceChildren();G.replaceChildren();
 if(!side){for(const t of S.tabs)T.append(tab(t,w));const act=T.querySelector('.act');if(act)act.scrollIntoView({block:'nearest',inline:'nearest'})}
 else{for(const p of S.profiles){const h=el('div',null,'gh'),d=el('span',null,'dot');d.style.setProperty('--c',p.color);setDot(d,p.icon,p.name[0].toUpperCase());h.append(d,el('span',p.name));
   if(p.id[0]!=='_'){const b=el('button',null,'ib sm');b.innerHTML=PI;b.title='Новая вкладка в этом аккаунте';b.onclick=()=>api.newTab(p.id);h.append(b)}
   G.append(h);for(const t of S.tabs.filter(x=>x.pid===p.id))G.append(tab(t,0))}
  const n=el('button','+ Новая вкладка…','nb');n.onclick=e=>api.newTabMenu(anchor(e,false));G.append(n)}
 for(const t of S.tabs)seen.add(t.id)}
function openFind(){finding=true;$('aw').hidden=true;$('findbox').hidden=false;$('fq').focus();$('fq').select()}
function closeFind(){finding=false;$('findbox').hidden=true;$('aw').hidden=false;$('fc').textContent='';api.stopFind()}
api.onTabs(s=>{if(finding&&s.active!==lastA)closeFind();lastA=s.active;S=s;render()});
api.onBmState(s=>{BM=s;render()});
api.onDropHint(on=>{$('top').classList.toggle('drop',on);$('side').classList.toggle('drop',on)});
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
const addr=$('addr');let fresh=false,sugT=null;
addr.addEventListener('focus',()=>{fresh=true;addr.select()});                 // как в других браузерах: клик выделяет весь адрес
addr.addEventListener('mouseup',e=>{if(fresh){e.preventDefault();fresh=false}});
addr.addEventListener('blur',()=>{fresh=false;clearTimeout(sugT);setTimeout(()=>api.suggestHide(),150)});
addr.addEventListener('input',()=>{clearTimeout(sugT);sugT=setTimeout(()=>{const r=$('aw').getBoundingClientRect();api.suggest({q:addr.value,anchor:{x:r.left,y:r.bottom+4,align:'left',width:r.width}})},110)});
addr.addEventListener('keydown',async e=>{
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();api.suggestMove(e.key==='ArrowDown'?1:-1)}
 else if(e.key==='Enter'){e.preventDefault();const picked=await api.suggestPick();if(!picked)api.navigate(addr.value);addr.blur()}
 else if(e.key==='Escape'){api.suggestHide();addr.value=S.url||'';addr.blur()}});
function pressMenu(btn,dir){let tm=null,fired=false;const an=()=>{const r=btn.getBoundingClientRect();return{x:r.left,y:r.bottom+6,align:'left'}};   // удержание: список страниц
 btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;fired=false;tm=setTimeout(()=>{fired=true;api.navMenu({dir,anchor:an()})},450)});
 const clr=()=>clearTimeout(tm);btn.addEventListener('pointerup',clr);btn.addEventListener('pointerleave',clr);
 btn.addEventListener('click',e=>{if(fired){e.stopImmediatePropagation();e.preventDefault();fired=false}},true);
 btn.addEventListener('contextmenu',e=>{e.preventDefault();api.navMenu({dir,anchor:an()})})}
pressMenu($('back'),'back');pressMenu($('fwd'),'forward');
$('tsearch').onclick=e=>api.tabSearch(anchor(e,false));
api.onFindNext(fw=>{if(finding)api.find({text:$('fq').value,forward:fw,next:true})});
$('fq').oninput=()=>{const q=$('fq').value;if(q)api.find({text:q,forward:true,next:false});else{api.stopFind();$('fc').textContent=''}};
$('fq').onkeydown=e=>{if(e.key==='Enter')api.find({text:$('fq').value,forward:!e.shiftKey,next:true});else if(e.key==='Escape')closeFind()};
$('fn').onclick=()=>api.find({text:$('fq').value,forward:true,next:true});$('fp').onclick=()=>api.find({text:$('fq').value,forward:false,next:true});$('fx').onclick=closeFind;
$('tabs').addEventListener('wheel',e=>{$('tabs').scrollLeft+=e.deltaY});
let lastR='';const sendAnchor=()=>{const r=$('dl').getBoundingClientRect(),k=[r.left,r.right,r.top,r.bottom].join();if(k!==lastR){lastR=k;api.dlAnchor({left:r.left,right:r.right,top:r.top,bottom:r.bottom})}};
api.onDlHit(()=>{const b=$('dl');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')});
window.addEventListener('resize',()=>{render();sendAnchor()});new MutationObserver(sendAnchor).observe(document.body,{attributes:true});
render();sendAnchor();

document.addEventListener('keydown',e=>{
 if(e.key==='Delete'&&selected.size&&(document.activeElement===document.body)){api.tabsAction({ids:[...selected],action:'close'});selected.clear();lastKey='';render()}
 else if(e.key==='Escape'&&selected.size&&document.activeElement===document.body){selected.clear();lastKey='';render()}});
