const $=i=>document.getElementById(i);let conf=null,run=[],all=[];
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
function show(){const q=$('q').value.trim().toLowerCase(),b=$('rows');b.replaceChildren();
 const list=all.filter(p=>!q||(p.name+' '+p.kind).toLowerCase().includes(q));
 $('none').textContent=all.length?(list.length?'':'Ничего не найдено.'):'Профилей пока нет. Нажми «+ Новый профиль» и создай первый.';
 for(const p of list){const on=run.includes(p.id),tr=el('tr'),n=el('td'),ic=el('span',p.name[0].toUpperCase(),'ic');ic.style.background=p.color;n.append(ic,p.name);
  tr.append(n,el('td',p.kind,'m'),el('td',on?'● Запущен':'○ Остановлен',on?'on':'m'));
  const td=el('td'),sh=el('button','Открыть в оболочке','p'),go=el('button',on?'Закрыть':'Усиленный режим'),ck=el('button','Проверить'),st=el('button','Настройки'),rm=el('button','Удалить');
  st.onclick=()=>editProfile(p.id);ck.onclick=()=>runCheck(p);
  sh.onclick=()=>api.openInShell(p.id);
  go.onclick=async()=>{if(on)await api.stop(p.id);else{const e=await api.launch(p.id);if(e)await api.alert(e)}draw()};
  rm.onclick=async()=>{if(await api.confirm('Удалить профиль «'+p.name+'»?')){await api.remove(p.id);draw()}};
  td.append(sh,' ',go,' ',ck,' ',st,' ',rm);tr.append(td);b.append(tr)}}
async function draw(){const d=await api.list();all=d.profiles;run=d.running;if(!all.length)$('form').hidden=false;show()}
$('q').oninput=show;$('new').onclick=()=>{$('form').hidden=!$('form').hidden};$('cancel').onclick=()=>{$('form').hidden=true};
$('mode').onchange=()=>{const m=$('mode').value;$('px').hidden=m!=='proxy';$('pick').hidden=m!=='vpn'};
$('pick').onclick=async()=>{const r=await api.pickConf();if(r){conf=r.text;$('cf').textContent=r.name}};
$('add').onclick=async()=>{const r=await api.add({name:$('n').value,mode:$('mode').value,type:$('ty').value,host:$('h').value,port:$('po').value,user:$('us').value,pass:$('pw').value,confText:conf});
 if(r&&r.error){await api.alert(r.error);return}
 $('n').value='';$('us').value='';$('pw').value='';conf=null;$('cf').textContent='';$('form').hidden=true;draw();if(r&&r.note)await api.alert(r.note)};
api.onState(draw);draw();

let eid=null;
let ecConf=null;
async function editProfile(id){const d=await api.getProfile(id);if(!d)return;eid=id;ecConf=null;$('en').value=d.name;$('ed').value=d.downloadDir||'';$('ed').placeholder='По умолчанию: '+d.effective;
 const c=d.conn||{mode:'none'};$('ecm').value=c.mode;$('ect').value=c.type||'socks5';$('ech').value=c.host||'';$('ecp').value=c.port||'';$('ecu').value=c.user||'';$('ecw').value='';$('ecw').placeholder=c.hasPass?'пароль (пусто = не менять)':'пароль';
 $('ecf').textContent=c.hasVpn?'Текущий конфиг загружен'+(c.vpnNote?' (AmneziaWG→WireGuard)':'')+'. Выбери файл, чтобы заменить.':'Файл не выбран';showConn();
 $('eac').checked=!!(d.autoclick&&d.autoclick.on);$('eacr').value=(d.autoclick&&d.autoclick.rules)||'';
 const all=await api.scList(),L=$('esl');L.replaceChildren();if(!all.length)L.append(el('span','Своих скриптов пока нет.','m'));
 for(const s of all){const lb=el('label'),cb=el('input');cb.type='checkbox';cb.value=s.id;cb.checked=(d.scripts||[]).includes(s.id);lb.append(cb,s.name);L.append(lb)}
 $('edit').hidden=false;$('form').hidden=true;$('imp').hidden=true}
function showConn(){const m=$('ecm').value;$('epx').hidden=m!=='proxy';$('evp').hidden=m!=='vpn'}
$('ecm').onchange=showConn;
$('ecpick').onclick=async()=>{const r=await api.pickConf();if(r){ecConf=r.text;$('ecf').textContent=r.name}}
$('epick').onclick=async()=>{const f=await api.pickFolder();if(f)$('ed').value=f};
$('ereset').onclick=()=>{$('ed').value=''};
$('ecancel').onclick=()=>{$('edit').hidden=true};
$('esave').onclick=async()=>{const r=await api.updateProfile({id:eid,name:$('en').value,downloadDir:$('ed').value,
 conn:{mode:$('ecm').value,type:$('ect').value,host:$('ech').value,port:$('ecp').value,user:$('ecu').value,pass:$('ecw').value,confText:ecConf},
 autoclick:{on:$('eac').checked,rules:$('eacr').value},scripts:[...$('esl').querySelectorAll('input:checked')].map(x=>x.value)});
 if(r&&r.error){await api.alert(r.error);return}$('edit').hidden=true;draw();if(r&&r.note)await api.alert(r.note)};
$('esm').onclick=()=>api.openScripts();
$('bulk').onclick=()=>{$('imp').hidden=!$('imp').hidden;$('form').hidden=true;$('edit').hidden=true;$('impm').textContent=''};
$('impx').onclick=()=>{$('imp').hidden=true};
$('impgo').onclick=async()=>{const r=await api.importProfiles($('impt').value);$('impm').textContent='Создано профилей: '+r.n+(r.bad.length?'. Не распознано строк: '+r.bad.length:'');if(r.n){$('impt').value='';draw()}};

let cres=null;
async function runCheck(p){const box=$('chk');box.hidden=false;$('cgeo').hidden=true;$('cgeo').disabled=false;$('ct').textContent='Проверяю подключение профиля «'+p.name+'»…';
 const r=await api.checkConn(p.id);
 if(r.error){$('ct').textContent='Профиль «'+p.name+'»: не удалось проверить. '+r.error;return}
 let cn=r.country||'?';try{cn=new Intl.DisplayNames(['ru'],{type:'region'}).of(r.country)}catch{}
 cres={id:p.id,tz:r.tz,lang:r.lang};
 $('ct').textContent='Профиль «'+p.name+'»: IP '+r.ip+' · '+cn+(r.city?', '+r.city:'')+' · '+(r.tz||'?')+' · '+r.ms+' мс'+(r.org?' · '+r.org:'');
 if(r.tz){$('cgeo').hidden=false;$('cgeo').textContent='Применить часовой пояс и язык ('+r.tz+', '+r.lang+')'}}
$('cgeo').onclick=async()=>{await api.applyGeo(cres);$('cgeo').disabled=true;$('cgeo').textContent='Применено (для новых вкладок и запусков)';draw()};
$('cclose').onclick=()=>{$('chk').hidden=true};
