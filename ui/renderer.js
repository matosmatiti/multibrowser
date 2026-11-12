const $=i=>document.getElementById(i);
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
let all=[],run=[],folder='*',tagSel=new Set(),sel=new Set(),view=localStorage.getItem('mbView')||'table',conf=null;
const PAL=['#ff7a59','#e5484d','#ff6b9a','#b58cff','#6a4c93','#4c8dff','#2ec4c4','#3ecf8e','#8ac926','#ffc247','#9aa5b8','#5b6478'];
const EMO=['💼','🛒','📣','🎮','🎬','📷','🧪','🔒','🏠','💬','📧','📱','💡','🚀','🌍','⭐','🔥','🎯','💰','🛠️','🎵','📚','🤖','🧿'];
function icon(p,big){const s=el('span',null,'ic'+(big?' big':'')),im=p.icon&&p.icon.startsWith('img:');
 s.style.background=im?'transparent':(p.color||'#8b93a5');
 if(im){const i=document.createElement('img');i.src=p.icon.slice(4);s.append(i)}
 else if(p.icon&&p.icon.startsWith('emoji:'))s.textContent=p.icon.slice(6);else s.textContent=(p.name||'?')[0].toUpperCase();return s}
const names=()=>[...new Set(all.map(p=>p.folder).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
const alltags=()=>{const m=new Map();for(const p of all)for(const t of p.tags||[])m.set(t,(m.get(t)||0)+1);return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ru'))};
const visible=()=>{const q=$('q').value.trim().toLowerCase();
 return all.filter(p=>(folder==='*'||(p.folder||'')===folder)&&[...tagSel].every(t=>(p.tags||[]).includes(t))&&(!q||(p.name+' '+(p.folder||'')+' '+(p.tags||[]).join(' ')+' '+p.kind).toLowerCase().includes(q)))};
function chips(box,p){if(p.folder)box.append(el('span','📁 '+p.folder,'chip'));for(const t of p.tags||[])box.append(el('span','#'+t,'chip'))}
function renameFolder(old,row){const i=el('input');i.value=old;row.replaceChildren(i);i.focus();i.select();let done=false;
 const fin=async ok=>{if(done)return;done=true;const v=i.value.trim();if(ok&&v&&v!==old){await api.profMeta({ids:all.filter(p=>p.folder===old).map(p=>p.id),folder:v});if(folder===old)folder=v}refresh()};
 i.onkeydown=e=>{if(e.key==='Enter')fin(true);else if(e.key==='Escape')fin(false)};i.onblur=()=>fin(true)}
function drawSide(){const F=$('folders');F.replaceChildren();
 const mk=(label,val,n,ed)=>{const row=el('div',null,'f'),b=el('button',null,'fb'+(folder===val?' on':''));b.append(el('span',label),el('span',String(n),'cnt'));b.onclick=()=>{folder=val;draw()};row.append(b);
  if(ed){const o=el('button','▶','small');o.title='Открыть все профили папки в новом окне';o.onclick=()=>api.openProfiles({ids:all.filter(p=>p.folder===val).map(p=>p.id),newWindow:true});
   const r=el('button','✎','small');r.title='Переименовать';r.onclick=()=>renameFolder(val,row);
   const d=el('button','✕','small');d.title='Удалить папку (профили останутся)';d.onclick=async()=>{if(await api.confirm('Удалить папку «'+val+'»? Профили останутся без папки.')){await api.profMeta({ids:all.filter(p=>p.folder===val).map(p=>p.id),folder:''});if(folder===val)folder='*';refresh()}};
   row.append(o,r,d)}F.append(row)};
 mk('Все профили','*',all.length);mk('Без папки','',all.filter(p=>!p.folder).length);for(const n of names())mk(n,n,all.filter(p=>p.folder===n).length,true);
 const T=$('tags');T.replaceChildren();for(const [t,n] of alltags()){const b=el('button',t+' '+n,'tagc'+(tagSel.has(t)?' on':''));b.onclick=()=>{tagSel.has(t)?tagSel.delete(t):tagSel.add(t);draw()};T.append(b)}
 const dl=$('fl');dl.replaceChildren();for(const n of names()){const o=document.createElement('option');o.value=n;dl.append(o)}}
function actions(p,on){const w=el('div',null,'acts'),sh=el('button','Открыть в оболочке','p'),go=el('button',on?'Закрыть':'Усиленный режим'),ck=el('button','Проверить'),st=el('button','Настройки'),rm=el('button','Удалить'),sd=el('button','Скрипты ▾');
 sh.onclick=()=>api.openInShell(p.id);
 go.onclick=async()=>{if(on)await api.stop(p.id);else{const e=await api.launch(p.id);if(e)await api.alert(e)}refresh()};
 ck.onclick=()=>runCheck(p);st.onclick=()=>editProfile(p.id);
 rm.onclick=async()=>{if(await api.confirm('Удалить профиль «'+p.name+'»?')){sel.delete(p.id);await api.remove(p.id);refresh()}};
 sd.onclick=e=>{e.stopPropagation();scriptMenu(p,sd)};w.append(sh,go,ck,st,rm,sd);return w}
function pick(cb,p){cb.type='checkbox';cb.checked=sel.has(p.id);cb.onchange=()=>{cb.checked?sel.add(p.id):sel.delete(p.id);draw()}}
function draw(){drawSide();const list=visible(),C=$('content');C.replaceChildren();
 $('vt').classList.toggle('on',view==='table');$('vc').classList.toggle('on',view==='cards');
 $('none').hidden=list.length>0;$('none').textContent=all.length?'Ничего не найдено.':'Профилей пока нет. Нажми «+ Новый профиль» и создай первый.';
 $('sel').hidden=!sel.size;$('scnt').textContent=sel.size;
 if(view==='table'){const tb=document.createElement('table');tb.innerHTML='<thead><tr><th></th><th>ПРОФИЛЬ</th><th>ПОДКЛЮЧЕНИЕ</th><th>СТАТУС</th><th></th></tr></thead>';const body=document.createElement('tbody');
  for(const p of list){const on=run.includes(p.id),tr=document.createElement('tr'),c0=document.createElement('td'),cb=el('input');pick(cb,p);c0.append(cb);
   const c1=document.createElement('td'),nm=el('div',null,'nm'),tx=el('div');tx.append(el('b',p.name));chips(tx,p);nm.append(icon(p),tx);c1.append(nm);
   const c2=el('td',p.kind,'m'),c3=el('td',on?'● Запущен':'○ Остановлен',on?'on2':'m'),c4=document.createElement('td');c4.append(actions(p,on));tr.append(c0,c1,c2,c3,c4);body.append(tr)}
  tb.append(body);C.append(tb)}
 else{const g=el('div',null,'cards');
  for(const p of list){const on=run.includes(p.id),c=el('div',null,'card'),top=el('div',null,'top'),cb=el('input');pick(cb,p);
   const nm=el('div',null,'nm2');nm.append(el('b',p.name),el('div',on?'● Запущен':'○ Остановлен',on?'on2':'m'));top.append(cb,icon(p,true),nm);
   const ch=el('div');chips(ch,p);c.append(top,ch,el('div',p.kind,'m'),actions(p,on));g.append(c)}C.append(g)}}
async function refresh(){const d=await api.list();all=d.profiles;run=d.running;const ids=new Set(all.map(p=>p.id));for(const i of [...sel])if(!ids.has(i))sel.delete(i);if(!all.length)$('form').hidden=false;draw()}
// ---- поиск, вид, папки
$('q').oninput=draw;
$('vt').onclick=()=>{view='table';localStorage.setItem('mbView',view);draw()};$('vc').onclick=()=>{view='cards';localStorage.setItem('mbView',view);draw()};
$('nfb').onclick=()=>{const v=$('nf').value.trim();if(!v)return;$('nfo').value=v;$('bf').value=v;$('nf').value='';$('form').hidden=false;$('edit').hidden=true;$('imp').hidden=true;$('n').focus()};
$('nf').onkeydown=e=>{if(e.key==='Enter')$('nfb').click()};
// ---- групповые действия
$('bfm').onclick=async()=>{await api.profMeta({ids:[...sel],folder:$('bf').value});$('bf').value='';refresh()};
$('bta').onclick=async()=>{const t=$('bt').value.trim();if(!t)return;await api.profMeta({ids:[...sel],addTags:[t]});$('bt').value='';refresh()};
$('btr').onclick=async()=>{const t=$('bt').value.trim();if(!t)return;await api.profMeta({ids:[...sel],removeTags:[t]});$('bt').value='';refresh()};
$('bo').onclick=()=>api.openProfiles({ids:[...sel]});$('bow').onclick=()=>api.openProfiles({ids:[...sel],newWindow:true});
$('bd').onclick=async()=>{if(await api.confirm('Удалить выбранные профили ('+sel.size+')?')){for(const id of [...sel])await api.remove(id);sel.clear();refresh()}};
$('bx').onclick=()=>{sel.clear();draw()};
// ---- новый профиль
$('mode').onchange=()=>{const m=$('mode').value;$('px').hidden=m!=='proxy';$('pick').hidden=m!=='vpn'};
$('pick').onclick=async()=>{const r=await api.pickConf();if(r){conf=r.text;$('cf').textContent=r.name}};
$('new').onclick=()=>{$('form').hidden=!$('form').hidden;$('edit').hidden=true;$('imp').hidden=true;$('nfo').value=folder!=='*'?folder:''};
$('cancel').onclick=()=>{$('form').hidden=true};
$('add').onclick=async()=>{const r=await api.add({name:$('n').value,folder:$('nfo').value,mode:$('mode').value,type:$('ty').value,host:$('h').value,port:$('po').value,user:$('us').value,pass:$('pw').value,confText:conf});
 if(r&&r.error){await api.alert(r.error);return}
 $('n').value='';$('us').value='';$('pw').value='';conf=null;$('cf').textContent='';$('form').hidden=true;refresh();if(r&&r.note)await api.alert(r.note)};
// ---- настройки профиля
let eid=null,ecConf=null,eColor='',eIcon='',eBase='#8b93a5';
function swatches(){const box=$('ecolors');box.replaceChildren();for(const c of PAL){const b=el('button',null,'sw'+(eColor===c?' on':''));b.style.background=c;b.title=c;b.onclick=()=>{eColor=c;$('ecustom').value=c;swatches();prev()};box.append(b)}}
function emojis(){const box=$('eemojis');box.replaceChildren();for(const e of EMO){const b=el('button',e,'em'+(eIcon==='emoji:'+e?' on':''));b.onclick=()=>{eIcon='emoji:'+e;emojis();prev()};box.append(b)}}
function prev(){$('eprev').replaceChildren(icon({name:$('en').value||'?',color:eColor||eBase,icon:eIcon},true))}
$('ecustom').oninput=()=>{eColor=$('ecustom').value;swatches();prev()};
$('ecauto').onclick=()=>{eColor='';swatches();prev()};
$('eiclear').onclick=()=>{eIcon='';emojis();prev()};
$('eimgb').onclick=()=>$('eimg').click();
$('eimg').onchange=()=>{const f=$('eimg').files[0];if(!f)return;const r=new FileReader();
 r.onload=()=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),s=Math.min(im.width,im.height);g.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,64,64);eIcon='img:'+c.toDataURL('image/png');emojis();prev()};im.src=r.result};
 r.readAsDataURL(f);$('eimg').value=''};
$('en').oninput=prev;
function showConn(){const m=$('ecm').value;$('epx').hidden=m!=='proxy';$('evp').hidden=m!=='vpn'}
async function editProfile(id){const d=await api.getProfile(id);if(!d)return;eid=id;ecConf=null;
 const base=all.find(p=>p.id===id);eBase=(base&&base.color)||'#8b93a5';eColor=d.color||'';eIcon=d.icon||'';
 $('en').value=d.name;$('efo').value=d.folder||'';$('etg').value=(d.tags||[]).join(', ');$('est').value=d.start||'';$('ecustom').value=eColor||eBase;swatches();emojis();prev();
 $('ed').value=d.downloadDir||'';$('ed').placeholder='По умолчанию: '+d.effective;
 const c=d.conn||{mode:'none'};$('ecm').value=c.mode;$('ect').value=c.type||'socks5';$('ech').value=c.host||'';$('ecp').value=c.port||'';$('ecu').value=c.user||'';$('ecw').value='';$('ecw').placeholder=c.hasPass?'пароль (пусто = не менять)':'пароль';
 $('ecf').textContent=c.hasVpn?'Текущий конфиг загружен'+(c.vpnNote?' (AmneziaWG→WireGuard)':'')+'. Выбери файл, чтобы заменить.':'Файл не выбран';showConn();
 $('eac').checked=!!(d.autoclick&&d.autoclick.on);$('eacr').value=(d.autoclick&&d.autoclick.rules)||'';$('ent').checked=d.notify!==false;
 const lib=await api.scList(),L=$('esl');L.replaceChildren();if(!lib.length)L.append(el('span','Скриптов пока нет.','m'));
 for(const s of lib){const lb=el('label'),cb=el('input');cb.type='checkbox';cb.value=s.id;cb.checked=(d.scripts||[]).includes(s.id);lb.append(cb,s.name);L.append(lb)}
 $('edit').hidden=false;$('form').hidden=true;$('imp').hidden=true;$('edit').scrollIntoView({block:'nearest'})}
$('ecm').onchange=showConn;
$('ecpick').onclick=async()=>{const r=await api.pickConf();if(r){ecConf=r.text;$('ecf').textContent=r.name}};
$('epick').onclick=async()=>{const f=await api.pickFolder();if(f)$('ed').value=f};
$('ereset').onclick=()=>{$('ed').value=''};
$('ecancel').onclick=()=>{$('edit').hidden=true};
$('esm').onclick=()=>api.openScripts();
$('erp').onclick=async()=>{await api.resetPerms(eid);await api.alert('Запомненные разрешения сайтов сброшены.')};
$('esave').onclick=async()=>{const r=await api.updateProfile({id:eid,name:$('en').value,downloadDir:$('ed').value,color:eColor,icon:eIcon,folder:$('efo').value,tags:$('etg').value.split(',').map(s=>s.trim()).filter(Boolean),start:$('est').value,
 conn:{mode:$('ecm').value,type:$('ect').value,host:$('ech').value,port:$('ecp').value,user:$('ecu').value,pass:$('ecw').value,confText:ecConf},
 autoclick:{on:$('eac').checked,rules:$('eacr').value},notify:$('ent').checked,scripts:[...$('esl').querySelectorAll('input:checked')].map(x=>x.value)});
 if(r&&r.error){await api.alert(r.error);return}$('edit').hidden=true;refresh();if(r&&r.note)await api.alert(r.note)};
// ---- импорт списком
$('bulk').onclick=()=>{$('imp').hidden=!$('imp').hidden;$('form').hidden=true;$('edit').hidden=true;$('impm').textContent=''};
$('impx').onclick=()=>{$('imp').hidden=true};
$('impgo').onclick=async()=>{const r=await api.importProfiles($('impt').value);$('impm').textContent='Создано профилей: '+r.n+(r.bad.length?'. Не распознано строк: '+r.bad.length:'');if(r.n){$('impt').value='';refresh()}};
// ---- проверка подключения
let cres=null;
async function runCheck(p){const box=$('chk');box.hidden=false;$('cgeo').hidden=true;$('cgeo').disabled=false;$('ct').textContent='Проверяю подключение профиля «'+p.name+'»…';
 const r=await api.checkConn(p.id);
 if(r.error){$('ct').textContent='Профиль «'+p.name+'»: не удалось проверить. '+r.error;return}
 let cn=r.country||'?';try{cn=new Intl.DisplayNames(['ru'],{type:'region'}).of(r.country)}catch{}
 cres={id:p.id,tz:r.tz,lang:r.lang};
 $('ct').textContent='Профиль «'+p.name+'»: IP '+r.ip+' · '+cn+(r.city?', '+r.city:'')+' · '+(r.tz||'?')+' · '+r.ms+' мс'+(r.org?' · '+r.org:'');
 if(r.tz){$('cgeo').hidden=false;$('cgeo').textContent='Применить часовой пояс и язык ('+r.tz+', '+r.lang+')'}}
$('cgeo').onclick=async()=>{await api.applyGeo(cres);$('cgeo').disabled=true;$('cgeo').textContent='Применено (для новых вкладок и запусков)';refresh()};
$('cclose').onclick=()=>{$('chk').hidden=true};
// ---- быстрое включение скриптов у профиля
let SM=null;
async function scriptMenu(p,btn){
 if(SM){const same=SM.dataset.pid===p.id;SM.remove();SM=null;if(same)return}
 const lib=await api.scList(),m=el('div');m.id='smenu';m.dataset.pid=p.id;m.append(el('div','Скрипты профиля «'+p.name+'»','smh'));const note=el('div','','smn');
 for(const s of lib){const lb=el('label'),cb=el('input'),tx=el('span');cb.type='checkbox';cb.checked=(p.scripts||[]).includes(s.id);tx.append(el('b',s.name),el('small',s.desc||''));
  cb.onchange=async()=>{await api.scToggle({sid:s.id,pid:p.id,on:cb.checked});p.scripts=cb.checked?[...(p.scripts||[]),s.id]:(p.scripts||[]).filter(x=>x!==s.id);note.textContent='Страницы профиля обновлены'};
  lb.append(cb,tx);m.append(lb)}
 m.append(note);const r=btn.getBoundingClientRect();m.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-400))+'px';m.style.left=Math.max(8,Math.min(r.right-340,innerWidth-348))+'px';document.body.append(m);SM=m}
document.addEventListener('mousedown',e=>{if(SM&&!SM.contains(e.target)&&!(e.target.closest&&e.target.closest('button'))){SM.remove();SM=null}});
api.onState(refresh);refresh();
