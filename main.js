// MultiBrowser: своя оболочка (вкладки разных аккаунтов в одном окне) + усиленный режим (движок fingerprint-chromium отдельным окном)
const {app,BaseWindow,WebContentsView,BrowserWindow,Menu,session,ipcMain,safeStorage,dialog,nativeTheme}=require('electron');
const path=require('path'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn}=require('child_process');
const {autoUpdater}=require('electron-updater');
const RES=app.isPackaged?process.resourcesPath:path.join(__dirname,'resources');
const DATA=()=>app.getPath('userData'), FILE=()=>path.join(DATA(),'profiles.json');
const START='https://www.google.com/', SEARCH='https://www.google.com/search?q=';
const running=new Map(),tunnels=new Map(),tabs=[];
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

// ---------- туннель VPN-конфига (общий для всех вкладок одного профиля) ----------
async function makeTunnel(p,tag){
 const port=await freePort(),dir=path.join(DATA(),'run');fs.mkdirSync(dir,{recursive:true});
 const conf=path.join(dir,tag+p.id+'.conf');
 fs.writeFileSync(conf,dec(p.vpn)+`\n\n[Socks5]\nBindAddress = 127.0.0.1:${port}\n`);
 const wp=spawn(path.join(RES,'wireproxy.exe'),['-s','-c',conf],{windowsHide:true});
 return {wp,conf,port,n:1,ready:waitPort(port)};
}
async function tunnelFor(p){
 let t=tunnels.get(p.id);
 if(t)t.n++;else{t=await makeTunnel(p,'s-');tunnels.set(p.id,t)}
 if(!await t.ready){dropTunnel(p.id,true);throw new Error('VPN-туннель не поднялся: проверь конфиг')}
 return t.port;
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
 const t=tabs.find(x=>x.id===active),pg=t&&t.kind!=='manager',nh=pg?t.view.webContents.navigationHistory:null,all=load();
 const nm=id=>id==='_mgr'?'Профили':(all.find(p=>p.id===id)||{name:'?'}).name;
 const col=id=>id==='_mgr'?'#8b93a5':colorOf(id);
 saveSoon();
 win.webContents.send('tabs',{mode,active,url:pg?t.url:'',canBack:nh?nh.canGoBack():false,canFwd:nh?nh.canGoForward():false,
  profiles:[...new Set(tabs.map(x=>x.pid))].map(id=>({id,name:nm(id),color:col(id)})),
  tabs:tabs.map(x=>({id:x.id,pid:x.pid,title:x.kind==='manager'?'Профили':(x.title||x.url||'Новая вкладка'),color:col(x.pid),letter:x.kind==='manager'?'☰':nm(x.pid)[0].toUpperCase()}))});
}
async function newTab(pid,url,bg){
 const p=prof(pid);if(!p)return null;
 const ses=session.fromPartition('persist:p-'+pid);   // у каждого профиля свои куки, кэш и хранилище
 let vpn=false;
 try{
  if(p.vpn){const port=await tunnelFor(p);vpn=true;await ses.setProxy({proxyRules:`socks5://127.0.0.1:${port}`})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
 }catch(e){dialog.showErrorBox('MultiBrowser',e.message);return null}
 const v=new WebContentsView({webPreferences:{session:ses,contextIsolation:true,sandbox:true}});
 const t={id:nextId++,pid,view:v,title:'',url:url||START,vpn};tabs.push(t);
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
const norm=s=>{s=s.trim();if(!s)return START;if(/^[a-z]+:\/\//i.test(s))return s;return /^[^\s]+\.[^\s]{2,}$/.test(s)||/^localhost(:\d+)?/.test(s)?'https://'+s:SEARCH+encodeURIComponent(s)};

// ---------- усиленный режим: движок fingerprint-chromium отдельным окном ----------
async function launch(id){
 const p=prof(id);if(!p||running.has(id))return;
 const chrome=findFile(path.join(RES,'engine'),'chrome.exe');if(!chrome)throw new Error('Движок не найден (resources/engine)');
 const job={};let proxy=null;
 if(p.vpn){const t=await makeTunnel(p,'e-');job.wp=t.wp;job.conf=t.conf;
  if(!await t.ready){cleanup(job);throw new Error('VPN-туннель не поднялся: проверь конфиг')}proxy=`socks5://127.0.0.1:${t.port}`}
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
  tabs:tabs.map(t=>({pid:t.pid,kind:t.kind||'page',url:t.kind==='manager'?'':(t.view.webContents.getURL()||t.url)}))};
 try{fs.writeFileSync(SESS(),JSON.stringify(data))}catch{}
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(saveSession,500)}
async function restoreSession(){
 let s=null;try{s=JSON.parse(fs.readFileSync(SESS(),'utf8'))}catch{}
 if(s&&s.mode==='side')mode='side';
 const ids=new Set(load().map(p=>p.id));let target=null;
 for(let i=0;s&&Array.isArray(s.tabs)&&i<s.tabs.length;i++){const x=s.tabs[i];let t=null;
  if(x.kind==='manager')t=openManager(true);else if(ids.has(x.pid))t=await newTab(x.pid,x.url,true);
  if(t&&i===s.active)target=t}
 const pick=target||tabs[0];if(pick)active=pick.id;
 if(!tabs.length&&!ids.size)openManager();
 layout();pushTabs();restoring=false;saveSoon();
 for(const id of (s&&s.enhanced)||[]){if(ids.has(id)){launch(id).catch(()=>{});await new Promise(r=>setTimeout(r,800))}}
}

// ---------- обновления программы (с подтверждением) ----------
function setupUpdater(){
 if(!app.isPackaged)return;
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.on('update-available',async i=>{
  const r=await dialog.showMessageBox(win,{type:'question',buttons:['Скачать','Позже'],defaultId:0,cancelId:1,title:'Обновление',
   message:'Доступна новая версия '+i.version,detail:'Скачать сейчас? Установка произойдёт после перезапуска, вкладки восстановятся.'});
  if(r.response===0)autoUpdater.downloadUpdate().catch(()=>{});
 });
 autoUpdater.on('update-downloaded',async()=>{
  const r=await dialog.showMessageBox(win,{type:'question',buttons:['Перезапустить и установить','Позже'],defaultId:0,cancelId:1,title:'Обновление',message:'Обновление скачано'});
  if(r.response===0){saveSession();quitting=true;autoUpdater.quitAndInstall(true,true)}
 });
 autoUpdater.on('error',()=>{});
 const check=()=>autoUpdater.checkForUpdates().catch(()=>{});
 setTimeout(check,8000);setInterval(check,6*3600*1000);
}

// ---------- IPC ----------
ipcMain.handle('list',()=>({profiles:view(),running:[...running.keys()]}));
ipcMain.handle('pickConf',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'VPN-конфиг',extensions:['conf']}],properties:['openFile']});
 return r.canceled?null:{name:path.basename(r.filePaths[0]),text:fs.readFileSync(r.filePaths[0],'utf8')}});
ipcMain.handle('add',(e,d)=>{const l=load(),p={id:crypto.randomUUID(),name:d.name||'Профиль',seed:crypto.randomInt(1,2147483647)};
 if(d.mode==='vpn'&&d.confText)p.vpn=enc(d.confText);else if(d.mode==='proxy'&&d.host)p.proxy={type:d.type,host:d.host,port:d.port};
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
ipcMain.handle('navigate',(e,s)=>{const t=tabs.find(x=>x.id===active);if(t&&t.kind!=='manager')t.view.webContents.loadURL(norm(s))});
ipcMain.handle('nav',(e,a)=>{const t=tabs.find(x=>x.id===active);if(!t||t.kind==='manager')return;const h=t.view.webContents.navigationHistory;
 if(a==='back')h.goBack();else if(a==='forward')h.goForward();else t.view.webContents.reload()});
ipcMain.handle('setMode',(e,m)=>{mode=m==='side'?'side':'top';layout();pushTabs()});
function openManager(bg){   // страница «Профили» открывается как вкладка внутри оболочки
 const ex=tabs.find(x=>x.kind==='manager');if(ex){if(!bg){active=ex.id;layout();pushTabs()}return ex}
 const v=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
 const t={id:nextId++,pid:'_mgr',kind:'manager',view:v,title:'Профили',url:''};tabs.push(t);
 win.contentView.addChildView(v);if(!bg||active===null)active=t.id;v.webContents.loadFile('ui/index.html');layout();pushTabs();return t;
}
ipcMain.handle('openManager',()=>{openManager()});
const ovl=()=>{const d=nativeTheme.shouldUseDarkColors;return{color:d?'#181c25':'#f3f4f7',symbolColor:d?'#e6e9f0':'#1b1f2a',height:40}};
app.whenReady().then(()=>{
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
