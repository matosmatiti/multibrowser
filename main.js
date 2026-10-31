// MultiBrowser: своя оболочка (вкладки разных аккаунтов в одном окне) + усиленный режим (движок fingerprint-chromium отдельным окном)
const {app,BaseWindow,WebContentsView,BrowserWindow,Menu,session,ipcMain,safeStorage,dialog,nativeTheme,shell}=require('electron');
const path=require('path'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn,spawnSync}=require('child_process');
const {autoUpdater}=require('electron-updater');
const RES=app.isPackaged?process.resourcesPath:path.join(__dirname,'resources');
const DATA=()=>app.getPath('userData'), FILE=()=>path.join(DATA(),'profiles.json');
const SETF=()=>path.join(app.getPath('userData'),'settings.json');
const DEF={search:'google',home:'google',customHome:'',theme:'system',restore:true,autoUpdate:true};
const ENG={google:'https://www.google.com/search?q=',duckduckgo:'https://duckduckgo.com/?q=',bing:'https://www.bing.com/search?q='};
let cfg={...DEF},manual=false;
const loadCfg=()=>{try{cfg={...DEF,...JSON.parse(fs.readFileSync(SETF(),'utf8'))}}catch{cfg={...DEF}}};
const saveCfg=()=>{try{fs.writeFileSync(SETF(),JSON.stringify(cfg,null,1))}catch{}};
const applyTheme=()=>{nativeTheme.themeSource=['light','dark'].includes(cfg.theme)?cfg.theme:'system'};
const homeUrl=()=>cfg.home==='blank'?'about:blank':(cfg.home==='custom'&&/^https?:\/\//i.test(cfg.customHome)?cfg.customHome:'https://www.google.com/');
const searchUrl=()=>ENG[cfg.search]||ENG.google;
const PAGES={manager:{file:'ui/index.html',pid:'_mgr',title:'Профили',icon:'☰'},settings:{file:'ui/settings.html',pid:'_set',title:'Настройки',icon:'⚙'}};
const running=new Map(),tunnels=new Map(),tabs=[];
const LOG=()=>path.join(app.getPath('userData'),'log.txt');
const log=m=>{try{fs.appendFileSync(LOG(),new Date().toISOString()+' '+m+'\n')}catch{}};
let win,active=null,mode='top',nextId=1,restoring=true,quitting=false,saveT=null,started=false;
const load=()=>{try{return JSON.parse(fs.readFileSync(FILE(),'utf8'))}catch{return[]}};
const save=l=>fs.writeFileSync(FILE(),JSON.stringify(l,null,1));
const prof=id=>load().find(p=>p.id===id);
// секреты (VPN-конфиги) шифруются средствами Windows (DPAPI), мастер-пароль не нужен
const enc=s=>safeStorage.encryptString(s).toString('base64');
const dec=s=>safeStorage.decryptString(Buffer.from(s,'base64'));
function findFile(dir,name){try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
 if(e.isDirectory()){const r=findFile(p,name);if(r)return r}else if(e.name.toLowerCase()===name)return p}}catch{}return null}
const freePort=()=>new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
const probe=p=>new Promise(r=>{const c=net.connect(p,'127.0.0.1');c.on('connect',()=>{c.destroy();r(true)});c.on('error',()=>r(false))});
async function waitPort(p){for(let i=0;i<40;i++){if(await probe(p))return true;await new Promise(r=>setTimeout(r,200))}return false}
const kill=c=>{try{c&&c.pid&&spawn('taskkill',['/pid',String(c.pid),'/T','/F'],{windowsHide:true})}catch{}};
function cleanup(j){kill(j.wp);if(j.conf)try{fs.rmSync(j.conf,{force:true})}catch{}}
const PAL=['#ff7a59','#4c8dff','#3ecf8e','#b58cff','#ffc247','#ff6b9a','#2ec4c4','#9aa5b8'];
const colorOf=id=>PAL[parseInt(id.replace(/-/g,'').slice(0,6),16)%PAL.length];
const pushMgr=()=>{saveSoon();const t=tabs.find(x=>x.kind==='manager');if(t&&!t.view.webContents.isDestroyed())t.view.webContents.send('state',[...running.keys()])};
const view=()=>load().map(p=>({id:p.id,name:p.name,color:colorOf(p.id),kind:p.vpn?'VPN-конфиг':p.proxy?p.proxy.type.toUpperCase()+' '+p.proxy.host+':'+p.proxy.port:'Без прокси'}));

// ---------- подключения: прокси с логином и VPN-конфиги (WireGuard) через sing-box ----------
const needsTunnel=p=>!!(p.vpn||(p.proxy&&p.proxy.user));
function parseWg(text){
 const I={},P={};let cur=null,peers=0;
 for(let line of text.split(/\r?\n/)){line=line.trim();if(!line||line[0]==='#'||line[0]===';')continue;
  const m=line.match(/^\[(\w+)\]$/);if(m){cur=m[1]==='Interface'?I:(m[1]==='Peer'&&!peers++?P:null);continue}
  const i=line.indexOf('=');if(i<0||!cur)continue;cur[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim()}
 if(['jc','jmin','jmax','s1','s2','s3','s4','h1','h2','h3','h4','i1','i2','i3','i4','i5'].some(k=>k in I))
  throw new Error('Это конфиг AmneziaWG (с параметрами Jc, S1, H1…). Нужен обычный WireGuard-конфиг.');
 const e=(P.endpoint||'').match(/^\[?([^\]]+?)\]?:(\d+)$/);
 if(!I.privatekey||!I.address||!P.publickey||!e)throw new Error('В конфиге не хватает данных (PrivateKey, Address, PublicKey или Endpoint).');
 const dns=(I.dns||'').split(',').map(x=>x.trim()).filter(Boolean);
 return {address:I.address.split(',').map(x=>x.trim()),privateKey:I.privatekey,mtu:+I.mtu||1280,dns:dns.find(x=>/^\d+\.\d+\.\d+\.\d+$/.test(x))||dns[0]||'1.1.1.1',
  host:e[1],port:+e[2],pub:P.publickey,psk:P.presharedkey,keepalive:+P.persistentkeepalive||25};
}
function singConfig(p,port){
 const c={log:{level:'error'},inbounds:[{type:'mixed',tag:'in',listen:'127.0.0.1',listen_port:port}]};
 const boot={type:'udp',tag:'boot',server:'1.1.1.1'};
 if(p.vpn){
  const w=parseWg(dec(p.vpn));
  c.endpoints=[{type:'wireguard',tag:'proxy',address:w.address,private_key:w.privateKey,mtu:w.mtu,
   peers:[{address:w.host,port:w.port,public_key:w.pub,...(w.psk?{pre_shared_key:w.psk}:{}),allowed_ips:['0.0.0.0/0','::/0'],persistent_keepalive_interval:w.keepalive}]}];
  c.dns={servers:[boot,{type:'udp',tag:'tun',server:w.dns,detour:'proxy'}],final:'tun'};
 }else{
  const x=p.proxy,o={type:x.type==='http'?'http':'socks',tag:'proxy',server:x.host,server_port:+x.port,username:x.user,password:dec(x.pass||'')};
  if(o.type==='socks')o.version='5';
  c.outbounds=[o];c.dns={servers:[boot]};
 }
 c.route={final:'proxy',default_domain_resolver:'boot'};
 return c;
}
async function makeTunnel(p,tag){
 const port=await freePort(),dir=path.join(DATA(),'run');fs.mkdirSync(dir,{recursive:true});
 const conf=path.join(dir,tag+p.id+'.json'),exe=path.join(RES,'sing-box.exe');
 fs.writeFileSync(conf,JSON.stringify(singConfig(p,port)));   // сам конфиг лежит на диске только пока профиль открыт
 const chk=spawnSync(exe,['check','-c',conf],{windowsHide:true,encoding:'utf8'});
 if(chk.status!==0){try{fs.rmSync(conf,{force:true})}catch{}const m=((chk.stderr||chk.stdout||chk.error&&chk.error.message||'')+'').trim().split('\n').pop();log('sing-box check: '+m);throw new Error('Не удалось применить настройки подключения: '+m)}
 const wp=spawn(exe,['run','-c',conf],{windowsHide:true});let out='';
 const add=d=>{out=(out+d).slice(-800)};wp.stdout.on('data',add);wp.stderr.on('data',add);
 return {wp,conf,port,n:1,err:()=>out.trim().split('\n').pop()||'туннель не отвечает',ready:waitPort(port)};
}
async function tunnelFor(p){
 let t=tunnels.get(p.id);
 if(t)t.n++;else{t=await makeTunnel(p,'s-');tunnels.set(p.id,t)}
 if(!await t.ready){const e=t.err();log('tunnel failed: '+e);dropTunnel(p.id,true);throw new Error('Не удалось подключиться: '+e)}
 return `socks5://127.0.0.1:${t.port}`;
}
function dropTunnel(id,force){const t=tunnels.get(id);if(!t)return;if(!force&&--t.n>0)return;cleanup(t);tunnels.delete(id)}

// ---------- оболочка: вкладки ----------
function layout(){
 if(!win||win.isDestroyed())return;const b=win.getContentBounds(),W=b.width,H=b.height;
 const x=mode==='side'?240:0,y=mode==='side'?42:82;
 for(const t of tabs){const on=t.id===active;t.view.setVisible(on);if(on)t.view.setBounds({x,y,width:Math.max(W-x,1),height:Math.max(H-y,1)})}
}
function pushTabs(){
 if(!win||win.isDestroyed()||win.webContents.isDestroyed())return;
 saveSoon();
 const t=tabs.find(x=>x.id===active),pg=t&&!t.kind,nh=pg?t.view.webContents.navigationHistory:null,all=load();
 const nm=id=>id==='_mgr'?PAGES.manager.title:id==='_set'?PAGES.settings.title:(all.find(p=>p.id===id)||{name:'?'}).name;
 const col=id=>id[0]==='_'?'#8b93a5':colorOf(id);
 win.webContents.send('tabs',{mode,active,url:pg?t.url:'',canBack:nh?nh.canGoBack():false,canFwd:nh?nh.canGoForward():false,
  profiles:[...new Set(tabs.map(x=>x.pid))].map(id=>({id,name:nm(id),color:col(id)})),
  tabs:tabs.map(x=>({id:x.id,pid:x.pid,title:x.kind?PAGES[x.kind].title:(x.title||x.url||'Новая вкладка'),color:col(x.pid),letter:x.kind?PAGES[x.kind].icon:nm(x.pid)[0].toUpperCase()}))});
}
async function newTab(pid,url,bg){
 const p=prof(pid);if(!p)return null;
 const ses=session.fromPartition('persist:p-'+pid);   // у каждого профиля свои куки, кэш и хранилище
 let vpn=false;
 try{
  if(needsTunnel(p)){const u=await tunnelFor(p);vpn=true;await ses.setProxy({proxyRules:u})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
 }catch(e){dialog.showErrorBox('MultiBrowser',e.message);return null}
 const v=new WebContentsView({webPreferences:{session:ses,contextIsolation:true,sandbox:true}});
 const t={id:nextId++,pid,view:v,title:'',url:url||homeUrl(),vpn};tabs.push(t);
 const wc=v.webContents;
 wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
 wc.setWindowOpenHandler(({url:u})=>{newTab(pid,u);return{action:'deny'}});
 wc.on('page-title-updated',(e,s)=>{t.title=s;pushTabs()});
 wc.on('did-navigate',(e,u)=>{t.url=u;pushTabs()});
 wc.on('did-navigate-in-page',(e,u)=>{t.url=u;pushTabs()});
 wc.on('before-input-event',(e,i)=>{if(i.type!=='keyDown')return;
  if(i.key==='F12'){wc.toggleDevTools();e.preventDefault()}
  else if(i.control&&i.key.toLowerCase()==='w'){closeTab(t.id);e.preventDefault()}});
 win.contentView.addChildView(v);if(!bg||active===null)active=t.id;wc.loadURL(t.url);layout();pushTabs();return t;
}
function closeTab(id){
 const i=tabs.findIndex(x=>x.id===id);if(i<0)return;const t=tabs[i];tabs.splice(i,1);
 win.contentView.removeChildView(t.view);t.view.webContents.close();if(t.vpn)dropTunnel(t.pid);
 if(active===id)active=tabs.length?tabs[Math.max(0,i-1)].id:null;layout();pushTabs();
}
const norm=s=>{s=s.trim();if(!s)return homeUrl();if(/^[a-z]+:\/\//i.test(s))return s;return /^[^\s]+\.[^\s]{2,}$/.test(s)||/^localhost(:\d+)?/.test(s)?'https://'+s:searchUrl()+encodeURIComponent(s)};

// ---------- усиленный режим: движок fingerprint-chromium отдельным окном ----------
async function launch(id){
 const p=prof(id);if(!p||running.has(id))return;
 const chrome=findFile(path.join(RES,'engine'),'chrome.exe');if(!chrome)throw new Error('Движок не найден (resources/engine)');
 const job={};let proxy=null;
 if(needsTunnel(p)){const t=await makeTunnel(p,'e-');job.wp=t.wp;job.conf=t.conf;
  if(!await t.ready){const e=t.err();cleanup(job);throw new Error('Не удалось подключиться: '+e)}proxy=`socks5://127.0.0.1:${t.port}`}
 else if(p.proxy)proxy=`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`;
 const args=[`--user-data-dir=${path.join(DATA(),'profiles',id)}`,`--fingerprint=${p.seed}`,'--no-first-run','--no-default-browser-check','--restore-last-session'];
 if(proxy)args.push(`--proxy-server=${proxy}`,'--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
 job.chrome=spawn(chrome,args);running.set(id,job);pushMgr();
 job.chrome.on('exit',()=>{cleanup(job);running.delete(id);pushMgr()});
}

// ---------- сохранение и восстановление вкладок ----------
const SESS=()=>path.join(DATA(),'session.json');
function saveSession(){
 if(restoring||quitting)return;
 const data={mode,active:tabs.findIndex(t=>t.id===active),enhanced:[...running.keys()],
  tabs:tabs.map(t=>({pid:t.pid,kind:t.kind||'',url:t.kind?'':(t.view.webContents.getURL()||t.url)}))};
 try{fs.writeFileSync(SESS(),JSON.stringify(data))}catch{}
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(saveSession,500)}
async function restoreSession(){
 let s=null;
 try{
  try{s=JSON.parse(fs.readFileSync(SESS(),'utf8'))}catch(e){log('session read: '+e.message)}
  log('restore: '+(s&&s.tabs?s.tabs.length+' tabs, '+(s.enhanced||[]).length+' enhanced':'no session')+(cfg.restore?'':' (disabled)'));
  if(!cfg.restore)s=null;
  if(s&&s.mode==='side')mode='side';
  const ids=new Set(load().map(p=>p.id));let target=null;
  for(let i=0;s&&Array.isArray(s.tabs)&&i<s.tabs.length;i++){const x=s.tabs[i];let t=null;
   try{if(x.kind&&PAGES[x.kind])t=openPage(x.kind,true);else if(!x.kind&&ids.has(x.pid))t=await newTab(x.pid,x.url,true)}catch(e){log('restore tab: '+e.message)}
   if(t&&i===s.active)target=t}
  const pick=target||tabs[0];if(pick)active=pick.id;
  if(!tabs.length&&!ids.size)openPage('manager');
  layout();pushTabs();
 }catch(e){log('restore error: '+(e&&e.stack||e))}
 finally{restoring=false;saveSoon()}
 for(const id of (s&&s.enhanced)||[]){if(load().some(p=>p.id===id)){launch(id).catch(e=>log('restore enhanced: '+e.message));await new Promise(r=>setTimeout(r,800))}}
}

// ---------- обновления программы (с подтверждением и индикатором) ----------
const sendUpd=u=>{if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('update',u)};
function manualCheck(){
 if(!app.isPackaged)return dialog.showMessageBox(win,{message:'Проверка обновлений работает только в установленной версии.'});
 manual=true;
 return autoUpdater.checkForUpdates().catch(()=>{manual=false;dialog.showMessageBox(win,{type:'warning',message:'Не удалось проверить обновления',detail:'Проверь интернет. Репозиторий с релизами должен быть публичным.'})});
}
function setupUpdater(){
 if(!app.isPackaged)return;
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.on('update-available',async i=>{
  manual=false;log('update available '+i.version);
  const r=await dialog.showMessageBox(win,{type:'question',buttons:['Скачать','Позже'],defaultId:0,cancelId:1,title:'Обновление',
   message:'Доступна новая версия '+i.version,detail:'Скачать сейчас? Установка начнётся после перезапуска, вкладки восстановятся.'});
  if(r.response===0){sendUpd({state:'downloading',percent:0});autoUpdater.downloadUpdate().catch(e=>{log('download error '+e);win.setProgressBar(-1);sendUpd({state:'idle'})})}
 });
 autoUpdater.on('download-progress',p=>{const pc=Math.round(p.percent||0);win.setProgressBar(pc/100);sendUpd({state:'downloading',percent:pc})});
 autoUpdater.on('update-downloaded',async()=>{
  win.setProgressBar(-1);sendUpd({state:'idle'});
  const r=await dialog.showMessageBox(win,{type:'question',buttons:['Перезапустить и установить','Позже'],defaultId:0,cancelId:1,title:'Обновление',message:'Обновление скачано'});
  if(r.response===0){sendUpd({state:'installing'});win.setProgressBar(2);saveSession();quitting=true;log('quitAndInstall');
   setTimeout(()=>autoUpdater.quitAndInstall(false,true),1200)}
 });
 autoUpdater.on('update-not-available',()=>{if(manual){manual=false;dialog.showMessageBox(win,{message:'Установлена последняя версия'})}});
 autoUpdater.on('error',e=>log('updater error: '+(e&&e.message)));
 const check=()=>{if(cfg.autoUpdate)autoUpdater.checkForUpdates().catch(()=>{})};
 setTimeout(check,8000);setInterval(check,6*3600*1000);
}

// ---------- IPC ----------
ipcMain.handle('list',()=>({profiles:view(),running:[...running.keys()]}));
ipcMain.handle('pickConf',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'VPN-конфиг',extensions:['conf']}],properties:['openFile']});
 return r.canceled?null:{name:path.basename(r.filePaths[0]),text:fs.readFileSync(r.filePaths[0],'utf8')}});
ipcMain.handle('add',(e,d)=>{const l=load(),p={id:crypto.randomUUID(),name:d.name||'Профиль',seed:crypto.randomInt(1,2147483647)};
 if(d.mode==='vpn'&&d.confText)p.vpn=enc(d.confText);else if(d.mode==='proxy'&&d.host){p.proxy={type:d.type,host:d.host,port:d.port};if(d.user){p.proxy.user=d.user;p.proxy.pass=enc(d.pass||'')}}
 l.push(p);save(l);pushTabs()});
ipcMain.handle('launch',async(e,id)=>{try{await launch(id);return null}catch(x){return x.message}});
ipcMain.handle('stop',(e,id)=>{const j=running.get(id);if(j)kill(j.chrome)});
ipcMain.handle('remove',(e,id)=>{for(const t of tabs.filter(x=>x.pid===id))closeTab(t.id);
 const j=running.get(id);if(j){kill(j.chrome);cleanup(j);running.delete(id)}save(load().filter(p=>p.id!==id))});
ipcMain.handle('openInShell',(e,id)=>newTab(id));
ipcMain.handle('newTab',(e,id)=>newTab(id));
ipcMain.handle('newTabMenu',()=>{const l=load();
 const items=l.length?l.map(p=>({label:p.name,click:()=>newTab(p.id)})):[{label:'Сначала создай профиль (кнопка «Профили»)',enabled:false}];
 if(l.length)items.push({type:'separator'},{label:'Усиленный режим (отдельное окно)',submenu:l.map(p=>({label:p.name,click:()=>launch(p.id).catch(x=>dialog.showErrorBox('MultiBrowser',x.message))}))});
 Menu.buildFromTemplate(items).popup()});
ipcMain.handle('activate',(e,id)=>{active=id;layout();pushTabs()});
ipcMain.handle('closeTab',(e,id)=>closeTab(id));
ipcMain.handle('navigate',(e,s)=>{const t=tabs.find(x=>x.id===active);if(t&&!t.kind)t.view.webContents.loadURL(norm(s))});
ipcMain.handle('nav',(e,a)=>{const t=tabs.find(x=>x.id===active);if(!t||t.kind)return;const h=t.view.webContents.navigationHistory;
 if(a==='back')h.goBack();else if(a==='forward')h.goForward();else t.view.webContents.reload()});
ipcMain.handle('setMode',(e,m)=>{mode=m==='side'?'side':'top';layout();pushTabs()});
function openPage(kind,bg){   // внутренние страницы («Профили», «Настройки») открываются как вкладки
 const def=PAGES[kind],ex=tabs.find(x=>x.kind===kind);if(ex){if(!bg){active=ex.id;layout();pushTabs()}return ex}
 const v=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
 const t={id:nextId++,pid:def.pid,kind,view:v,title:def.title,url:''};tabs.push(t);
 win.contentView.addChildView(v);if(!bg||active===null)active=t.id;v.webContents.loadFile(def.file);layout();pushTabs();return t;
}
const openManager=bg=>openPage('manager',bg);
ipcMain.handle('openManager',()=>{openManager()});
ipcMain.handle('openSettings',()=>{openPage('settings')});
ipcMain.handle('getSettings',()=>({...cfg,version:app.getVersion()}));
ipcMain.handle('setSettings',(e,p)=>{for(const k of Object.keys(DEF))if(k in p)cfg[k]=p[k];saveCfg();applyTheme();return true});
ipcMain.handle('checkUpdates',()=>manualCheck());
ipcMain.handle('showLog',()=>{shell.showItemInFolder(LOG())});
const ovl=()=>{const d=nativeTheme.shouldUseDarkColors;return{color:d?'#181c25':'#f3f4f7',symbolColor:d?'#e6e9f0':'#1b1f2a',height:40}};
app.whenReady().then(()=>{
 loadCfg();applyTheme();
 try{if(fs.statSync(LOG()).size>200000)fs.rmSync(LOG())}catch{}
 log('start v'+app.getVersion());
 Menu.setApplicationMenu(null);
 win=new BrowserWindow({width:1280,height:800,title:'MultiBrowser',backgroundColor:'#12151c',titleBarStyle:'hidden',titleBarOverlay:ovl(),
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
 win.loadFile('ui/shell.html');
 win.webContents.on('did-finish-load',()=>{layout();pushTabs();if(!started){started=true;restoreSession()}});
 win.on('close',()=>{saveSession();quitting=true});
 setupUpdater();
 nativeTheme.on('updated',()=>{try{win.setTitleBarOverlay(ovl())}catch{}});
 for(const ev of ['resize','maximize','unmaximize','enter-full-screen','leave-full-screen'])win.on(ev,layout);
 win.on('closed',()=>app.quit());
});
app.on('before-quit',()=>{for(const j of running.values()){kill(j.chrome);cleanup(j)}for(const t of tunnels.values())cleanup(t)});
