const $=i=>document.getElementById(i);let t=null;
function flash(){const o=$('ok');o.textContent='Сохранено';clearTimeout(t);t=setTimeout(()=>o.textContent='',1500)}
async function save(p){await api.setSettings(p);flash()}
async function init(){const c=await api.getSettings();
 for(const k of ['search','home','theme','siteDark','translateTo'])$(k).value=c[k];
 for(const k of ['restore','autoUpdate','bmBar','keepHistory','dlToast','adblock','openBg'])$(k).checked=!!c[k];
 const showDd=c=>{$('ddv').textContent=c.downloadDir||('Системная: '+c.dlDefault)};showDd(c);
 $('dd').onclick=async()=>{const f=await api.pickFolder();if(f){c.downloadDir=f;showDd(c);save({downloadDir:f})}};
 $('ddr').onclick=()=>{c.downloadDir='';showDd(c);save({downloadDir:''})};
 $('custom').value=c.customHome||'';$('cr').hidden=c.home!=='custom';$('ver').textContent=c.version;
 for(const k of ['search','theme','translateTo'])$(k).onchange=()=>save({[k]:$(k).value});
 $('siteDark').onchange=()=>{save({siteDark:$('siteDark').value});api.alert('Изменение применится после перезапуска программы.')};
 $('home').onchange=()=>{$('cr').hidden=$('home').value!=='custom';save({home:$('home').value})};
 $('custom').onchange=()=>save({customHome:$('custom').value.trim()});
 for(const k of ['restore','autoUpdate','bmBar','keepHistory','dlToast','adblock','openBg'])$(k).onchange=()=>save({[k]:$(k).checked});
 const adShow=async()=>{const i=await api.adInfo();$('adv').textContent=(i.engine?'Усиленный режим (фильтры EasyList и uBlock). ':'Базовый режим (список доменов). ')+i.domains+' доменов'+(i.updated?', обновлено '+new Date(i.updated).toLocaleDateString('ru-RU'):'')};adShow();
 $('adu').onclick=async()=>{$('adu').disabled=true;$('adu').textContent='Обновляю…';await api.adUpdate();$('adu').disabled=false;$('adu').textContent='Обновить сейчас';adShow();flash()};
 $('uaVersion').value=c.uaVersion||'';$('uaVersion').onchange=()=>save({uaVersion:$('uaVersion').value.trim()});
 const bkShow=c=>{$('bkst').textContent=c.hasBackupPw?'задан и запомнен на этом компьютере':'не задан'};bkShow(c);
 $('bkpw').onclick=async()=>{const r=await api.bkSetPw();if(r.error)await api.alert(r.error);else if(r.ok){await api.alert('Пароль для резервных копий сохранён.');bkShow({hasBackupPw:true})}};
 $('bkc').onclick=async()=>{const r=await api.bkCreate();if(r.error)await api.alert(r.error);else if(r.ok){await api.alert('Копия создана. Профилей: '+r.profiles+', записей входа (куки): '+r.cookies+'.');bkShow({hasBackupPw:true})}};
 $('bkr').onclick=async()=>{const r=await api.bkRestore();if(r.error)await api.alert(r.error);else if(r.ok)await api.alert('Восстановлено. Профилей: '+r.np+', закладок добавлено: '+r.nb+', записей входа: '+r.nc+'.')};
 const apiUi=async()=>{const on=$('apiOn').checked;$('apir').hidden=!on;$('apiex').hidden=!on;if(!on)return;
  const tok=await api.apiToken(),port=$('apiPort').value||35777;let shown=false;
  const ex=(t)=>'Запуск профиля:  POST http://127.0.0.1:'+port+'/v1/profiles/<id>/start\nЗаголовок:  Authorization: Bearer '+t+'\nОтвет содержит ws (адрес CDP): Playwright  chromium.connect_over_cdp(ws)  или  chromium.connectOverCDP(ws).\nСписок профилей:  GET /v1/profiles   Остановка:  POST /v1/profiles/<id>/stop';
  $('apiex').textContent=ex('••••••••');$('apist').textContent='Токен хранится в зашифрованном виде на этом компьютере';
  $('apiShow').onclick=()=>{shown=!shown;$('apiex').textContent=ex(shown?tok:'••••••••');$('apiShow').textContent=shown?'Скрыть токен':'Показать токен'};
  $('apiCopy').onclick=async()=>{await api.copyText(tok);flash()};
  $('apiNew').onclick=async()=>{if(await api.confirm('Выпустить новый токен? Старый перестанет работать, скрипты нужно будет обновить.')){await api.apiNewToken();apiUi()}}};
 $('apiOn').checked=!!c.apiOn;$('apiPort').value=c.apiPort||35777;
 $('apiOn').onchange=async()=>{await save({apiOn:$('apiOn').checked});apiUi()};$('apiPort').onchange=async()=>{await save({apiPort:parseInt($('apiPort').value)||35777});apiUi()};apiUi();
 $('chk').onclick=()=>api.checkUpdates();$('log').onclick=()=>api.showLog()}
init();
