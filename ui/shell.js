const $=i=>document.getElementById(i);let S={mode:'top',tabs:[],profiles:[]},BM={list:[],bar:false};
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
function tab(t){const d=el('div',null,'tab'+(t.id===S.active?' act':''));d.style.setProperty('--c',t.color);
 d.append(el('span',t.letter,'dot'),el('span',t.title,'ttl'));const x=el('button','×','x');x.title='Закрыть';
 x.onclick=e=>{e.stopPropagation();api.closeTab(t.id)};d.append(x);d.onclick=()=>api.activate(t.id);return d}
function render(){document.body.className=S.mode+(BM.bar?' bm':'');const a=$('addr');if(document.activeElement!==a)a.value=S.url||'';
 $('star').textContent=S.starred?'★':'☆';$('star').classList.toggle('on',!!S.starred);const B=$('bmbar');B.hidden=!BM.bar;B.replaceChildren();
 if(BM.bar){for(const b of BM.list){const x=el('button',b.title||b.url,'bm');x.title=b.url;x.onclick=()=>api.bmOpenBar({url:b.url});x.onauxclick=e=>{if(e.button===1)api.bmOpenBar({url:b.url,newTab:true})};B.append(x)}
  if(!BM.list.length)B.append(el('span','Закладок пока нет: нажми ☆ в адресной строке','m'))}
 $('back').disabled=!S.canBack;$('fwd').disabled=!S.canFwd;$('empty').style.display=S.tabs.length?'none':'flex';
 const T=$('tabs'),G=$('groups');T.replaceChildren();G.replaceChildren();
 if(S.mode==='top')for(const t of S.tabs)T.append(tab(t));
 else{for(const p of S.profiles){const h=el('div',null,'gh'),d=el('span',p.icon||p.name[0].toUpperCase(),'dot');d.style.setProperty('--c',p.color);h.append(d,el('span',p.name));
   if(p.id[0]!=='_'){const b=el('button','+');b.title='Новая вкладка в этом аккаунте';b.onclick=()=>api.newTab(p.id);h.append(b)}
   G.append(h);for(const t of S.tabs.filter(x=>x.pid===p.id))G.append(tab(t))}
  const n=el('button','+ Новая вкладка…');n.onclick=()=>api.newTabMenu();G.append(n)}}
let lastA=null;api.onTabs(s=>{if(finding&&s.active!==lastA)closeFind();lastA=s.active;S=s;render()});
$('plus').onclick=()=>api.newTabMenu();
$('back').onclick=()=>api.nav('back');$('fwd').onclick=()=>api.nav('forward');$('rl').onclick=()=>api.nav('reload');
$('mgr').onclick=()=>api.openManager();$('set').onclick=()=>api.openSettings();$('mode').onclick=()=>api.setMode(S.mode==='top'?'side':'top');
$('addr').onkeydown=e=>{if(e.key==='Enter'){api.navigate($('addr').value);$('addr').blur()}};
api.onBmState(s=>{BM=s;render()});
$('star').onclick=()=>api.bmToggle();$('menu').onclick=()=>api.showMenu();
api.onDlSummary(s=>{const b=$('dl');b.classList.toggle('act',s.active>0);$('dlb').style.transform='scaleX('+(s.active?Math.max(s.percent,4)/100:0)+')';b.title=s.active?'Загрузки: '+s.active+' ('+s.percent+'%)':'Загрузки (Ctrl+J)'});
$('dl').onclick=()=>api.toggleDownloads();
api.onFocusAddr(()=>{const a=$('addr');a.focus();a.select()});
let finding=false;
function openFind(){finding=true;$('addr').hidden=true;$('findbox').hidden=false;$('fq').focus();$('fq').select()}
function closeFind(){finding=false;$('findbox').hidden=true;$('addr').hidden=false;$('fc').textContent='';api.stopFind()}
api.onShowFind(openFind);api.onFindResult(r=>{$('fc').textContent=r.total?r.n+'/'+r.total:'0'});
$('fq').oninput=()=>{const q=$('fq').value;if(q)api.find({text:q,forward:true,next:false});else{api.stopFind();$('fc').textContent=''}};
$('fq').onkeydown=e=>{if(e.key==='Enter')api.find({text:$('fq').value,forward:!e.shiftKey,next:true});else if(e.key==='Escape')closeFind()};
$('fn').onclick=()=>api.find({text:$('fq').value,forward:true,next:true});$('fp').onclick=()=>api.find({text:$('fq').value,forward:false,next:true});$('fx').onclick=closeFind;
api.onUpdate(u=>{const T=$('updt'),B=$('updbar'),F=B.firstElementChild;
 if(u.state==='downloading'){T.hidden=B.hidden=false;T.textContent='Загрузка обновления '+u.percent+'%';F.style.width=u.percent+'%'}
 else if(u.state==='installing'){T.hidden=B.hidden=false;T.textContent='Устанавливаю обновление…';F.style.width='100%'}
 else T.hidden=B.hidden=true});
render();
