// MultiBrowser: своя оболочка (вкладки разных аккаунтов в одном окне) + усиленный режим (движок fingerprint-chromium отдельным окном)
const {app,BaseWindow,WebContentsView,BrowserWindow,Menu,session,ipcMain,safeStorage,dialog,nativeTheme,shell,screen}=require('electron');
const path=require('path'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn,spawnSync}=require('child_process');
const {autoUpdater}=require('electron-updater');
const RES=app.isPackaged?process.resourcesPath:path.join(__dirname,'resources');
const DATA=()=>app.getPath('userData'), FILE=()=>path.join(DATA(),'profiles.json');
const SETF=()=>path.join(app.getPath('userData'),'settings.json');
try{let sd='force';try{sd=JSON.parse(fs.readFileSync(SETF(),'utf8')).siteDark||'force'}catch{}if(sd==='force')app.commandLine.appendSwitch('enable-features','WebContentsForceDark')}catch{}   // сайты по умолчанию в тёмной теме
const DEF={search:'google',home:'google',customHome:'',theme:'dark',siteDark:'force',adblock:true,restore:true,autoUpdate:true,downloadDir:'',bmBar:false,keepHistory:true,dlToast:true,ver:2};
const ENG={google:'https://www.google.com/search?q=',duckduckgo:'https://duckduckgo.com/?q=',bing:'https://www.bing.com/search?q='};
let cfg={...DEF},manual=false;
const loadCfg=()=>{try{cfg={...DEF,...JSON.parse(fs.readFileSync(SETF(),'utf8'))}}catch{cfg={...DEF}}
 if((cfg.ver||0)<2){cfg.theme='dark';cfg.siteDark=cfg.siteDark||'force';cfg.ver=2;saveCfg()}};
const saveCfg=()=>{try{fs.writeFileSync(SETF(),JSON.stringify(cfg,null,1))}catch{}};
const applyTheme=()=>{nativeTheme.themeSource=['light','dark'].includes(cfg.theme)?cfg.theme:'system'};
const homeUrl=()=>cfg.home==='blank'?'about:blank':(cfg.home==='custom'&&/^https?:\/\//i.test(cfg.customHome)?cfg.customHome:'https://www.google.com/');
const searchUrl=()=>ENG[cfg.search]||ENG.google;
const PAGES={scripts:{file:'ui/scripts.html',pid:'_sc',title:'Скрипты',icon:'⚡'},bookmarks:{file:'ui/bookmarks.html',pid:'_bm',title:'Закладки',icon:'★'},history:{file:'ui/history.html',pid:'_hist',title:'История',icon:'⏱'},manager:{file:'ui/index.html',pid:'_mgr',title:'Профили',icon:'☰'},settings:{file:'ui/settings.html',pid:'_set',title:'Настройки',icon:'⚙'}};
const running=new Map(),tunnels=new Map();
const hooked=new Set(),live=new Map(),closedTabs=[];
let scripts=[],dlRect=null,toastV=null,toastOpen=false,toastId=null,toastT=null,toastHover=false,flyV=null,menuV=null,menuOpen=false,menuShownAt=0,lastMenuBlur=0,menuActs=new Map(),menuPayload={items:[]},menuAnchor=null,fading=false,bookmarks=[],history=[],histT=null,uidN=0,lastPid=null,downloads=[],panel=null,panelOpen=false,panelShownAt=0,lastBlurHide=0,updating=false;
const LOG=()=>path.join(app.getPath('userData'),'log.txt');
const log=m=>{try{fs.appendFileSync(LOG(),new Date().toISOString()+' '+m+'\n')}catch{}};
let win=null,tabs=[],active=null,mode='top',curW=null,overlayW=null,nextId=1,restoring=true,quitting=false,saveT=null,started=false;
const windows=[];
// Несколько окон: глобальные win/tabs/active/mode всегда указывают на «текущее» окно, useW(W) переключает контекст
function useW(W){if(!W||W.dead)return false;curW=W;win=W.win;tabs=W.tabs;active=W.active;mode=W.mode;return true}
function setActive(id){active=id;if(curW)curW.active=id}
function setMode(m){mode=m;if(curW)curW.mode=m}
function ownerCtx(wc){if(!wc)return;for(const W of windows){if(W.dead)continue;if(W.win.webContents===wc||W.tabs.some(t=>t.view.webContents===wc)){useW(W);return}}if(overlayW)useW(overlayW)}
const H=(ch,fn)=>ipcMain.handle(ch,(e,...a)=>{ownerCtx(e&&e.sender);return fn(e,...a)});
function attach(v){if(v.__w&&v.__w!==win&&!v.__w.isDestroyed()){try{v.__w.contentView.removeChildView(v)}catch{}}win.contentView.addChildView(v);v.__w=win;overlayW=curW}
const ICON=path.join(__dirname,'ui','icon.png');
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
const pushMgr=()=>{saveSoon();for(const W of windows)for(const t of W.tabs)if(t.kind==='manager'&&!t.view.webContents.isDestroyed())t.view.webContents.send('state',[...running.keys()])};
const view=()=>load().map(p=>({id:p.id,name:p.name,color:colorOf(p.id),kind:(p.vpn?'VPN-конфиг'+(p.vpnNote?' (AWG→WG)':''):p.proxy?p.proxy.type.toUpperCase()+' '+p.proxy.host+':'+p.proxy.port:'Без прокси')+(p.tz?' · '+p.tz:'')}));

// ---------- подключения: прокси с логином и VPN-конфиги (WireGuard) через sing-box ----------
const needsTunnel=p=>!!(p.vpn||(p.proxy&&p.proxy.user));
function parseWg(text){
 const I={},P={};let cur=null,peers=0;
 for(let line of text.split(/\r?\n/)){line=line.trim();if(!line||line[0]==='#'||line[0]===';')continue;
  const m=line.match(/^\[(\w+)\]$/);if(m){cur=m[1]==='Interface'?I:(m[1]==='Peer'&&!peers++?P:null);continue}
  const i=line.indexOf('=');if(i<0||!cur)continue;cur[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim()}
 let converted=false;   // AmneziaWG без смены заголовков (S=0, H=1..4) совместим с обычным WireGuard: маскировку просто отбрасываем
 if(['jc','jmin','jmax','s1','s2','s3','s4','h1','h2','h3','h4','i1','i2','i3','i4','i5','id','ip','ib'].some(k=>k in I)){
  const n=k=>I[k]===undefined?0:(parseInt(I[k])||0),hd=(k,d)=>I[k]===undefined||String(I[k]).trim()===String(d);
  if(![1,2,3,4].every(x=>n('s'+x)===0)||![1,2,3,4].every(x=>hd('h'+x,x)))
   throw new Error('Это конфиг AmneziaWG с изменёнными заголовками (параметры S и H). Такой сервер не принимает обычный WireGuard, нужен другой конфиг.');
  converted=true;
 }
 const e=(P.endpoint||'').match(/^\[?([^\]]+?)\]?:(\d+)$/);
 if(!I.privatekey||!I.address||!P.publickey||!e)throw new Error('В конфиге не хватает данных (PrivateKey, Address, PublicKey или Endpoint).');
 const dns=(I.dns||'').split(',').map(x=>x.trim()).filter(Boolean);
 return {address:I.address.split(',').map(x=>x.trim()),privateKey:I.privatekey,mtu:+I.mtu||1280,dns:dns.find(x=>/^\d+\.\d+\.\d+\.\d+$/.test(x))||dns[0]||'1.1.1.1',
  host:e[1],port:+e[2],pub:P.publickey,psk:P.presharedkey,keepalive:+P.persistentkeepalive||25,converted};
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
const bgColor=()=>nativeTheme.shouldUseDarkColors?'#12151c':'#ffffff';
function mkView(wp){const v=new WebContentsView({webPreferences:wp});v.setBackgroundColor(bgColor());return v}   // для внутренних страниц и меню: тёмный фон вместо белого
function fadeTo(v,ms){
 const w=win;if(!w||w.isDestroyed())return;const from=w.getOpacity(),n=Math.max(1,Math.round(ms/16));let i=0;fading=true;
 const id=setInterval(()=>{i++;if(w.isDestroyed()){clearInterval(id);fading=false;return}
  w.setOpacity(from+(v-from)*Math.min(i/n,1));if(i>=n){clearInterval(id);fading=false}},16);
}
const langsOf=l=>l?`${l},${l.split('-')[0]};q=0.9`:'';
function applyGeo(wc,p){   // часовой пояс и язык профиля (подмена на уровне страницы)
 if(!p.tz&&!p.lang)return;
 try{wc.debugger.attach('1.3')}catch{}
 try{
  if(p.tz)wc.debugger.sendCommand('Emulation.setTimezoneOverride',{timezoneId:p.tz}).catch(()=>{});
  if(p.lang){wc.debugger.sendCommand('Emulation.setLocaleOverride',{locale:p.lang}).catch(()=>{});
   wc.debugger.sendCommand('Emulation.setUserAgentOverride',{userAgent:wc.getUserAgent(),acceptLanguage:langsOf(p.lang)}).catch(()=>{})}
 }catch(e){log('geo: '+e.message)}
}
const topH=()=>(mode==='side'?42:82)+(cfg.bmBar?30:0);
function layout(){
 if(!win||win.isDestroyed())return;const b=win.getContentBounds(),W=b.width,H=b.height;
 const x=mode==='side'?240:0,y=topH();
 for(const t of tabs){const on=t.id===active&&t.ready!==false;t.view.setVisible(on);if(on)t.view.setBounds({x,y,width:Math.max(W-x,1),height:Math.max(H-y,1)})}
 if(panel&&panelOpen)panel.setBounds(panelBounds());
}
function pushTabs(){
 if(!win||win.isDestroyed()||win.webContents.isDestroyed())return;
 saveSoon();raisePanel();
 const t=tabs.find(x=>x.id===active),pg=t&&!t.kind,nh=pg?t.view.webContents.navigationHistory:null,all=load();
 if(pg)lastPid=t.pid;
 const pgOf=id=>Object.values(PAGES).find(x=>x.pid===id),nm=id=>pgOf(id)?pgOf(id).title:(all.find(p=>p.id===id)||{name:'?'}).name;
 const col=id=>id[0]==='_'?'#8b93a5':colorOf(id);
 win.webContents.send('tabs',{mode,active,blocked:(t&&t.blocked)||0,adOn:!!cfg.adblock,loading:!!(t&&!t.kind&&t.loading),waiting:!!(t&&t.ready===false),starred:!!(pg&&bookmarks.some(b=>b.url===t.url)),url:pg?t.url:'',canBack:nh?nh.canGoBack():false,canFwd:nh?nh.canGoForward():false,
  profiles:[...new Set(tabs.map(x=>x.pid))].map(id=>({id,name:nm(id),color:col(id),icon:pgOf(id)?pgOf(id).icon:null})),
  tabs:tabs.map(x=>({id:x.id,pid:x.pid,title:x.kind?PAGES[x.kind].title:(x.title||x.url||'Новая вкладка'),color:col(x.pid),letter:x.kind?PAGES[x.kind].icon:nm(x.pid)[0].toUpperCase()}))});
}
async function newTab(pid,url,bg){
 const p=prof(pid);if(!p)return null;
 const W=curW;
 const ses=session.fromPartition('persist:p-'+pid);hookDownloads(ses,pid);adblockSession(ses,pid);   // у каждого профиля свои куки, кэш и хранилище
 let vpn=false;
 try{
  if(needsTunnel(p)){const u=await tunnelFor(p);vpn=true;await ses.setProxy({proxyRules:u})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
 }catch(e){appDialog({title:'MultiBrowser',type:'error',message:e.message});return null}
 useW(W);
 const v=new WebContentsView({webPreferences:{session:ses,contextIsolation:true,sandbox:true}});
 const t={id:nextId++,pid,view:v,title:'',url:url||homeUrl(),vpn,ready:false,loading:true,W,blocked:0};tabs.push(t);
 const wc=v.webContents;
 const on=(ev,fn)=>wc.on(ev,(...a)=>{if(useW(t.W))fn(...a)}),once=(ev,fn)=>wc.once(ev,(...a)=>{if(useW(t.W))fn(...a)});
 on('did-start-navigation',(e,u,inPlace,main)=>{if(main&&!inPlace)t.blocked=0});
 wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
 const mkReady=()=>{if(!t.ready&&useW(t.W)){t.ready=true;layout();pushTabs()}};   // страница показывается, когда готова: без белой вспышки
 once('dom-ready',()=>setTimeout(mkReady,60));setTimeout(mkReady,3500);
 on('did-start-loading',()=>{t.loading=true;pushTabs()});on('did-stop-loading',()=>{t.loading=false;mkReady();pushTabs()});
 applyGeo(wc,p);
 on('dom-ready',()=>runScripts(wc,pid,'dom-ready'));on('did-finish-load',()=>runScripts(wc,pid,'load'));
 wc.setWindowOpenHandler(({url:u})=>{useW(t.W);newTab(pid,u);return{action:'deny'}});
 on('page-title-updated',(e,s)=>{t.title=s;if(t.h)t.h.title=s;saveHistSoon();pushTabs()});
 on('did-navigate',(e,u)=>{t.url=u;t.h=addHistory(pid,u);pushTabs()});
 on('did-navigate-in-page',(e,u,main)=>{t.url=u;if(main)t.h=addHistory(pid,u);pushTabs()});
 on('before-input-event',(e,i)=>{if(hotkey(i,wc))e.preventDefault()});
 on('found-in-page',(e,r)=>{if(t.id===active&&win&&!win.webContents.isDestroyed())win.webContents.send('find-result',{n:r.activeMatchOrdinal,total:r.matches})});
 win.contentView.addChildView(v);if(!bg||active===null)setActive(t.id);wc.loadURL(t.url);layout();pushTabs();return t;
}
function closeTab(id){
 const i=tabs.findIndex(x=>x.id===id);if(i<0)return;const t=tabs[i];closedTabs.push({pid:t.pid,kind:t.kind||'',url:t.kind?'':(t.view.webContents.isDestroyed()?t.url:(t.view.webContents.getURL()||t.url))});if(closedTabs.length>20)closedTabs.shift();tabs.splice(i,1);
 win.contentView.removeChildView(t.view);t.view.webContents.close();if(t.vpn)dropTunnel(t.pid);
 if(active===id)setActive(tabs.length?tabs[Math.max(0,i-1)].id:null);layout();pushTabs();
 if(!tabs.length&&windows.filter(x=>!x.dead).length>1)win.close();
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
 try{setChromiumDownloadDir(id,p)}catch(e){log('chromium download dir: '+e.message)}
 const args=[`--user-data-dir=${path.join(DATA(),'profiles',id)}`,`--fingerprint=${p.seed}`,'--no-first-run','--no-default-browser-check','--restore-last-session'];
 if(proxy)args.push(`--proxy-server=${proxy}`,'--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
 if(p.tz)args.push('--timezone='+p.tz);if(p.lang)args.push('--lang='+p.lang,'--accept-lang='+langsOf(p.lang));
 job.chrome=spawn(chrome,args);running.set(id,job);pushMgr();
 job.chrome.on('exit',()=>{cleanup(job);running.delete(id);pushMgr()});
}

// ---------- сохранение и восстановление вкладок ----------
const SESS=()=>path.join(DATA(),'session.json');
function saveSession(){
 if(restoring||quitting)return;
 const data={enhanced:[...running.keys()],windows:windows.filter(W=>!W.dead).map(W=>({mode:W.mode,active:W.tabs.findIndex(t=>t.id===W.active),
  bounds:(()=>{try{return W.win.getBounds()}catch{return null}})(),
  tabs:W.tabs.map(t=>({pid:t.pid,kind:t.kind||'',url:t.kind?'':(t.view.webContents.getURL()||t.url)}))}))};
 const w0=data.windows[0];if(w0){data.mode=w0.mode;data.active=w0.active;data.tabs=w0.tabs}   // совместимость со старым форматом
 try{fs.writeFileSync(SESS(),JSON.stringify(data))}catch{}
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(saveSession,500)}
async function restoreSession(){
 let s=null;
 try{
  try{s=JSON.parse(fs.readFileSync(SESS(),'utf8'))}catch(e){log('session read: '+e.message)}
  if(!cfg.restore)s=null;
  const wins=s&&Array.isArray(s.windows)&&s.windows.length?s.windows:(s&&Array.isArray(s.tabs)?[{mode:s.mode,active:s.active,tabs:s.tabs}]:[]);
  log('restore: '+wins.map(w=>w.tabs.length).join('+')+' tabs in '+wins.length+' windows, '+((s&&s.enhanced)||[]).length+' enhanced'+(cfg.restore?'':' (disabled)'));
  const ids=new Set(load().map(p=>p.id)),first=windows[0];
  for(let wi=0;wi<wins.length;wi++){
   const w=wins[wi],W=wi===0?first:createWindow({bounds:w.bounds});
   useW(W);if(w.mode==='side')setMode('side');
   let target=null;
   for(let i=0;i<(w.tabs||[]).length;i++){const x=w.tabs[i];let t=null;
    try{if(x.kind&&PAGES[x.kind])t=openPage(x.kind,true);else if(!x.kind&&ids.has(x.pid))t=await newTab(x.pid,x.url,true)}catch(e){log('restore tab: '+e.message)}
    useW(W);if(t&&i===w.active)target=t}
   const pick=target||tabs[0];if(pick)setActive(pick.id);
   layout();pushTabs();
  }
  useW(first);
  if(!first.tabs.length&&!ids.size)openPage('manager');
  layout();pushTabs();
 }catch(e){log('restore error: '+(e&&e.stack||e))}
 finally{restoring=false;saveSoon()}
 for(const id of (s&&s.enhanced)||[]){if(load().some(p=>p.id===id)){launch(id).catch(e=>log('restore enhanced: '+e.message));await new Promise(r=>setTimeout(r,800))}}
}

// ---------- обновления программы (с подтверждением и индикатором) ----------
const sendUpd=u=>{updating=u.state==='downloading'||u.state==='installing';for(const W of windows)if(!W.dead&&!W.win.webContents.isDestroyed())W.win.webContents.send('update',u)};
const allW=fn=>{for(const W of windows)if(!W.dead&&!W.win.isDestroyed())fn(W.win)};
function manualCheck(){
 if(!app.isPackaged)return appDialog({message:'Проверка обновлений работает только в установленной версии.'});
 manual=true;
 return autoUpdater.checkForUpdates().catch(()=>{manual=false;appDialog({type:'warning',message:'Не удалось проверить обновления',detail:'Проверь интернет. Репозиторий с релизами должен быть публичным.'})});
}
function setupUpdater(){
 if(!app.isPackaged)return;
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.on('update-available',async i=>{
  manual=false;log('update available '+i.version);
  const r=await appDialog({type:'question',buttons:['Скачать','Позже'],defaultId:0,cancelId:1,title:'Обновление',
   message:'Доступна новая версия '+i.version,detail:'Скачать сейчас? Установка начнётся после перезапуска, вкладки восстановятся.'});
  if(r.response===0){sendUpd({state:'downloading',percent:0});autoUpdater.downloadUpdate().catch(e=>{log('download error '+e);allW(w=>w.setProgressBar(-1));sendUpd({state:'idle'})})}
 });
 autoUpdater.on('download-progress',p=>{const pc=Math.round(p.percent||0);allW(w=>w.setProgressBar(pc/100));sendUpd({state:'downloading',percent:pc})});
 autoUpdater.on('update-downloaded',async()=>{
  allW(w=>w.setProgressBar(-1));sendUpd({state:'idle'});
  const r=await appDialog({type:'question',buttons:['Перезапустить и установить','Позже'],defaultId:0,cancelId:1,title:'Обновление',message:'Обновление скачано'});
  if(r.response===0){sendUpd({state:'installing'});allW(w=>w.setProgressBar(2));saveSession();quitting=true;log('quitAndInstall');
   setTimeout(()=>autoUpdater.quitAndInstall(false,true),1200)}
 });
 autoUpdater.on('update-not-available',()=>{if(manual){manual=false;appDialog({message:'Установлена последняя версия'})}});
 autoUpdater.on('error',e=>log('updater error: '+(e&&e.message)));
 const check=()=>{if(cfg.autoUpdate)autoUpdater.checkForUpdates().catch(()=>{})};
 setTimeout(check,8000);setInterval(check,6*3600*1000);
}

// ---------- загрузки ----------
const DLF=()=>path.join(DATA(),'downloads.json');
const downloadDirFor=p=>(p&&p.downloadDir)||cfg.downloadDir||app.getPath('downloads');
function loadDownloads(){try{downloads=JSON.parse(fs.readFileSync(DLF(),'utf8')).map(d=>d.state==='progressing'?{...d,state:'interrupted',paused:false}:d)}catch{downloads=[]}}
function saveDownloads(){try{fs.writeFileSync(DLF(),JSON.stringify(downloads.filter(d=>d.state!=='progressing').slice(0,100)))}catch{}}
function uniquePath(dir,name){name=path.basename(name)||'download';const ext=path.extname(name),base=path.basename(name,ext);let f=path.join(dir,name),n=1;
 while(fs.existsSync(f)||fs.existsSync(f+'.crdownload'))f=path.join(dir,`${base} (${n++})${ext}`);return f}
function dlList(){const all=load();return downloads.map(d=>({...d,live:live.has(d.id),profile:(all.find(p=>p.id===d.pid)||{name:'—'}).name,folder:path.dirname(d.path),exists:d.state==='completed'?fs.existsSync(d.path):true}))}
function pushDownloads(){
 const act=downloads.filter(d=>d.state==='progressing'),tot=act.reduce((a,d)=>a+Math.max(d.total,0),0),rec=act.reduce((a,d)=>a+d.received,0);
 const pct=tot>0?Math.min(100,Math.round(rec*100/tot)):0;
 for(const W of windows){if(W.dead||W.win.webContents.isDestroyed())continue;W.win.webContents.send('dl-summary',{active:act.length,percent:pct});
  if(!updating)W.win.setProgressBar(act.length?(tot>0?pct/100:2):-1)}
 if(panel&&panelOpen&&!panel.webContents.isDestroyed())panel.webContents.send('downloads',dlList());
 pushToast();
}
function hookDownloads(ses,pid){   // каждый профиль качает в свою папку (если задана), иначе в общую
 if(hooked.has(pid))return;hooked.add(pid);
 ses.on('will-download',(e,item,srcWc)=>{
  ownerCtx(srcWc);
  let dir=downloadDirFor(prof(pid));
  try{fs.mkdirSync(dir,{recursive:true})}catch(x){log('download dir '+dir+': '+x.message);dir=app.getPath('downloads')}
  const file=uniquePath(dir,item.getFilename());item.setSavePath(file);
  const d={id:crypto.randomUUID(),pid,name:path.basename(file),path:file,url:item.getURL(),total:item.getTotalBytes(),received:0,state:'progressing',paused:false,t:Date.now()};
  downloads.unshift(d);live.set(d.id,item);let last=0;
  if(cfg.dlToast){const pt=screen.getCursorScreenPoint(),b=win.getContentBounds();let st={x:pt.x-b.x,y:pt.y-b.y};
   if(st.x<0||st.y<0||st.x>b.width||st.y>b.height)st={x:b.width/2,y:b.height/2};flyDownload(st,()=>showToast(d.id))}
  item.on('updated',(ev,st)=>{d.received=item.getReceivedBytes();d.total=item.getTotalBytes();d.paused=item.isPaused();d.state=st==='interrupted'?'interrupted':'progressing';
   const n=Date.now();if(n-last>300){last=n;pushDownloads()}});
  item.once('done',(ev,st)=>{d.state=st;d.received=item.getReceivedBytes();live.delete(d.id);saveDownloads();pushDownloads();
   if(cfg.dlToast&&(st==='completed'||st==='interrupted'))showToast(d.id,4500);
   if(st==='completed'&&win&&!win.isDestroyed()&&!win.isFocused())win.flashFrame(true)});
  pushDownloads();
 });
}
function setChromiumDownloadDir(id,p){   // усиленный режим: папка загрузок записывается в настройки движка перед запуском
 const dir=downloadDirFor(p);fs.mkdirSync(dir,{recursive:true});
 const d=path.join(DATA(),'profiles',id,'Default');fs.mkdirSync(d,{recursive:true});
 const f=path.join(d,'Preferences');let j={};
 if(fs.existsSync(f)){try{j=JSON.parse(fs.readFileSync(f,'utf8'))}catch{return}}
 j.download=Object.assign(j.download||{},{default_directory:dir,prompt_for_download:false});
 j.savefile=Object.assign(j.savefile||{},{default_directory:dir});
 fs.writeFileSync(f,JSON.stringify(j));
}
const panelBounds=()=>{const b=win.getContentBounds(),y=topH();return{x:Math.max(b.width-392,0),y,width:380,height:Math.max(Math.min(460,b.height-y-10),120)}};
const raisePanel=()=>{if(!win||win.isDestroyed())return;if(panelOpen&&panel&&panel.__w===win)win.contentView.addChildView(panel);if(menuOpen&&menuV&&menuV.__w===win)win.contentView.addChildView(menuV);if(toastOpen&&toastV&&toastV.__w===win)win.contentView.addChildView(toastV)};
function showPanel(){
 hideMenu();hideToast();
 if(!panel){panel=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true});
  panel.webContents.loadFile('ui/downloads.html');
  panel.webContents.on('blur',()=>{if(panelOpen&&Date.now()-panelShownAt>200){hidePanel();lastBlurHide=Date.now()}});
  panel.webContents.on('before-input-event',(e,i)=>{if(i.type==='keyDown'&&i.key==='Escape'){hidePanel();e.preventDefault()}})}
 attach(panel);panel.setBounds(panelBounds());panel.setVisible(true);panelOpen=true;panelShownAt=Date.now();
 panel.webContents.focus();if(!panel.webContents.isLoading())panel.webContents.send('downloads',dlList());
}
function hidePanel(){if(panel)panel.setVisible(false);panelOpen=false}
function togglePanel(){if(panelOpen){hidePanel();return}if(Date.now()-lastBlurHide<250)return;showPanel()}

// ---------- закладки и история ----------
const BF=()=>path.join(DATA(),'bookmarks.json'),HF=()=>path.join(DATA(),'history.json'),uid=()=>Date.now().toString(36)+(uidN++).toString(36);
function loadBm(){try{bookmarks=JSON.parse(fs.readFileSync(BF(),'utf8'))}catch{bookmarks=[]}try{history=JSON.parse(fs.readFileSync(HF(),'utf8'))}catch{history=[]}}
const saveBm=()=>{try{fs.writeFileSync(BF(),JSON.stringify(bookmarks))}catch{}};
const saveHistNow=()=>{try{fs.writeFileSync(HF(),JSON.stringify(history))}catch{}};
const saveHistSoon=()=>{clearTimeout(histT);histT=setTimeout(saveHistNow,3000)};
function addHistory(pid,url){
 if(!cfg.keepHistory||!/^https?:/i.test(url))return null;
 const last=history[0];if(last&&last.pid===pid&&last.url===url&&Date.now()-last.t<5000)return last;
 const h={id:uid(),pid,url,title:'',t:Date.now()};history.unshift(h);if(history.length>5000)history.length=5000;saveHistSoon();return h;
}
function pushBm(){
 const st={list:bookmarks.map(b=>({id:b.id,title:b.title,url:b.url})),bar:!!cfg.bmBar};
 for(const W of windows){if(W.dead)continue;if(!W.win.webContents.isDestroyed())W.win.webContents.send('bm-state',st);
  for(const t of W.tabs)if(t.kind==='bookmarks'&&!t.view.webContents.isDestroyed())t.view.webContents.send('bm-changed')}
}
function bmToggle(){
 const w=pageWc(),t=cur();if(!w)return false;const url=w.getURL()||t.url;if(!/^(https?|file):/i.test(url))return false;
 const i=bookmarks.findIndex(b=>b.url===url);if(i>=0)bookmarks.splice(i,1);else bookmarks.push({id:uid(),title:t.title||url,url,t:Date.now()});
 saveBm();pushBm();pushTabs();return i<0;
}
function openUrl(url,pid,pick){
 if(!/^(https?|file):/i.test(url))return;const all=load();
 if(pid&&all.some(p=>p.id===pid)){newTab(pid,url);return}
 if(!all.length)return;
 if(pick||!lastPid||!all.some(p=>p.id===lastPid)){profileMenu(null,url);return}
 newTab(lastPid,url);
}
// ---------- выпадающие меню (свои, поверх страницы) ----------
const cursorAnchor=()=>{const pt=screen.getCursorScreenPoint(),b=win.getContentBounds();return{x:pt.x-b.x,y:pt.y-b.y,align:'left'}};
function menuBounds(w,h){const b=win.getContentBounds(),a=menuAnchor||{x:12,y:44,align:'left'};let x=a.align==='right'?a.x-w:a.x;x=Math.max(6,Math.min(x,b.width-w-6));
 return{x,y:a.y,width:w,height:Math.max(60,Math.min(h,b.height-a.y-10,460))}}
function showMenu(items,anchor,opts={}){
 hidePanel();hideToast();menuActs=new Map();
 const out=items.map((it,i)=>{const {fn,...r}=it;if(fn){r.id='a'+i;menuActs.set(r.id,fn)}return r});
 menuPayload={items:out,search:!!opts.search};menuAnchor=anchor||cursorAnchor();
 if(!menuV){menuV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});menuV.webContents.loadFile('ui/menu.html');
  menuV.webContents.on('blur',()=>{if(menuOpen&&Date.now()-menuShownAt>200){hideMenu();lastMenuBlur=Date.now()}});
  menuV.webContents.on('before-input-event',(e,i)=>{if(i.type==='keyDown'&&i.key==='Escape'){hideMenu();e.preventDefault()}})}
 attach(menuV);menuV.setBounds(menuBounds(270,120));menuV.setVisible(true);menuOpen=true;menuShownAt=Date.now();
 menuV.webContents.focus();if(!menuV.webContents.isLoading())menuV.webContents.send('menu',menuPayload);
}
function hideMenu(){if(menuV)menuV.setVisible(false);menuOpen=false}
function profileMenu(anchor,url){
 const l=load();
 if(!l.length){showMenu([{label:'Сначала создай профиль',disabled:true},{label:'Открыть «Профили»',fn:()=>openPage('manager')}],anchor);return}
 const mk=(p,fn,tag)=>({label:p.name,color:colorOf(p.id),letter:p.name[0].toUpperCase(),tag,fn});
 const items=[{type:'header',label:url?'Открыть в профиле':'Новая вкладка в профиле'}];
 for(const p of l)items.push(mk(p,()=>newTab(p.id,url)));
 if(!url){items.push({type:'sep'},{type:'header',label:'Усиленный режим (отдельное окно)'});
  for(const p of l)items.push(mk(p,()=>launch(p.id).catch(x=>appDialog({title:'MultiBrowser',type:'error',message:x.message})),'усил.'))}
 showMenu(items,anchor,{search:l.length>7});
}
function mainMenu(anchor){
 const t=cur();
 showMenu([
  {label:'Новая вкладка',hint:'Ctrl+T',fn:()=>{if(t&&!t.kind)newTab(t.pid);else profileMenu()}},
  {type:'sep'},
  {label:'Закладки',hint:'Ctrl+Shift+O',fn:()=>openPage('bookmarks')},
  {label:'История',hint:'Ctrl+H',fn:()=>openPage('history')},
  {label:'Загрузки',hint:'Ctrl+J',fn:()=>togglePanel()},
  {type:'sep'},
  {label:'Скрипты',fn:()=>openPage('scripts')},
  {label:'Профили',fn:()=>openPage('manager')},
  {label:'Настройки',fn:()=>openPage('settings')},
  {type:'sep'},
  {label:'Панель закладок',hint:'Ctrl+Shift+B',checked:!!cfg.bmBar,fn:()=>{cfg.bmBar=!cfg.bmBar;saveCfg();layout();pushBm()}},
  {label:mode==='top'?'Вид: боковая панель':'Вид: вкладки сверху',fn:()=>{setMode(mode==='top'?'side':'top');layout();pushTabs()}}
 ],anchor);
}

// ---------- горячие клавиши ----------
const cur=()=>tabs.find(x=>x.id===active),pageWc=()=>{const t=cur();return t&&!t.kind?t.view.webContents:null};
function goTab(t){if(t){setActive(t.id);layout();pushTabs()}}
function cycle(d){if(tabs.length<2)return;const i=tabs.findIndex(x=>x.id===active);goTab(tabs[(i+d+tabs.length)%tabs.length])}
function zoom(d){const w=pageWc();if(w)w.setZoomLevel(d===0?0:Math.max(-3,Math.min(5,w.getZoomLevel()+d*0.5)))}
function reopenTab(){const c=closedTabs.pop();if(!c)return;if(c.kind&&PAGES[c.kind])openPage(c.kind);else newTab(c.pid,c.url)}
function hotkey(i,wc){
 if(i.type!=='keyDown'||(i.control&&i.alt))return false;
 const c=i.control||i.meta,sh=i.shift,al=i.alt,k=i.key,cd=i.code||'';
 const L=/^Key[A-Z]$/.test(cd)?cd.slice(3).toLowerCase():'';   // физическая клавиша: не зависит от раскладки
 const dg=(/^(?:Digit|Numpad)([0-9])$/.exec(cd)||[])[1],plus=cd==='Equal'||cd==='NumpadAdd',minus=cd==='Minus'||cd==='NumpadSubtract';
 const t=cur(),w=pageWc();
 if(k==='F12'||(c&&sh&&L==='i')){(w||wc).toggleDevTools();return true}
 if(k==='F11'){win.setFullScreen(!win.isFullScreen());return true}
 if(k==='F5'||(c&&L==='r')){if(w){if(c&&(sh||k==='F5'))w.reloadIgnoringCache();else w.reload()}return true}
 if(c&&L==='t'){if(sh)reopenTab();else if(t&&!t.kind)newTab(t.pid);else profileMenu();return true}
 if(c&&!sh&&(L==='w'||k==='F4')){if(t)closeTab(t.id);return true}
 if(c&&k==='Tab'){cycle(sh?-1:1);return true}
 if(c&&k==='PageDown'){cycle(1);return true}
 if(c&&k==='PageUp'){cycle(-1);return true}
 if(c&&dg&&dg!=='0'){goTab(dg==='9'?tabs[tabs.length-1]:tabs[+dg-1]);return true}
 if((c&&L==='l')||k==='F6'||(al&&L==='d')){win.webContents.focus();win.webContents.send('focus-addr');return true}
 if(al&&k==='ArrowLeft'){if(w&&w.navigationHistory.canGoBack())w.navigationHistory.goBack();return true}
 if(al&&k==='ArrowRight'){if(w&&w.navigationHistory.canGoForward())w.navigationHistory.goForward();return true}
 if(al&&k==='Home'){if(w)w.loadURL(homeUrl());return true}
 if(c&&!sh&&L==='f'&&w){win.webContents.focus();win.webContents.send('show-find');return true}
 if(c&&!sh&&L==='p'&&w){w.print();return true}
 if(c&&L==='j'){togglePanel();return true}
 if(c&&plus){zoom(1);return true}
 if(c&&minus){zoom(-1);return true}
 if(c&&dg==='0'){zoom(0);return true}
 if(c&&!sh&&!al&&L==='d'){bmToggle();return true}
 if(c&&sh&&L==='o'){openPage('bookmarks');return true}
 if(c&&!sh&&L==='h'){openPage('history');return true}
 if(c&&sh&&L==='b'){cfg.bmBar=!cfg.bmBar;saveCfg();layout();pushBm();return true}
 return false;
}

// ---------- проверка подключения и язык/часовой пояс по IP ----------
const LANG={US:'en-US',GB:'en-GB',DE:'de-DE',FR:'fr-FR',ES:'es-ES',IT:'it-IT',NL:'nl-NL',PL:'pl-PL',PT:'pt-PT',BR:'pt-BR',RU:'ru-RU',UA:'uk-UA',BY:'ru-BY',KZ:'ru-KZ',TR:'tr-TR',JP:'ja-JP',KR:'ko-KR',CN:'zh-CN',IN:'en-IN',CA:'en-CA',AU:'en-AU',SE:'sv-SE',NO:'nb-NO',FI:'fi-FI',DK:'da-DK',CZ:'cs-CZ',RO:'ro-RO',BG:'bg-BG',GR:'el-GR',HU:'hu-HU',AT:'de-AT',CH:'de-CH',BE:'nl-BE',IE:'en-IE',IL:'he-IL',AE:'ar-AE',SG:'en-SG',HK:'zh-HK',MX:'es-MX',AR:'es-AR',LT:'lt-LT',LV:'lv-LV',EE:'et-EE',MD:'ro-MD',GE:'ka-GE',AM:'hy-AM',AZ:'az-AZ'};
async function checkConn(id){
 const p=prof(id);if(!p)return{error:'Профиль не найден'};
 const ses=session.fromPartition('persist:p-'+id);let held=false;
 try{
  if(needsTunnel(p)){const u=await tunnelFor(p);held=true;await ses.setProxy({proxyRules:u})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
  const t0=Date.now(),r=await ses.fetch('https://ipinfo.io/json',{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('сервис проверки ответил '+r.status);
  const j=await r.json();
  return{ip:j.ip,country:j.country,city:j.city,org:j.org,tz:j.timezone,lang:LANG[j.country]||'en-US',ms:Date.now()-t0};
 }catch(e){log('check: '+e.message);return{error:e.message}}
 finally{if(held)dropTunnel(id)}
}

// ---------- всплывающее окно загрузки и анимация «полёта» ----------
function toastItem(){const d=downloads.find(x=>x.id===toastId);if(!d)return null;const all=load();
 return{...d,profile:(all.find(p=>p.id===d.pid)||{name:'—'}).name,folder:path.dirname(d.path),exists:d.state!=='completed'||fs.existsSync(d.path)}}
function toastBounds(){const b=win.getContentBounds(),r=(curW&&curW.dlRect)||{right:b.width-130,bottom:topH()-40},w=340,h=108;
 return{x:Math.round(Math.min(Math.max(r.right-w,6),b.width-w-6)),y:Math.round(r.bottom+8),width:w,height:h}}
function pushToast(){if(toastOpen&&toastV&&!toastV.webContents.isDestroyed())toastV.webContents.send('toast',toastItem())}
function hideToast(){if(toastV)toastV.setVisible(false);toastOpen=false;clearTimeout(toastT)}
function showToast(id,ms){
 if(panelOpen||menuOpen||!win||win.isDestroyed())return;toastId=id;
 if(!toastV){toastV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});toastV.webContents.loadFile('ui/toast.html')}
 attach(toastV);toastV.setBounds(toastBounds());toastV.setVisible(true);toastOpen=true;pushToast();
 clearTimeout(toastT);toastT=setTimeout(()=>{if(!toastHover)hideToast()},ms||5000);
}
function flyDownload(start,done){   // маленький значок летит от места клика к кнопке загрузок
 try{
  const b=win.getContentBounds(),R=curW&&curW.dlRect,end=R?{x:(R.left+R.right)/2,y:(R.top+R.bottom)/2}:{x:b.width-170,y:60};
  if(!flyV){flyV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});flyV.setBackgroundColor('#4c8dff');flyV.webContents.loadFile('ui/fly.html')}
  attach(flyV);flyV.setVisible(true);
  const t0=Date.now(),D=440,c={x:start.x+(end.x-start.x)*0.15,y:Math.min(start.y,end.y)-90};
  const id=setInterval(()=>{
   if(!win||win.isDestroyed()){clearInterval(id);return}
   const k=Math.min((Date.now()-t0)/D,1),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,u=1-e;
   const x=u*u*start.x+2*u*e*c.x+e*e*end.x,y=u*u*start.y+2*u*e*c.y+e*e*end.y,sz=Math.round(40-22*e);
   flyV.setBounds({x:Math.round(x-sz/2),y:Math.round(y-sz/2),width:sz,height:sz});
   if(k>=1){clearInterval(id);flyV.setVisible(false);if(!win.webContents.isDestroyed())win.webContents.send('dl-hit');done()}
  },16);
 }catch(e){log('fly: '+e.message);done()}
}

// ---------- скрипты: автонажатие кнопок и свои скрипты ----------
const SCF=()=>path.join(DATA(),'scripts.json');
const loadScripts=()=>{try{scripts=JSON.parse(fs.readFileSync(SCF(),'utf8'))}catch{scripts=[]}};
const saveScripts=()=>{try{fs.writeFileSync(SCF(),JSON.stringify(scripts,null,1))}catch{}};
let preludeSrc=null;
const prelude=()=>preludeSrc||(preludeSrc=fs.readFileSync(path.join(__dirname,'ui','mb-prelude.js'),'utf8'));
function urlMatch(pat,url){
 pat=(pat||'').trim();if(!pat||pat==='*'||pat==='<all_urls>')return true;
 const esc=x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&');let r;
 if(pat.includes('://'))r='^'+esc(pat).replace(/\*/g,'.*')+'$';
 else r='^https?://'+esc(pat).replace(/^\*\\\./,'(?:.*\\.)?').replace(/\*/g,'.*')+'(?::\\d+)?(?:/.*)?$';
 try{return new RegExp(r).test(url)}catch{return false}
}
function runScripts(wc,pid,stage){
 if(wc.isDestroyed())return;const p=prof(pid);if(!p)return;const url=wc.getURL();if(!/^https?:/i.test(url))return;
 const run=code=>wc.executeJavaScript(code).catch(e=>log('script error: '+(e&&e.message)));
 if(stage==='dom-ready'&&p.autoclick&&p.autoclick.on&&p.autoclick.rules){
  const rules=[];
  for(const line of p.autoclick.rules.split(/\r?\n/)){const l=line.trim();if(!l||l[0]==='#')continue;
   const parts=l.split('|').map(x=>x.trim()),site=parts.length>1?parts[0]:'*',target=parts.length>1?parts[1]:parts[0],delay=parseInt(parts[2])||300;
   if(target&&urlMatch(site,url))rules.push({target,delay})}
  if(rules.length)run(prelude()+';MB.autoclick('+JSON.stringify(rules)+');');
 }
 for(const id of p.scripts||[]){const sc=scripts.find(x=>x.id===id);if(!sc||(sc.runAt||'dom-ready')!==stage)continue;
  if(!(sc.match&&sc.match.length?sc.match:['*']).some(m=>urlMatch(m,url)))continue;
  run(prelude()+';(async()=>{try{\n'+sc.code+'\n}catch(e){console.error("[MB скрипт]",e)}})();')}
}

// ---------- свои тёмные диалоги вместо системных белых окон ----------
let dlgN=0;const dlgs=new Map();
function appDialog(o){
 return new Promise(res=>{
  const parent=(windows.find(x=>!x.dead)||{}).win,id=++dlgN;
  const w=new BrowserWindow({parent:parent||undefined,modal:!!parent,width:450,height:200,frame:false,resizable:false,minimizable:false,maximizable:false,show:false,skipTaskbar:true,
   backgroundColor:bgColor(),icon:ICON,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
  dlgs.set(id,{w,res});
  w.loadFile('ui/dialog.html',{query:{id:String(id),p:JSON.stringify({title:o.title||'MultiBrowser',message:String(o.message||''),detail:String(o.detail||''),buttons:o.buttons||['OK'],type:o.type||'info',defaultId:o.defaultId||0,cancelId:o.cancelId})}});
  w.once('ready-to-show',()=>w.show());
  w.on('closed',()=>{const d=dlgs.get(id);if(d){dlgs.delete(id);res({response:o.cancelId!=null?o.cancelId:(o.buttons?o.buttons.length-1:0)})}});
 });
}

// ---------- блокировщик рекламы и трекеров (по списку доменов) ----------
let adSet=new Set(),adCount=0,adUpdated=0,adT=null;const adHooked=new Set(),adPend=new Set(),ADF=()=>path.join(DATA(),'adblock.txt');
function parseHosts(txt){const set=new Set();for(const l of String(txt).split(/\r?\n/)){const s=l.trim();if(!s||s[0]==='#')continue;
 const m=s.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([^\s#]+)/);if(m){const h=m[1].toLowerCase();if(h!=='localhost'&&h.includes('.'))set.add(h)}}return set}
function loadAds(){let txt='';try{txt=fs.readFileSync(ADF(),'utf8');adUpdated=fs.statSync(ADF()).mtimeMs}catch{}
 try{txt+='\n'+fs.readFileSync(path.join(__dirname,'ui','adhosts.txt'),'utf8')}catch{}
 adSet=parseHosts(txt);log('adblock: '+adSet.size+' domains')}
async function updateAds(force){
 if(!force&&Date.now()-adUpdated<6*864e5)return false;
 const urls=['https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts','https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext'];
 let all='';for(const u of urls){try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(r.ok)all+='\n'+await r.text()}catch(e){log('adblock update: '+e.message)}}
 if(all.length<1000)return false;fs.writeFileSync(ADF(),all);adUpdated=Date.now();loadAds();return true}
const isAd=h=>{for(let x=h;x&&x.includes('.');x=x.slice(x.indexOf('.')+1))if(adSet.has(x))return true;return false};
function adblockSession(ses,pid){
 if(adHooked.has(pid))return;adHooked.add(pid);
 ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>{
  if(!cfg.adblock||d.resourceType==='mainFrame'){cb({});return}
  let h='';try{h=new URL(d.url).hostname.toLowerCase()}catch{cb({});return}
  if(!isAd(h)){cb({});return}
  adCount++;
  for(const W of windows){const t=W.tabs.find(x=>!x.kind&&x.view.webContents.id===d.webContentsId);
   if(t){t.blocked=(t.blocked||0)+1;adPend.add(W);clearTimeout(adT);
    adT=setTimeout(()=>{const c=curW;for(const W2 of adPend){if(useW(W2))pushTabs()}adPend.clear();if(c&&!c.dead)useW(c)},500);break}}
  cb({cancel:true});
 });
}

// ---------- вкладки: перенос между окнами ----------
function detachTab(id,x,y){
 const i=tabs.findIndex(t=>t.id===id);if(i<0||tabs.length<2)return;
 const t=tabs[i],src=curW;tabs.splice(i,1);
 try{win.contentView.removeChildView(t.view)}catch{}
 if(active===id)setActive(tabs[Math.max(0,i-1)].id);
 layout();pushTabs();
 const W2=createWindow({bounds:{x:Math.round(x-220),y:Math.round(y-18),width:1100,height:760}});
 W2.mode=src.mode;t.W=W2;W2.tabs.push(t);W2.active=t.id;useW(W2);
 W2.win.contentView.addChildView(t.view);layout();pushTabs();
}

// ---------- IPC ----------
H('list',()=>({profiles:view(),running:[...running.keys()]}));
H('pickConf',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'VPN-конфиг',extensions:['conf']}],properties:['openFile']});
 return r.canceled?null:{name:path.basename(r.filePaths[0]),text:fs.readFileSync(r.filePaths[0],'utf8')}});
H('add',(e,d)=>{const l=load(),p={id:crypto.randomUUID(),name:d.name||'Профиль',seed:crypto.randomInt(1,2147483647)};let note='';
 if(d.mode==='vpn'&&d.confText){try{if(parseWg(d.confText).converted){p.vpnNote='awg';note='Конфиг AmneziaWG автоматически преобразован в обычный WireGuard: параметры маскировки отброшены. Если сервер без них не работает, подключение не поднимется.'}}catch(x){return{error:x.message}}p.vpn=enc(d.confText)}
 else if(d.mode==='proxy'&&d.host){p.proxy={type:d.type,host:d.host,port:d.port};if(d.user){p.proxy.user=d.user;p.proxy.pass=enc(d.pass||'')}}
 l.push(p);save(l);pushTabs();pushMgr();return{ok:true,note}});
H('launch',async(e,id)=>{try{await launch(id);return null}catch(x){return x.message}});
H('stop',(e,id)=>{const j=running.get(id);if(j)kill(j.chrome)});
H('remove',(e,id)=>{const ctx=curW;for(const W of [...windows]){if(W.dead)continue;useW(W);for(const t of tabs.filter(x=>x.pid===id))closeTab(t.id)}if(ctx&&!ctx.dead)useW(ctx);history=history.filter(h=>h.pid!==id);saveHistSoon();
 const j=running.get(id);if(j){kill(j.chrome);cleanup(j);running.delete(id)}save(load().filter(p=>p.id!==id))});
H('openInShell',(e,id)=>newTab(id));
H('newTab',(e,id)=>newTab(id));
H('newTabMenu',(e,a)=>{if(Date.now()-lastMenuBlur<250)return;profileMenu(a)});
H('activate',(e,id)=>{setActive(id);layout();pushTabs()});
H('closeTab',(e,id)=>closeTab(id));
H('navigate',(e,s)=>{const t=tabs.find(x=>x.id===active);if(t&&!t.kind)t.view.webContents.loadURL(norm(s))});
H('nav',(e,a)=>{const t=tabs.find(x=>x.id===active);if(!t||t.kind)return;const h=t.view.webContents.navigationHistory;
 if(a==='back')h.goBack();else if(a==='forward')h.goForward();else t.view.webContents.reload()});
H('setMode',(e,m)=>{setMode(m==='side'?'side':'top');layout();pushTabs()});
function openPage(kind,bg){   // внутренние страницы («Профили», «Настройки») открываются как вкладки
 const def=PAGES[kind],ex=tabs.find(x=>x.kind===kind);if(ex){if(!bg){setActive(ex.id);layout();pushTabs()}return ex}
 const v=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true});
 const t={id:nextId++,pid:def.pid,kind,view:v,title:def.title,url:'',ready:false,W:curW};tabs.push(t);
 const rdy=()=>{if(!t.ready&&useW(t.W)){t.ready=true;layout();pushTabs()}};
 v.webContents.once('did-finish-load',rdy);setTimeout(rdy,2500);
 v.webContents.on('before-input-event',(e,i)=>{if(useW(t.W)&&hotkey(i,v.webContents))e.preventDefault()});
 win.contentView.addChildView(v);if(!bg||active===null)setActive(t.id);v.webContents.loadFile(def.file);layout();pushTabs();return t;
}
const openManager=bg=>openPage('manager',bg);
H('openManager',()=>{openManager()});
H('openSettings',()=>{openPage('settings')});
H('getSettings',()=>({...cfg,version:app.getVersion(),dlDefault:app.getPath('downloads')}));
H('setSettings',(e,p)=>{for(const k of Object.keys(DEF))if(k in p)cfg[k]=p[k];saveCfg();applyTheme();layout();pushBm();return true});
H('checkUpdates',()=>manualCheck());
H('toggleDownloads',()=>togglePanel());
H('dlList',()=>dlList());
H('dlAction',(e,{id,action})=>{
 if(action==='clear'){downloads=downloads.filter(d=>d.state==='progressing');saveDownloads();pushDownloads();return}
 const d=downloads.find(x=>x.id===id);if(!d)return;const it=live.get(id);
 if(action==='open')shell.openPath(d.path);else if(action==='show')shell.showItemInFolder(d.path);
 else if(action==='pause'&&it)it.pause();else if(action==='resume'&&it&&it.canResume())it.resume();
 else if(action==='cancel'&&it)it.cancel();
 else if(action==='remove'&&d.state!=='progressing'){downloads=downloads.filter(x=>x.id!==id);saveDownloads()}
 pushDownloads()});
H('find',(e,d)=>{const w=pageWc();if(w&&d.text)w.findInPage(d.text,{forward:d.forward!==false,findNext:!!d.next})});
H('stopFind',()=>{const w=pageWc();if(w)w.stopFindInPage('clearSelection')});
H('pickFolder',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0]});
H('getProfile',(e,id)=>{const p=prof(id);if(!p)return null;const x=p.proxy;
 return{id:p.id,name:p.name,downloadDir:p.downloadDir||'',effective:downloadDirFor(p),autoclick:p.autoclick||{on:false,rules:''},scripts:p.scripts||[],
  conn:{mode:p.vpn?'vpn':x?'proxy':'none',type:x?x.type:'socks5',host:x?x.host:'',port:x?x.port:'',user:(x&&x.user)||'',hasPass:!!(x&&x.pass),hasVpn:!!p.vpn,vpnNote:!!p.vpnNote}}});
H('updateProfile',(e,d)=>{const l=load(),p=l.find(x=>x.id===d.id);if(!p)return{error:'Профиль не найден'};
 if(d.name&&d.name.trim())p.name=d.name.trim();if(d.downloadDir)p.downloadDir=d.downloadDir;else delete p.downloadDir;
 if(d.autoclick)p.autoclick={on:!!d.autoclick.on,rules:String(d.autoclick.rules||'').slice(0,4000)};
 if(Array.isArray(d.scripts))p.scripts=d.scripts.filter(x=>scripts.some(s=>s.id===x));
 let note='';const c=d.conn;
 if(c){
  if(c.mode==='none'){delete p.proxy;delete p.vpn;delete p.vpnNote}
  else if(c.mode==='proxy'){
   if(!c.host||!String(c.host).trim())return{error:'Укажи адрес прокси'};
   const old=p.proxy||{};p.proxy={type:c.type==='http'?'http':'socks5',host:String(c.host).trim(),port:String(c.port||'').trim()};
   if(c.user){p.proxy.user=c.user;if(c.pass)p.proxy.pass=enc(c.pass);else if(old.pass)p.proxy.pass=old.pass}
   delete p.vpn;delete p.vpnNote}
  else if(c.mode==='vpn'){
   if(c.confText){try{const w=parseWg(c.confText);p.vpn=enc(c.confText);if(w.converted){p.vpnNote='awg';note='Конфиг AmneziaWG автоматически преобразован в обычный WireGuard.'}else delete p.vpnNote}catch(x){return{error:x.message}}}
   else if(!p.vpn)return{error:'Выбери файл VPN-конфига (.conf)'};
   delete p.proxy}
 }
 save(l);pushTabs();pushMgr();return{ok:true,note}});
H('bmToggle',()=>bmToggle());
H('bmList',()=>bookmarks);
H('bmRemove',(e,id)=>{bookmarks=bookmarks.filter(b=>b.id!==id);saveBm();pushBm();pushTabs()});
H('bmRename',(e,{id,title})=>{const b=bookmarks.find(x=>x.id===id);if(b&&title&&title.trim()){b.title=title.trim();saveBm();pushBm()}});
H('openUrl',(e,d)=>openUrl(d.url,d.pid,d.pick));
H('bmOpenBar',(e,{url,newTab:nt})=>{const t=cur();if(!nt&&t&&!t.kind&&/^(https?|file):/i.test(url))t.view.webContents.loadURL(url);else openUrl(url)});
H('histList',(e,{q})=>{const all=load(),nm=id=>(all.find(p=>p.id===id)||{name:'(удалён)'}).name,s=(q||'').toLowerCase();
 return history.filter(h=>!s||(h.title+' '+h.url).toLowerCase().includes(s)).slice(0,500).map(h=>({...h,profile:nm(h.pid)}))});
H('histRemove',(e,id)=>{history=history.filter(h=>h.id!==id);saveHistNow()});
H('histClear',()=>{history=[];saveHistNow()});
H('showMenu',(e,a)=>{if(Date.now()-lastMenuBlur<250)return;mainMenu(a)});
H('menuGet',()=>menuPayload);
H('menuResize',(e,h)=>{if(menuOpen&&menuV)menuV.setBounds(menuBounds(270,h))});
H('menuPick',(e,id)=>{const f=menuActs.get(id);hideMenu();if(f)setTimeout(f,0)});
H('checkConn',(e,id)=>checkConn(id));
H('applyGeo',(e,{id,tz,lang})=>{const l=load(),p=l.find(x=>x.id===id);if(!p)return false;if(tz)p.tz=tz;else delete p.tz;if(lang)p.lang=lang;else delete p.lang;save(l);pushMgr();return true});
H('toastGet',()=>toastItem());
H('toastHover',(e,h)=>{toastHover=!!h;if(!h){clearTimeout(toastT);toastT=setTimeout(hideToast,1800)}});
H('dlAnchor',(e,r)=>{if(curW)curW.dlRect=r});
H('toastAction',(e,{action,id})=>{
 if(action==='panel'){hideToast();showPanel();return}
 if(action==='close'){hideToast();return}
 const d=downloads.find(x=>x.id===id);if(!d)return;const it=live.get(id);
 if(action==='open')shell.openPath(d.path);else if(action==='show')shell.showItemInFolder(d.path);else if(action==='cancel'&&it)it.cancel();
 if(action!=='cancel')hideToast()});
H('scList',()=>scripts);
H('scSave',(e,sc)=>{if(!sc||!(sc.name||'').trim())return null;let x=scripts.find(s=>s.id===sc.id);if(!x){x={id:uid()};scripts.push(x)}
 x.name=sc.name.trim().slice(0,80);x.code=String(sc.code||'').slice(0,200000);
 x.match=(Array.isArray(sc.match)?sc.match:String(sc.match||'').split(/\r?\n/)).map(m=>m.trim()).filter(Boolean);x.runAt=sc.runAt==='load'?'load':'dom-ready';saveScripts();return x.id});
H('scDelete',(e,id)=>{scripts=scripts.filter(s=>s.id!==id);saveScripts();const l=load();let ch=false;
 for(const p of l)if(p.scripts&&p.scripts.includes(id)){p.scripts=p.scripts.filter(x=>x!==id);ch=true}if(ch)save(l)});
H('openScripts',()=>{openPage('scripts')});
H('importProfiles',(e,text)=>{const l=load(),bad=[];let n=0;
 for(const raw of String(text).split(/\r?\n/)){const line=raw.trim();if(!line||line[0]==='#')continue;
  let nm='',px='';if(line.includes('|')){const i=line.indexOf('|');nm=line.slice(0,i).trim();px=line.slice(i+1).trim()}else if(line.includes(':'))px=line;else nm=line;
  const p={id:crypto.randomUUID(),name:nm||('Профиль '+(l.length+1)),seed:crypto.randomInt(1,2147483647)};
  if(px){try{const u=new URL(px.includes('://')?px:'socks5://'+px),t=u.protocol.replace(':','');
    if(!['http','https','socks5','socks'].includes(t)||!u.hostname)throw new Error('bad');
    p.proxy={type:t.startsWith('http')?'http':'socks5',host:u.hostname,port:u.port||(t.startsWith('http')?'80':'1080')};
    if(u.username){p.proxy.user=decodeURIComponent(u.username);p.proxy.pass=enc(decodeURIComponent(u.password||''))}}
   catch{bad.push(line);continue}}
  l.push(p);n++}
 save(l);pushMgr();pushTabs();return{n,bad}});
H('moveTab',(e,{id,to})=>{const i=tabs.findIndex(x=>x.id===id);if(i<0)return;const [t]=tabs.splice(i,1);tabs.splice(Math.max(0,Math.min(to,tabs.length)),0,t);pushTabs()});
H('detachTab',(e,{id,x,y})=>detachTab(id,x,y));
H('tabMenu',(e,{id,anchor})=>{
 const t=tabs.find(x=>x.id===id);if(!t)return;const i=tabs.indexOf(t),items=[];
 if(!t.kind)items.push({label:'Обновить',fn:()=>t.view.webContents.reload()},{label:'Дублировать',fn:()=>newTab(t.pid,t.view.webContents.getURL()||t.url)});
 if(tabs.length>1)items.push({label:'Открыть в новом окне',fn:()=>{const pt=screen.getCursorScreenPoint();detachTab(id,pt.x,pt.y)}});
 items.push({type:'sep'},{label:'Закрыть',hint:'Ctrl+W',fn:()=>closeTab(id)});
 if(tabs.length>1)items.push({label:'Закрыть остальные',fn:()=>{for(const x of tabs.filter(y=>y.id!==id))closeTab(x.id)}});
 if(i<tabs.length-1)items.push({label:'Закрыть вкладки справа',fn:()=>{for(const x of tabs.slice(i+1))closeTab(x.id)}});
 showMenu(items,anchor||cursorAnchor())});
H('dlgResult',(e,{id,i})=>{const d=dlgs.get(id);if(d){dlgs.delete(id);d.res({response:i});if(!d.w.isDestroyed())d.w.close()}});
H('dlgResize',(e,{id,h})=>{const d=dlgs.get(id);if(!d||d.w.isDestroyed())return;d.w.setContentSize(450,Math.max(150,Math.min(h,520)));
 const P=windows.find(x=>!x.dead);if(P){const b=P.win.getBounds();d.w.setPosition(Math.round(b.x+(b.width-450)/2),Math.round(b.y+(b.height-h)/3))}});
H('uiConfirm',(e,m)=>appDialog({message:String(m),buttons:['Да','Отмена'],defaultId:0,cancelId:1,type:'question'}).then(r=>r.response===0));
H('uiAlert',(e,m)=>appDialog({message:String(m)}).then(()=>true));
H('adToggle',()=>{cfg.adblock=!cfg.adblock;saveCfg();pushTabs();return cfg.adblock});
H('adInfo',()=>({domains:adSet.size,count:adCount,updated:adUpdated}));
H('adUpdate',async()=>{const ok=await updateAds(true);return{ok,domains:adSet.size,updated:adUpdated}});
H('showLog',()=>{shell.showItemInFolder(LOG())});
const ovl=()=>{const d=nativeTheme.shouldUseDarkColors;return{color:d?'#181c25':'#f3f4f7',symbolColor:d?'#e6e9f0':'#1b1f2a',height:40}};
function createWindow(o={}){
 const W={win:null,tabs:[],active:null,mode:'top',dead:false,dlRect:null,first:!!o.first},b=o.bounds;
 const w=new BrowserWindow({width:(b&&b.width)||1280,height:(b&&b.height)||800,...(b&&Number.isFinite(b.x)&&Number.isFinite(b.y)?{x:b.x,y:b.y}:{}),
  title:'MultiBrowser',icon:ICON,backgroundColor:bgColor(),show:false,titleBarStyle:'hidden',titleBarOverlay:ovl(),
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false}});
 W.win=w;windows.push(W);w.loadFile('ui/shell.html');
 const c=fn=>(...a)=>{if(useW(W))fn(...a)};
 w.once('ready-to-show',c(()=>{w.setOpacity(0);w.show();fadeTo(1,240)}));   // плавное появление
 setTimeout(()=>{if(!w.isDestroyed()&&!w.isVisible()){w.show();w.setOpacity(1)}},4000);
 w.on('minimize',()=>{try{w.setOpacity(0)}catch{}});                         // скрываем кадр перерисовки при разворачивании
 w.on('restore',()=>setTimeout(c(()=>fadeTo(1,170)),100));
 w.on('show',c(()=>{if(w.getOpacity()<1&&!fading)fadeTo(1,170)}));
 w.on('resize',c(()=>{hideMenu();hideToast()}));
 w.webContents.on('before-input-event',(e,i)=>{if(useW(W)&&hotkey(i,w.webContents))e.preventDefault()});
 w.webContents.on('did-finish-load',c(()=>{layout();pushTabs();pushBm();if(W.first&&!started){started=true;restoreSession()}}));
 for(const ev of ['resize','maximize','unmaximize','enter-full-screen','leave-full-screen'])w.on(ev,c(layout));
 w.on('close',()=>{if(!windows.some(x=>!x.dead&&x!==W)&&useW(W)){saveSession();quitting=true}});
 w.on('closed',()=>{W.dead=true;const i=windows.indexOf(W);if(i>=0)windows.splice(i,1);
  if(!windows.length)app.quit();else{if(curW===W)useW(windows[windows.length-1]);if(!quitting)saveSoon()}});
 useW(W);return W;
}
app.whenReady().then(()=>{
 loadCfg();applyTheme();loadDownloads();loadBm();loadScripts();loadAds();
 try{if(fs.statSync(LOG()).size>200000)fs.rmSync(LOG())}catch{}
 log('start v'+app.getVersion());
 Menu.setApplicationMenu(null);
 createWindow({first:true});
 setupUpdater();
 setTimeout(()=>updateAds(false).catch(()=>{}),15000);setInterval(()=>updateAds(false).catch(()=>{}),12*3600*1000);
 nativeTheme.on('updated',()=>{for(const W of windows){if(W.dead)continue;try{W.win.setTitleBarOverlay(ovl());W.win.setBackgroundColor(bgColor());for(const t of W.tabs)if(t.kind)t.view.setBackgroundColor(bgColor())}catch{}}
  try{if(panel)panel.setBackgroundColor(bgColor());if(menuV)menuV.setBackgroundColor(bgColor())}catch{}});
});
app.on('before-quit',()=>{saveHistNow();for(const j of running.values()){kill(j.chrome);cleanup(j)}for(const t of tunnels.values())cleanup(t)});
