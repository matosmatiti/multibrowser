// MultiBrowser: своя оболочка (вкладки разных аккаунтов в одном окне) + усиленный режим (движок fingerprint-chromium отдельным окном)
const {app,BaseWindow,WebContentsView,BrowserWindow,Menu,session,ipcMain,safeStorage,dialog,nativeTheme,shell,screen,clipboard,webContents,Notification,nativeImage}=require('electron');
const path=require('path'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn,spawnSync}=require('child_process');
const {autoUpdater}=require('electron-updater');
const {pathToFileURL}=require('url');
const RES=app.isPackaged?process.resourcesPath:path.join(__dirname,'resources');
const DATA=()=>app.getPath('userData'), FILE=()=>path.join(DATA(),'profiles.json');
const SETF=()=>path.join(app.getPath('userData'),'settings.json');
try{let sd='force';try{sd=JSON.parse(fs.readFileSync(SETF(),'utf8')).siteDark||'force'}catch{}if(sd==='force')app.commandLine.appendSwitch('enable-features','WebContentsForceDark')}catch{}   // сайты по умолчанию в тёмной теме
try{app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');['disable-renderer-backgrounding','disable-background-timer-throttling','disable-backgrounding-occluded-windows'].forEach(x=>app.commandLine.appendSwitch(x))}catch{}   // страницы не уходят в экономный режим
const DEF={search:'google',home:'google',customHome:'',theme:'dark',siteDark:'force',adblock:true,restore:true,autoUpdate:true,downloadDir:'',bmBar:false,keepHistory:true,dlToast:true,translateTo:'ru',openBg:true,uaVersion:'',apiOn:false,apiPort:35777,autoBackup:false,autoBackupDir:'',autoBackupDays:7,taskbarBadge:true,ver:2};
const ENG={google:'https://www.google.com/search?q=',duckduckgo:'https://duckduckgo.com/?q=',bing:'https://www.bing.com/search?q='};
let cfg={...DEF},manual=false;
const loadCfg=()=>{try{cfg={...DEF,...JSON.parse(fs.readFileSync(SETF(),'utf8'))}}catch{cfg={...DEF}}
 if((cfg.ver||0)<2){cfg.theme='dark';cfg.siteDark=cfg.siteDark||'force';cfg.ver=2;saveCfg()}};
const saveCfg=()=>{try{fs.writeFileSync(SETF(),JSON.stringify(cfg,null,1))}catch{}};
const applyTheme=()=>{nativeTheme.themeSource=['light','dark'].includes(cfg.theme)?cfg.theme:'system';try{broadcastTheme()}catch{}};
const themeNow=()=>cfg.theme==='light'?'light':cfg.theme==='dark'?'dark':(nativeTheme.shouldUseDarkColors?'dark':'light');
function broadcastTheme(){const v=themeNow();try{for(const wc of webContents.getAllWebContents())if(!wc.isDestroyed())wc.send('theme',v)}catch{}}
ipcMain.on('themeNow',e=>{e.returnValue=themeNow()});
const homeUrl=()=>cfg.home==='blank'?'about:blank':(cfg.home==='custom'&&/^https?:\/\//i.test(cfg.customHome)?cfg.customHome:'https://www.google.com/');
const searchUrl=()=>ENG[cfg.search]||ENG.google;
const infoUrl=q=>pathToFileURL(path.join(__dirname,'ui','start.html')).href+'?'+new URLSearchParams({name:q.name,color:colorOf(q.id),icon:q.icon||'',conn:connKind(q),s:searchUrl()}).toString();
function startUrl(q){const m=q.start||(cfg.home==='info'?'info':'');if(m==='info')return infoUrl(q);if(m==='blank')return 'about:blank';if(q.start==='google')return 'https://www.google.com/';return homeUrl()}
const shownUrl=u=>/[\\/]ui[\\/]start\.html/.test(u)?'':u;
const PAGES={whatsnew:{file:'ui/whatsnew.html',pid:'_new',title:'Что нового',icon:'✨'},extensions:{file:'ui/extensions.html',pid:'_ext',title:'Расширения',icon:'⧉'},scripts:{file:'ui/scripts.html',pid:'_sc',title:'Скрипты',icon:'⚡'},bookmarks:{file:'ui/bookmarks.html',pid:'_bm',title:'Закладки',icon:'★'},history:{file:'ui/history.html',pid:'_hist',title:'История',icon:'⏱'},manager:{file:'ui/index.html',pid:'_mgr',title:'Профили',icon:'☰'},settings:{file:'ui/settings.html',pid:'_set',title:'Настройки',icon:'⚙'}};
const running=new Map(),tunnels=new Map();
const hooked=new Set(),live=new Map(),closedTabs=[],recentClosed=[];
let menuAlts=new Map(),menuW=270,suggestSel=-1,scripts=[],dlRect=null,toastV=null,toastOpen=false,toastId=null,toastT=null,toastHover=false,flyV=null,menuV=null,menuOpen=false,menuShownAt=0,lastMenuBlur=0,menuActs=new Map(),menuPayload={items:[]},menuAnchor=null,fading=false,bookmarks=[],history=[],histT=null,uidN=0,lastPid=null,downloads=[],panel=null,panelOpen=false,panelShownAt=0,lastBlurHide=0,updating=false;
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
function dropOverlay(v){if(!v)return;try{v.setVisible(false)}catch{}try{if(v.__w&&!v.__w.isDestroyed())v.__w.contentView.removeChildView(v)}catch{}try{v.setBounds({x:0,y:0,width:0,height:0})}catch{}v.__w=null}
function attach(v){if(v.__w&&v.__w!==win&&!v.__w.isDestroyed()){try{v.__w.contentView.removeChildView(v)}catch{}}win.contentView.addChildView(v);v.__w=win;overlayW=curW}
const ICON=path.join(__dirname,'ui','icon.png');
const load=()=>{try{return JSON.parse(fs.readFileSync(FILE(),'utf8'))}catch{return[]}};
let metaMap=null;
const save=l=>{metaMap=null;fs.writeFileSync(FILE(),JSON.stringify(l,null,1))};
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
const autoColor=id=>PAL[parseInt(id.replace(/-/g,'').slice(0,6),16)%PAL.length];
const rebuildMeta=()=>{metaMap=new Map();for(const q of load())metaMap.set(q.id,{color:q.color||'',icon:q.icon||''})};
const meta=id=>{if(!metaMap)rebuildMeta();return metaMap.get(id)||{}};
const colorOf=id=>meta(id).color||autoColor(id),iconOf=id=>meta(id).icon||'';
const connKind=q=>q.vpn?'VPN-конфиг'+(q.vpnNote?' (AWG→WG)':''):q.proxy?q.proxy.type.toUpperCase()+' '+q.proxy.host+':'+q.proxy.port:'Без прокси';
const pushMgr=()=>{saveSoon();for(const W of windows)for(const t of W.tabs)if(t.kind==='manager'&&!t.view.webContents.isDestroyed())t.view.webContents.send('state',[...running.keys()])};
const view=()=>load().map(p=>({id:p.id,name:p.name,lastCheck:p.lastCheck||null,note:p.note||'',lastUsed:p.lastUsed||0,created:p.created||0,color:colorOf(p.id),icon:p.icon||'',folder:p.folder||'',tags:p.tags||[],start:p.start||'',scripts:enabledIds(p),kind:(p.vpn?'VPN-конфиг'+(p.vpnNote?' (AWG→WG)':''):p.proxy?p.proxy.type.toUpperCase()+' '+p.proxy.host+':'+p.proxy.port:'Без прокси')+(p.tz?' · '+p.tz:'')}));

// ---------- подключения: прокси с логином и VPN-конфиги (WireGuard) через sing-box ----------
const needsTunnel=p=>!!(p.vpn||(p.proxy&&p.proxy.user));
function parseWg(text){
 const I={},P={};let cur=null,peers=0;
 for(let line of text.split(/\r?\n/)){line=line.trim();if(!line||line[0]==='#'||line[0]===';')continue;
  const m=line.match(/^\[(\w+)\]$/);if(m){cur=m[1]==='Interface'?I:(m[1]==='Peer'&&!peers++?P:null);continue}
  const i=line.indexOf('=');if(i<0||!cur)continue;cur[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim()}
 const AK=['jc','jmin','jmax','s1','s2','s3','s4','h1','h2','h3','h4','i1','i2','i3','i4','i5','id','ip','ib'];let awg=null,awgCompat=false;
 if(AK.some(k=>k in I)){   // параметры AmneziaWG 2.0 (и маскировка id/ip/ib): передаём ядру sing-box-lx как есть
  awg={};for(const k of AK){if(!(k in I))continue;const v=String(I[k]).trim();
   awg[k]=/^(jc|jmin|jmax|s[1-4])$/.test(k)?(parseInt(v)||0):/^h[1-4]$/.test(k)?(/^\d+$/.test(v)?Number(v):v):v}
  const n=k=>(k in I)?(parseInt(I[k])||0):0,hd=(k,d)=>!(k in I)||String(I[k]).trim()===String(d);
  awgCompat=[1,2,3,4].every(x=>n('s'+x)===0)&&[1,2,3,4].every(x=>hd('h'+x,x));   // можно ли обойтись обычным WireGuard
 }
 const e=(P.endpoint||'').match(/^\[?([^\]]+?)\]?:(\d+)$/);
 if(!I.privatekey||!I.address||!P.publickey||!e)throw new Error('В конфиге не хватает данных (PrivateKey, Address, PublicKey или Endpoint).');
 const dns=(I.dns||'').split(',').map(x=>x.trim()).filter(Boolean);
 return {address:I.address.split(',').map(x=>x.trim()),privateKey:I.privatekey,mtu:+I.mtu||1280,dns:dns.find(x=>/^\d+\.\d+\.\d+\.\d+$/.test(x))||dns[0]||'1.1.1.1',
  host:e[1],port:+e[2],pub:P.publickey,psk:P.presharedkey,keepalive:+P.persistentkeepalive||25,awg,awgCompat};
}
function singConfig(p,port,wg,lx){
 const c={log:{level:'warn'},inbounds:[{type:'mixed',tag:'in',listen:'127.0.0.1',listen_port:port}]};
 const boot={type:'udp',tag:'boot',server:'1.1.1.1'};
 if(p.vpn){
  const w=wg||parseWg(dec(p.vpn));
  c.endpoints=[{type:'wireguard',tag:'proxy',address:w.address,private_key:w.privateKey,mtu:(lx&&w.awg)?Math.min(w.mtu,1280):w.mtu,
   peers:[{address:w.host,port:w.port,public_key:w.pub,...(w.psk?{pre_shared_key:w.psk}:{}),allowed_ips:['0.0.0.0/0','::/0'],persistent_keepalive_interval:w.keepalive}]}];
  if(lx&&w.awg)Object.assign(c.endpoints[0],w.awg);
  c.dns={servers:[boot,{type:'udp',tag:'tun',server:w.dns,detour:'proxy'}],final:'tun'};
 }else{
  const x=p.proxy,o={type:x.type==='http'?'http':'socks',tag:'proxy',server:x.host,server_port:+x.port,username:x.user,password:dec(x.pass||'')};
  if(o.type==='socks')o.version='5';
  c.outbounds=[o];c.dns={servers:[boot]};
 }
 c.route={final:'proxy',default_domain_resolver:'boot'};
 return c;
}
const ANSI=/\x1b\[[0-9;]*m/g,tunnelPend=new Map();
const PORT_ALT=[51820,443,53,123,1194,500,4500,1224,88,2408,4000,8080];
async function makeTunnel(p,tag,opt){
 opt=opt||{};const port=await freePort(),dir=path.join(DATA(),'run');fs.mkdirSync(dir,{recursive:true});
 const wg=p.vpn?parseWg(dec(p.vpn)):null,lxExe=path.join(RES,'sing-box-lx.exe'),lx=!!(wg&&wg.awg&&fs.existsSync(lxExe));
 if(wg){if(opt.port)wg.port=opt.port;else if(p.vpnPort)wg.port=p.vpnPort;if(opt.dns)wg.dns=opt.dns;else if(p.vpnDns)wg.dns=p.vpnDns}
 if(wg&&p.vpnCompat)wg.mtu=Math.min(wg.mtu||1280,1200);   // по желанию: меньший MTU, если профильный VPN работает внутри другого VPN
 if(wg&&wg.awg&&!lx&&!wg.awgCompat)throw new Error('Конфиг AmneziaWG требует ядра sing-box-lx, а его нет в этой сборке.');
 const conf=path.join(dir,tag+p.id+'.json'),exe=lx?lxExe:path.join(RES,'sing-box.exe');
 fs.writeFileSync(conf,JSON.stringify(singConfig(p,port,wg,lx)));   // сам конфиг лежит на диске только пока профиль открыт
 const chk=spawnSync(exe,['check','-c',conf],{windowsHide:true,encoding:'utf8'});
 if(chk.status!==0){try{fs.rmSync(conf,{force:true})}catch{}const m=((chk.stderr||chk.stdout||chk.error&&chk.error.message||'')+'').replace(ANSI,'').trim().split('\n').pop();log('sing-box check: '+m);throw new Error('Не удалось применить настройки подключения: '+m)}
 log('tunnel: core='+(lx?'lx':'official')+(wg?' peer='+wg.host+':'+wg.port+' dns='+wg.dns+' awg='+(wg.awg?'yes':'no'):' proxy-auth'));
 const wp=spawn(exe,['run','-c',conf],{windowsHide:true});let out='';
 const add=d=>{out=(out+d).slice(-1500)};wp.stdout.on('data',add);wp.stderr.on('data',add);
 const clean=()=>out.replace(ANSI,'').trim();
 return {wp,conf,port,n:1,core:lx?'lx':'official',peerPort:wg?wg.port:null,err:()=>clean().split('\n').pop()||'ядро ошибок не вывело',dump:()=>clean(),ready:waitPort(port)};
}
// проверка, что трафик реально идёт через туннель: запрос по IP (без DNS) и по имени (через DNS туннеля)
function socksProbe(port,host,ms){return new Promise(res=>{
 const s=net.connect(port,'127.0.0.1');let st=0,buf=Buffer.alloc(0),done=false;
 const tm=setTimeout(()=>fin(false),ms),fin=v=>{if(done)return;done=true;clearTimeout(tm);try{s.destroy()}catch{}res(v)};
 s.on('error',()=>fin(false));s.on('close',()=>fin(false));s.on('connect',()=>s.write(Buffer.from([5,1,0])));
 s.on('data',d=>{buf=Buffer.concat([buf,d]);
  if(st===0){if(buf.length<2)return;if(buf[0]!==5||buf[1]!==0)return fin(false);buf=buf.subarray(2);st=1;
   const ip=/^\d+\.\d+\.\d+\.\d+$/.test(host),addr=ip?Buffer.from(host.split('.').map(Number)):Buffer.concat([Buffer.from([host.length]),Buffer.from(host)]);
   s.write(Buffer.concat([Buffer.from([5,1,0,ip?1:3]),addr,Buffer.from([0,80])]))}
  if(st===1){if(buf.length<4)return;if(buf[1]!==0)return fin(false);
   const need=buf[3]===1?10:buf[3]===4?22:7+buf[4];if(buf.length<need)return;buf=buf.subarray(need);st=2;
   s.write('GET / HTTP/1.1\r\nHost: '+host+'\r\nConnection: close\r\n\r\n')}
  if(st===2&&buf.length>=5)fin(buf.subarray(0,5).toString()==='HTTP/')})});}
function saveVpn(id,o){const l=load(),q=l.find(x=>x.id===id);if(q){Object.assign(q,o);save(l)}}
async function ensureTunnel(p,tag,start,progress){
 progress=progress||(()=>{});let t=await start({});
 if(!p.vpn){if(!await t.ready){const e=t.err();cleanup(t);throw new Error('Не удалось подключиться: '+e)}return t}
 const alive=async(tt,ms)=>(await tt.ready)&&((await socksProbe(tt.port,'1.1.1.1',ms))||(await socksProbe(tt.port,'1.0.0.1',2500))||(await socksProbe(tt.port,'connectivitycheck.gstatic.com',4000)));
 const wg=parseWg(dec(p.vpn));let cur0=p.vpnPort||wg.port;const tried=[cur0];
 let ok=await alive(t,7000);
 for(const port of [wg.port,...PORT_ALT]){
  if(ok)break;if(tried.includes(port))continue;tried.push(port);
  progress('Подбираю порт VPN: '+port+'…');cleanup(t);t=await start({port});cur0=port;ok=await alive(t,5000);
 }
 if(!ok){const info=t.core+': '+t.dump().split('\n').slice(-2).join(' | ');cleanup(t);
  throw new Error('VPN-сервер не отвечает (проверены порты: '+tried.join(', ')+'). Возможно, порты заблокированы, конфиг просрочен или нужен другой тип подключения. ['+info+']'+vpnHint())}
 if(cur0!==(p.vpnPort||wg.port)){saveVpn(p.id,{vpnPort:cur0});log('vpn port saved: '+cur0)}   // запоминаем рабочий порт
 if(!await socksProbe(t.port,'one.one.one.one',6000)){   // трафик идёт, а имена не находятся: берём публичный DNS через туннель
  progress('Настраиваю DNS…');cleanup(t);const t2=await start({port:cur0,dns:'1.1.1.1'});
  if(await alive(t2,6000)&&await socksProbe(t2.port,'one.one.one.one',6000)){saveVpn(p.id,{vpnDns:'1.1.1.1'});log('vpn dns fallback saved');return t2}
  cleanup(t2);t=await start({port:cur0});await t.ready}
 return t;
}
function setBusy(W,msg){if(!W||W.dead)return;W.busy=msg||'';const c=curW;if(useW(W))pushTabs();if(c&&!c.dead)useW(c)}
async function tunnelFor(p){
 let t=tunnels.get(p.id);
 if(!t){
  let pr=tunnelPend.get(p.id);
  if(!pr){const W0=curW;
   pr=(async()=>{warnDupKey(p);setBusy(W0,'Подключаюсь к VPN…');try{const tt=await ensureTunnel(p,'s-',o=>makeTunnel(p,'s-',o),m=>setBusy(W0,m));tt.n=0;tunnels.set(p.id,tt);return tt}
    catch(e){log('tunnel failed: '+e.message);throw e}finally{setBusy(W0,'')}})();
   tunnelPend.set(p.id,pr);pr.then(()=>tunnelPend.delete(p.id),()=>tunnelPend.delete(p.id));}
  t=await pr;
 }
 t.n++;return `socks5://127.0.0.1:${t.port}`;
}
function dropTunnel(id,force){const t=tunnels.get(id);if(!t)return;if(!force&&--t.n>0)return;cleanup(t);tunnels.delete(id)}

// ---------- оболочка: вкладки ----------
const bgColor=()=>themeNow()==='dark'?'#12151c':'#ffffff';
function mkView(wp){const v=new WebContentsView({webPreferences:wp});v.setBackgroundColor(bgColor());return v}   // для внутренних страниц и меню: тёмный фон вместо белого
function fadeTo(v,ms){
 const w=win;if(!w||w.isDestroyed())return;const from=w.getOpacity(),n=Math.max(1,Math.round(ms/16));let i=0;fading=true;
 const id=setInterval(()=>{i++;if(w.isDestroyed()){clearInterval(id);fading=false;return}
  w.setOpacity(from+(v-from)*Math.min(i/n,1));if(i>=n){clearInterval(id);fading=false}},16);
}
const langsOf=l=>l?`${l},${l.split('-')[0]};q=0.9`:'';
const CHR=(process.versions&&process.versions.chrome)||'130.0.0.0',CMAJ=CHR.split('.')[0];
const uaMajor=()=>{const v=parseInt(cfg.uaVersion);return v>=100&&v<=300?v:+CMAJ};
const uaStr=()=>'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+uaMajor()+'.0.0.0 Safari/537.36';
const pageBg=()=>(cfg.siteDark==='force'&&themeNow()==='dark')?'#12151c':'#ffffff';
function applyGeo(wc,p){   // обычный user-agent и client hints Chrome (без «Electron»), часовой пояс и язык профиля
 try{wc.debugger.attach('1.3')}catch{}
 const send=(m,pr)=>{try{return wc.debugger.sendCommand(m,pr).catch(()=>{})}catch{}};
 const M=uaMajor(),FV=M===+CMAJ?CHR:M+'.0.0.0',meta={brands:[{brand:'Chromium',version:String(M)},{brand:'Google Chrome',version:String(M)},{brand:'Not_A Brand',version:'24'}],fullVersionList:[{brand:'Chromium',version:FV},{brand:'Google Chrome',version:FV},{brand:'Not_A Brand',version:'24.0.0.0'}],platform:'Windows',platformVersion:'10.0.0',architecture:'x86',model:'',mobile:false,bitness:'64',wow64:false};
 send('Emulation.setUserAgentOverride',{userAgent:uaStr(),platform:'Win32',...(p.lang?{acceptLanguage:langsOf(p.lang)}:{}),userAgentMetadata:meta});
 if(p.tz)send('Emulation.setTimezoneOverride',{timezoneId:p.tz});
 if(p.lang)send('Emulation.setLocaleOverride',{locale:p.lang});
 send('Page.enable');send('Page.addScriptToEvaluateOnNewDocument',{source:'if(!window.chrome)window.chrome={runtime:{}};'});

}
const barRow=()=>!!cfg.bmBar||(cfg.favScripts||[]).length>0;
const topH=()=>(mode==='side'?42:82)+(barRow()?30:0);
const isLocalHost=h=>/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(h)||/\.(local|localhost|test|internal)$/.test(h)||/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
function darkWanted(url){   // принудительная тёмная тема: для всех сайтов, кроме локальных адресов и отключённых вручную
 let u;try{u=new URL(url)}catch{return null}if(!/^https?:$/.test(u.protocol))return null;
 const pref=(cfg.darkSites||{})[u.origin];if(pref==='on')return true;if(pref==='off')return false;
 return cfg.siteDark==='force';
}
const DARK_PROBE=`(()=>{const lum=c=>{const m=String(c).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(Number);if(p.length>3&&p[3]===0)return null;return (0.2126*p[0]+0.7152*p[1]+0.0722*p[2])/255};for(const e of [document.body,document.documentElement]){if(!e)continue;const l=lum(getComputedStyle(e).backgroundColor);if(l!==null)return l<0.35}return false})()`;
async function detectDark(t){   // у страницы своя тёмная тема (фон тёмный): принудительную не нужно
 if(!t||t.kind||cfg.siteDark!=='force')return;const wc=t.view.webContents;if(wc.isDestroyed())return;
 let o='';try{o=new URL(wc.getURL()).origin}catch{return}if(!/^https?:/i.test(o)||(cfg.darkSites||{})[o])return;
 try{const dark=await wc.executeJavaScript(DARK_PROBE),want=!dark;if(t.__darkOn!==want){t.__darkOn=want;wc.debugger.sendCommand('Emulation.setAutoDarkModeOverride',{enabled:want}).catch(()=>{})}}catch{}
}
function applyDark(t,url){const w=darkWanted(url);if(w===null)return;t.__darkOn=w;try{t.view.webContents.debugger.sendCommand('Emulation.setAutoDarkModeOverride',{enabled:w}).catch(()=>{})}catch{}}
function toggleSiteDark(t){const u=t.view.webContents.getURL();let o='';try{o=new URL(u).origin}catch{return}const want=darkWanted(u);cfg.darkSites=cfg.darkSites||{};cfg.darkSites[o]=want?'off':'on';saveCfg();applyDark(t,u)}
function layout(){
 if(!win||win.isDestroyed())return;const b=win.getContentBounds(),W=b.width,H=b.height,x=mode==='side'?240:0,y=topH();
 for(const t of tabs){if(t.__w!==win){t.__w=win;t.__bk=null;t.__vis=null}}
 for(const t of tabs){if(t.id===active&&t.ready!==false){
  const nb=t.fs?{x:0,y:0,width:W,height:H}:{x,y,width:Math.max(W-x,1),height:Math.max(H-y,1)},k=nb.x+','+nb.y+','+nb.width+','+nb.height;
  if(t.__bk!==k){t.view.setBounds(nb);t.__bk=k}if(t.__vis!==true){t.view.setVisible(true);t.__vis=true}}}
 for(const t of tabs){if(!(t.id===active&&t.ready!==false)&&t.__vis!==false){t.view.setVisible(false);t.__vis=false}}
 if(panel&&panelOpen)panel.setBounds(panelBounds());
}
function pushTabs(){
 if(!win||win.isDestroyed()||win.webContents.isDestroyed())return;
 saveSoon();raisePanel();
 const t=tabs.find(x=>x.id===active),pg=t&&!t.kind,nh=pg?t.view.webContents.navigationHistory:null,all=load();
 if(pg)lastPid=t.pid;
 const pgOf=id=>Object.values(PAGES).find(x=>x.pid===id),nm=id=>pgOf(id)?pgOf(id).title:(all.find(p=>p.id===id)||{name:'?'}).name;
 const col=id=>id[0]==='_'?'#8b93a5':colorOf(id);
 sendFavs();win.webContents.send('tabs',{mode,active,incognito:!!(curW&&curW.incognito),apid:pg?t.pid:null,favs:favList(pg?prof(t.pid):null),busy:(curW&&curW.busy)||'',blocked:(t&&t.blocked)||0,adOn:!!cfg.adblock,loading:!!(t&&!t.kind&&t.loading),waiting:!!(t&&t.ready===false)||!!(curW&&curW.busy),starred:!!(pg&&bookmarks.some(b=>b.url===t.url)),url:pg?t.url:'',canBack:nh?nh.canGoBack():false,canFwd:nh?nh.canGoForward():false,
  profiles:[...new Set(tabs.map(x=>x.pid))].map(id=>({id,name:nm(id),color:col(id),icon:pgOf(id)?pgOf(id).icon:(iconOf(id)||null)})),
  icons:Object.fromEntries([...new Set(tabs.filter(x=>!x.kind).map(x=>x.pid))].map(id=>[id,iconOf(id)]).filter(x=>x[1])),
  tabs:tabs.map(x=>({id:x.id,pid:x.pid,audible:!!x.audible,muted:!!x.muted,pinned:!!x.pinned,loading:!!(x.loading&&!x.kind&&x.ready!==false),fav:x.favId||'',title:x.kind?PAGES[x.kind].title:(x.title||x.url||'Новая вкладка'),color:col(x.pid),letter:x.kind?PAGES[x.kind].icon:nm(x.pid)[0].toUpperCase()}))});
}
async function newTab(pid,url,bg,afterId){
 const p=prof(pid);if(!p)return null;
 const W=curW;
 const part=W.incognito?'inc-'+W.uid+'-'+pid:'persist:p-'+pid,ses=session.fromPartition(part);hookDownloads(ses,pid,part);adblockSession(ses,pid,part);permSession(ses,pid,part);
 try{ses.setUserAgent(uaStr())}catch{}
 try{const sl=(ses.availableSpellCheckerLanguages||[]).filter(l=>/^(ru|en-US)$/.test(l));if(sl.length)ses.setSpellCheckerLanguages(sl)}catch{}   // у каждого профиля свои куки, кэш и хранилище
 let vpn=false;
 try{
  if(needsTunnel(p)){const u=await tunnelFor(p);vpn=true;await ses.setProxy({proxyRules:u})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
 }catch(e){appDialog({title:'MultiBrowser',type:'error',message:e.message});return null}
 try{if((p.exts||[]).length)await loadExts(ses,p,part)}catch(e){log('ext: '+e.message)}
 useW(W);
 const v=new WebContentsView({webPreferences:{session:ses,contextIsolation:true,sandbox:true,autoplayPolicy:enabledIds(p).includes('b-novideoauto')?'document-user-activation-required':'no-user-gesture-required'}});
 const t={id:nextId++,pid,view:v,title:'',url:url||startUrl(p),vpn,ready:false,loading:true,W,blocked:0};
 const ai=afterId?tabs.findIndex(x=>x.id===(W.anchor&&W.anchor.op===afterId?W.anchor.last:afterId)):-1;
 if(ai>=0){tabs.splice(ai+1,0,t);W.anchor={op:afterId,last:t.id}}else tabs.push(t);
 const wc=v.webContents;
 v.setBackgroundColor(pageBg());try{wc.setBackgroundThrottling(false)}catch{}
 const on=(ev,fn)=>wc.on(ev,(...a)=>{if(useW(t.W))fn(...a)}),once=(ev,fn)=>wc.once(ev,(...a)=>{if(useW(t.W))fn(...a)});
 on('did-start-navigation',(e,u,inPlace,main)=>{if(main&&!inPlace){t.blocked=0;t.translated=false;if(t.badge){t.badge=0;updateBadges()}userDocStart(t,u);adCosmetics(t,u);applyDark(t,u);try{const o=new URL(u).origin;if(o!==t.__org){t.__org=o;t.favId='';t.favData=''}}catch{}}});
 on('context-menu',(e,pr)=>ctxMenu(t,pr));
 on('console-message',(...a)=>{const ev=a[0]||{},msg=typeof a[2]==='string'?a[2]:ev.message;if(typeof msg!=='string'||msg.charCodeAt(0)!==1)return;const kind=msg.slice(1,4),data=msg.slice(4);
  if(kind==='MBN')notifyMsg(wc,data,ev.frame);else if(kind==='MBP')pasteImage(wc,ev.frame);else if(kind==='MBB'){try{const o=JSON.parse(data);t.badge=Math.max(0,Math.min(9999,Math.round(o.n<0?1:o.n)||0));updateBadges()}catch{}}else if(kind==='MBF'){try{fileChooser(t,wc,JSON.parse(data))}catch{}}else if(kind==='MBL'){try{const o=JSON.parse(data);if(/^https?:/i.test(o.u))newTab(t.pid,o.u,!!o.bg,t.id)}catch{}}});
 on('page-favicon-updated',(e,icons)=>favFetch(t,icons));
 const au=()=>{const a=wc.isCurrentlyAudible(),m=wc.isAudioMuted();if(t.audible!==a||t.muted!==m){t.audible=a;t.muted=m;if(useW(t.W))pushTabs()}};
 on('audio-state-changed',au);on('media-started-playing',au);on('media-paused',au);
 on('enter-html-full-screen',()=>{t.fs=true;win.setFullScreen(true);layout()});on('leave-html-full-screen',()=>{t.fs=false;win.setFullScreen(false);layout()});
 on('zoom-changed',(e,dir)=>zoom(dir==='in'?1:-1));
 wc.setWebRTCIPHandlingPolicy(rtcPolicy(p));
 const mkReady=()=>{if(!t.ready&&useW(t.W)){t.ready=true;layout();pushTabs();if(t.id===active)focusSoon()}};   // страница показывается, когда готова: без белой вспышки
 once('dom-ready',()=>setTimeout(mkReady,60));setTimeout(mkReady,3500);
 on('did-start-loading',()=>{t.loading=true;pushTabs()});on('did-stop-loading',()=>{t.loading=false;mkReady();pushTabs()});
 applyGeo(wc,p);notifyDoc(t);fpDoc(t);touchProfile(p.id);
 on('dom-ready',()=>{runScripts(wc,pid,'dom-ready');setTimeout(()=>detectDark(t),250)});on('did-finish-load',()=>{runScripts(wc,pid,'load');setTimeout(()=>detectDark(t),400);setTimeout(()=>detectDark(t),2500)});
 wc.setWindowOpenHandler(({url:u,disposition:d})=>{useW(t.W);newTab(pid,u,d==='background-tab',t.id);return{action:'deny'}});
 on('page-title-updated',(e,s)=>{t.title=s;if(t.h)t.h.title=s;saveHistSoon();pushTabs()});
 on('did-navigate',(e,u)=>{t.url=shownUrl(u);t.h=W.incognito?null:addHistory(pid,u);pushTabs()});
 on('did-navigate-in-page',(e,u,main)=>{t.url=shownUrl(u);if(main)t.h=W.incognito?null:addHistory(pid,u);pushTabs()});
 on('before-input-event',(e,i)=>{if(hotkey(i,wc))e.preventDefault()});
 on('found-in-page',(e,r)=>{if(t.id===active&&win&&!win.webContents.isDestroyed())win.webContents.send('find-result',{n:r.activeMatchOrdinal,total:r.matches})});
 win.contentView.addChildView(v);if(!bg||active===null)setActive(t.id);wc.loadURL(t.url);layout();pushTabs();return t;
}
function closeTab(id){
 const i=tabs.findIndex(x=>x.id===id);if(i<0)return;const t=tabs[i];closedTabs.push({type:'tab',pid:t.pid,kind:t.kind||'',url:t.kind?'':(t.view.webContents.isDestroyed()?t.url:(t.view.webContents.getURL()||t.url))});if(closedTabs.length>20)closedTabs.shift();tabs.splice(i,1);
 win.contentView.removeChildView(t.view);t.view.webContents.close();if(t.vpn)dropTunnel(t.pid);
 if(active===id)setActive(tabs.length?tabs[Math.max(0,i-1)].id:null);layout();pushTabs();
 if(!tabs.length&&windows.filter(x=>!x.dead).length>1)win.close();
 focusSoon();updateBadges();
}
const norm=s=>{s=s.trim();if(!s)return homeUrl();if(/^[a-z]+:\/\//i.test(s))return s;return /^[^\s]+\.[^\s]{2,}$/.test(s)||/^localhost(:\d+)?/.test(s)?'https://'+s:searchUrl()+encodeURIComponent(s)};

// ---------- усиленный режим: движок fingerprint-chromium отдельным окном ----------
async function launch(id,opt){
 opt=opt||{};const p=prof(id);if(!p||running.has(id))return;touchProfile(id);
 const chrome=findFile(path.join(RES,'engine'),'chrome.exe');if(!chrome)throw new Error('Движок не найден (resources/engine)');
 const job={};let proxy=null;
 if(needsTunnel(p)){const t=await ensureTunnel(p,'e-',o=>makeTunnel(p,'e-',o),()=>{});job.wp=t.wp;job.conf=t.conf;proxy=`socks5://127.0.0.1:${t.port}`}
 else if(p.proxy)proxy=`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`;
 try{setChromiumDownloadDir(id,p)}catch(e){log('chromium download dir: '+e.message)}
 const args=[`--user-data-dir=${path.join(DATA(),'profiles',id)}`,`--fingerprint=${p.seed}`,'--no-first-run','--no-default-browser-check','--restore-last-session'];
 const F=fpResolve(p);args.push('--fingerprint-platform=windows','--fingerprint-hardware-concurrency='+F.cores,'--fingerprint-gpu-vendor='+F.gpuV,'--fingerprint-gpu-renderer='+F.gpuR);
 if(proxy)args.push(`--proxy-server=${proxy}`,'--force-webrtc-ip-handling-policy='+rtcPolicy(p));else if((p.fp||{}).webrtc)args.push('--force-webrtc-ip-handling-policy='+rtcPolicy(p));
 if(p.tz)args.push('--timezone='+p.tz);if(p.lang)args.push('--lang='+p.lang,'--accept-lang='+langsOf(p.lang));
 if(opt.debugPort){args.push('--remote-debugging-port='+opt.debugPort,'--remote-debugging-address=127.0.0.1');job.debugPort=opt.debugPort}
 if(opt.url&&/^https?:\/\//i.test(opt.url))args.push(opt.url);
 job.chrome=spawn(chrome,args);running.set(id,job);pushMgr();
 job.chrome.on('exit',()=>{cleanup(job);running.delete(id);pushMgr()});
}

// ---------- сохранение и восстановление вкладок ----------
const SESS=()=>path.join(DATA(),'session.json');
function windowState(W){
 let bounds=null;try{bounds=W.win.getBounds()}catch{}
 return{uid:W.uid,mode:W.mode,active:W.tabs.findIndex(t=>t.id===W.active),bounds,
  tabs:W.tabs.map(t=>({pid:t.pid,pinned:!!t.pinned,kind:t.kind||'',url:t.kind?'':(t.view.webContents.isDestroyed()?t.url:(t.view.webContents.getURL()||t.url))}))};
}
function saveSession(){
 if(restoring||quitting)return;
 const alive=windows.filter(W=>!W.dead&&!W.incognito).map(windowState),ids=new Set(alive.map(x=>x.uid)),now=Date.now();
 const extra=recentClosed.filter(x=>now-x.t<8000&&!ids.has(x.state.uid)).map(x=>x.state);   // окна, закрытые перед выходом, тоже вернутся
 const all=[...alive,...extra],w0=all[0],data={enhanced:[...running.keys()],windows:all};
 if(w0){data.mode=w0.mode;data.active=w0.active;data.tabs=w0.tabs}
 try{fs.writeFileSync(SESS(),JSON.stringify(data))}catch{}
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(saveSession,500)}
async function fillWindow(W,w,ids){
 ids=ids||new Set(load().map(p=>p.id));useW(W);if(w.mode==='side')setMode('side');
 let target=null;
 for(let i=0;i<(w.tabs||[]).length;i++){const x=w.tabs[i];let t=null;
  try{if(x.kind&&PAGES[x.kind])t=openPage(x.kind,true);else if(!x.kind&&ids.has(x.pid))t=await newTab(x.pid,x.url,true)}catch(e){log('restore tab: '+e.message)}
  useW(W);if(t&&x.pinned)t.pinned=true;if(t&&i===w.active)target=t}
 const pick=target||W.tabs[0];if(pick)setActive(pick.id);layout();pushTabs();
}
async function restoreSession(){
 let s=null;
 try{
  try{s=JSON.parse(fs.readFileSync(SESS(),'utf8'))}catch(e){log('session read: '+e.message)}
  if(!cfg.restore)s=null;
  const wins=s&&Array.isArray(s.windows)&&s.windows.length?s.windows:(s&&Array.isArray(s.tabs)?[{mode:s.mode,active:s.active,tabs:s.tabs}]:[]);
  log('restore: '+wins.map(w=>w.tabs.length).join('+')+' tabs in '+wins.length+' windows, '+((s&&s.enhanced)||[]).length+' enhanced'+(cfg.restore?'':' (disabled)'));
  const ids=new Set(load().map(p=>p.id)),first=windows[0];
  for(let wi=0;wi<wins.length;wi++){const w=wins[wi],W=wi===0?first:createWindow({bounds:w.bounds});await fillWindow(W,w,ids)}
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
function hookDownloads(ses,pid,key){   // каждый профиль качает в свою папку (если задана), иначе в общую
 key=key||pid;if(hooked.has(key))return;hooked.add(key);
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
  panel.webContents.on('before-input-event',(e,i)=>{if(i.type==='keyDown'&&i.key==='Escape'){hidePanel();focusSoon();e.preventDefault()}else if(overlayW&&useW(overlayW)&&hotkey(i,panel.webContents))e.preventDefault()})}
 attach(panel);panel.setBounds(panelBounds());panel.setVisible(true);panelOpen=true;panelShownAt=Date.now();
 panel.webContents.focus();if(!panel.webContents.isLoading())panel.webContents.send('downloads',dlList());
}
function hidePanel(){dropOverlay(panel);panelOpen=false}
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
 const st={list:bookmarks.map(b=>({id:b.id,title:b.title,url:b.url,folder:b.folder||''})),bar:barRow(),chips:!!cfg.bmBar};
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
 const hh=Math.max(60,Math.min(h,b.height-20,460));let y=a.y;if(y+hh>b.height-8)y=Math.max(8,b.height-hh-8);
 return{x,y,width:w,height:hh}}
function showMenu(items,anchor,opts={}){
 hidePanel();hideToast();menuActs=new Map();menuAlts=new Map();
 const out=items.map((it,i)=>{const {fn,alt,...r}=it;if(fn){r.id='a'+i;menuActs.set(r.id,fn);if(alt){r.alt=true;menuAlts.set(r.id,alt)}}return r});
 menuPayload={items:out,search:!!opts.search,placeholder:opts.placeholder||'',suggest:!!opts.suggest};menuW=opts.width||270;menuAnchor=anchor||cursorAnchor();
 if(!menuV){menuV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});menuV.webContents.loadFile('ui/menu.html');
  menuV.webContents.on('blur',()=>{if(menuOpen&&Date.now()-menuShownAt>200){hideMenu();lastMenuBlur=Date.now()}});
  menuV.webContents.on('before-input-event',(e,i)=>{if(i.type==='keyDown'&&i.key==='Escape'){hideMenu();focusSoon();e.preventDefault()}else if(!menuPayload.suggest&&overlayW&&useW(overlayW)&&hotkey(i,menuV.webContents))e.preventDefault()})}
 attach(menuV);menuV.setBounds(menuBounds(menuW,120));menuV.setVisible(true);menuOpen=true;menuShownAt=Date.now();
 if(!opts.noFocus)menuV.webContents.focus();if(!menuV.webContents.isLoading())menuV.webContents.send('menu',menuPayload);
}
function hideMenu(){dropOverlay(menuV);menuOpen=false}
function profileMenu(anchor,url,incog,enhanced){
 const l=load().slice().sort((a,b)=>(a.folder?0:1)-(b.folder?0:1)||(a.folder||'').localeCompare(b.folder||'','ru')||a.name.localeCompare(b.name,'ru'));
 if(!l.length){showMenu([{label:'Сначала создай профиль',disabled:true},{label:'Открыть «Профили»',fn:()=>openPage('manager')}],anchor);return}
 const c0=cur(),grouped=l.some(p=>p.folder);
 const mk=(p,fn,tag)=>({label:p.name,color:colorOf(p.id),letter:p.name[0].toUpperCase(),icon:p.icon||'',tag:tag||p.folder||'',fn});
 const items=[{type:'header',label:enhanced?'Усиленный режим (отдельное окно)':incog?'Окно инкогнито для профиля':(url?'Открыть в профиле':'Новая вкладка в профиле')}];
 let last=null;
 for(const p of l){
  if(grouped&&(p.folder||'')!==last){last=p.folder||'';items.push({type:'header',label:last||'Без папки'})}
  items.push(mk(p,enhanced?()=>launch(p.id).catch(x=>appDialog({title:'MultiBrowser',type:'error',message:x.message})):()=>incog?openIncognito(p.id):newTab(p.id,url,false,c0&&c0.id),enhanced?(p.folder?p.folder+' · усил.':'усил.'):undefined))}
 if(!url&&!incog&&!enhanced)items.push({type:'sep'},{label:'Усиленный режим (отдельное окно)…',fn:()=>profileMenu(anchor,null,false,true)});
 showMenu(items,anchor,{search:l.length>7,placeholder:'Найти профиль (имя, папка)…'});
}
function mainMenu(anchor){
 const t=cur();
 showMenu([
  {label:'Новая вкладка',hint:'Ctrl+T',fn:()=>{if(t&&!t.kind)newTab(t.pid,undefined,false,t.id);else profileMenu()}},
  {label:'Вернуть закрытую вкладку или окно',hint:'Ctrl+Shift+T',fn:()=>reopenTab()},
  {label:'Новое окно',hint:'Ctrl+N',fn:()=>newWindowFlow()},
  {label:'Новое окно инкогнито',hint:'Ctrl+Shift+N',fn:()=>incognitoFlow()},
  {label:'Поиск по вкладкам',hint:'Ctrl+Shift+A',fn:()=>tabSearch()},
  {label:'Открыть профиль…',hint:'Ctrl+Shift+P',fn:()=>profileMenu()},
  {type:'sep'},
  {label:'Закладки',hint:'Ctrl+Shift+O',fn:()=>openPage('bookmarks')},
  {label:'История',hint:'Ctrl+H',fn:()=>openPage('history')},
  {label:'Загрузки',hint:'Ctrl+J',fn:()=>togglePanel()},
  ...(t&&!t.kind?[{label:t.translated?'Показать оригинал':'Перевести страницу',fn:()=>translateToggle(t)},{label:(darkWanted(t.view.webContents.getURL())?'Выключить':'Включить')+' тёмную тему этого сайта',fn:()=>toggleSiteDark(t)}]:[]),
  ...(t&&!t.kind?notifyMenuItems(t):[]),
  {type:'sep'},
  {label:'Скрипты',fn:()=>openPage('scripts')},
  {label:'Расширения',fn:()=>openPage('extensions')},
  {label:'Профили',fn:()=>openPage('manager')},
  {label:'Очистить данные профиля…',hint:'Ctrl+Shift+Del',fn:()=>clearDataFlow()},
  {label:'Настройки',fn:()=>openPage('settings')},
  {type:'sep'},
  {label:'Панель закладок',hint:'Ctrl+Shift+B',checked:!!cfg.bmBar,fn:()=>{cfg.bmBar=!cfg.bmBar;saveCfg();layout();pushBm()}},
  {label:mode==='top'?'Вид: боковая панель':'Вид: вкладки сверху',fn:()=>{setMode(mode==='top'?'side':'top');layout();pushTabs()}}
 ],anchor);
}

// ---------- горячие клавиши ----------
const cur=()=>tabs.find(x=>x.id===active),pageWc=()=>{const t=cur();return t&&!t.kind?t.view.webContents:null};
function focusActive(){   // вернуть клавиатуру странице после смены вкладки, закрытия меню или диалога
 if(!win||win.isDestroyed()||!win.isFocused())return;const t=cur();
 try{if(t&&t.ready!==false)t.view.webContents.focus();else win.webContents.focus()}catch{}
}
function focusSoon(){const W0=curW;setImmediate(()=>{if(W0&&!W0.dead&&useW(W0))focusActive()})}
function goTab(t){if(t){setActive(t.id);layout();pushTabs();focusSoon()}}
function cycle(d){if(tabs.length<2)return;const i=tabs.findIndex(x=>x.id===active);goTab(tabs[(i+d+tabs.length)%tabs.length])}
function zoom(d){const w=pageWc();if(w)w.setZoomLevel(d===0?0:Math.max(-3,Math.min(5,w.getZoomLevel()+d*0.5)))}
function reopenTab(){   // Ctrl+Shift+T: вернуть закрытую вкладку или закрытое окно
 const c=closedTabs.pop();if(!c)return;
 if(c.type==='window'){const ri=recentClosed.findIndex(x=>x.state.uid===c.state.uid);if(ri>=0)recentClosed.splice(ri,1);const W=createWindow({bounds:c.state.bounds,instant:true});useW(W);fillWindow(W,c.state);return}
 if(c.kind&&PAGES[c.kind])openPage(c.kind);else newTab(c.pid,c.url)}
function hotkey(i,wc){
 if(i.type!=='keyDown'||(i.control&&i.alt))return false;
 const c=i.control||i.meta,sh=i.shift,al=i.alt,k=i.key,cd=i.code||'';
 const L=/^Key[A-Z]$/.test(cd)?cd.slice(3).toLowerCase():'';   // физическая клавиша: не зависит от раскладки
 const dg=(/^(?:Digit|Numpad)([0-9])$/.exec(cd)||[])[1],plus=cd==='Equal'||cd==='NumpadAdd',minus=cd==='Minus'||cd==='NumpadSubtract';
 const t=cur(),w=pageWc();
 if(k==='F12'||(c&&sh&&L==='i')){(w||wc).toggleDevTools();return true}
 if(k==='F11'){win.setFullScreen(!win.isFullScreen());return true}
 if(k==='F5'||(c&&L==='r')){if(w){if(c&&(sh||k==='F5'))w.reloadIgnoringCache();else w.reload()}return true}
 if(c&&L==='t'){if(sh)reopenTab();else if(t&&!t.kind)newTab(t.pid,undefined,false,t.id);else profileMenu();return true}
 if(c&&!sh&&(L==='w'||k==='F4')){if(t)closeTab(t.id);return true}
 if(c&&k==='Tab'){cycle(sh?-1:1);return true}
 if(c&&k==='PageDown'){cycle(1);return true}
 if(c&&k==='PageUp'){cycle(-1);return true}
 if(c&&dg&&dg!=='0'){goTab(dg==='9'?tabs[tabs.length-1]:tabs[+dg-1]);return true}
 if((c&&(L==='l'||L==='k'||L==='e'))||k==='F6'||(al&&L==='d')){win.webContents.focus();win.webContents.send('focus-addr');return true}
 if(al&&k==='ArrowLeft'){if(w&&w.navigationHistory.canGoBack())w.navigationHistory.goBack();return true}
 if(al&&k==='ArrowRight'){if(w&&w.navigationHistory.canGoForward())w.navigationHistory.goForward();return true}
 if(al&&k==='Home'){if(w)w.loadURL(homeUrl());return true}
 if(c&&!sh&&L==='f'&&w){win.webContents.focus();win.webContents.send('show-find');return true}
 if(c&&!sh&&L==='p'&&w){w.print();return true}
 if(c&&L==='j'){togglePanel();return true}
 if(c&&plus){zoom(1);return true}
 if(c&&minus){zoom(-1);return true}
 if(c&&dg==='0'){zoom(0);return true}
 if(c&&!sh&&L==='u'&&w&&t){newTab(t.pid,'view-source:'+w.getURL());return true}
 if(c&&!sh&&!al&&L==='d'){bmToggle();return true}
 if(c&&sh&&L==='o'){openPage('bookmarks');return true}
 if(c&&!sh&&L==='h'){openPage('history');return true}
 if(c&&sh&&L==='b'){cfg.bmBar=!cfg.bmBar;saveCfg();layout();pushBm();return true}
 if(c&&sh&&L==='n'){incognitoFlow();return true}
 if(c&&!sh&&L==='n'){newWindowFlow();return true}
 if(c&&sh&&L==='a'){tabSearch();return true}
  if(c&&sh&&L==='p'){profileMenu();return true}
 if(c&&sh&&L==='w'){win.close();return true}
 if(c&&sh&&L==='m'&&w&&t){w.setAudioMuted(!w.isAudioMuted());t.muted=w.isAudioMuted();pushTabs();return true}
 if(c&&!sh&&L==='s'&&w){savePage(w);return true}
 if(c&&sh&&(k==='PageUp'||k==='PageDown')){moveActive(k==='PageUp'?-1:1);return true}
 if(c&&sh&&(k==='Delete'||k==='Backspace')){clearDataFlow();return true}
 if(k==='F3'||(c&&L==='g')){win.webContents.send('find-next',!sh);return true}
 return false;
}

// ---------- проверка подключения и язык/часовой пояс по IP ----------
const LANG={US:'en-US',GB:'en-GB',DE:'de-DE',FR:'fr-FR',ES:'es-ES',IT:'it-IT',NL:'nl-NL',PL:'pl-PL',PT:'pt-PT',BR:'pt-BR',RU:'ru-RU',UA:'uk-UA',BY:'ru-BY',KZ:'ru-KZ',TR:'tr-TR',JP:'ja-JP',KR:'ko-KR',CN:'zh-CN',IN:'en-IN',CA:'en-CA',AU:'en-AU',SE:'sv-SE',NO:'nb-NO',FI:'fi-FI',DK:'da-DK',CZ:'cs-CZ',RO:'ro-RO',BG:'bg-BG',GR:'el-GR',HU:'hu-HU',AT:'de-AT',CH:'de-CH',BE:'nl-BE',IE:'en-IE',IL:'he-IL',AE:'ar-AE',SG:'en-SG',HK:'zh-HK',MX:'es-MX',AR:'es-AR',LT:'lt-LT',LV:'lv-LV',EE:'et-EE',MD:'ro-MD',GE:'ka-GE',AM:'hy-AM',AZ:'az-AZ'};
const GEO_SERVICES=[
 ['https://ipwho.is/',j=>j.success===false?null:{ip:j.ip,country:j.country_code,city:j.city,org:(j.connection&&(j.connection.isp||j.connection.org))||'',tz:j.timezone&&j.timezone.id}],
 ['https://api.ip.sb/geoip',j=>({ip:j.ip,country:j.country_code,city:j.city,org:j.organization||j.isp||'',tz:j.timezone})],
 ['https://ipinfo.io/json',j=>({ip:j.ip,country:j.country,city:j.city,org:j.org,tz:j.timezone})],
 ['https://ifconfig.co/json',j=>({ip:j.ip,country:j.country_iso,city:j.city,org:j.asn_org,tz:j.time_zone})],
 ['https://api.country.is/',j=>({ip:j.ip,country:j.country})]];
const geoCache=new Map();
async function geoLookup(ses){   // сервисы по очереди: общий адрес VPN часто упирается в лимит запросов у одного из них
 const statuses=[];let lastErr='',alive=false;
 for(const [url,map] of GEO_SERVICES){const host=new URL(url).hostname;
  try{const r=await ses.fetch(url,{signal:AbortSignal.timeout(9000),headers:{Accept:'application/json'}});alive=true;
   if(!r.ok){statuses.push(host+': '+r.status);continue}
   const j=await r.json(),info=map(j);if(info&&info.ip)return{info,provider:host,statuses,alive};
   statuses.push(host+': пустой ответ');
  }catch(e){lastErr=e.message;statuses.push(host+': '+e.message)}}
 return{info:null,statuses,lastErr,alive};
}
async function checkConnRaw(id){
 const p=prof(id);if(!p)return{error:'Профиль не найден'};
 const sig=id+'|'+JSON.stringify([p.vpn||null,p.proxy||null,p.vpnPort||null]),hit=geoCache.get(sig);
 if(hit&&Date.now()-hit.t<3*60000)return hit.res;
 const ses=session.fromPartition('persist:p-'+id);let held=false;
 try{
  if(needsTunnel(p)){const u=await tunnelFor(p);held=true;await ses.setProxy({proxyRules:u})}
  else if(p.proxy)await ses.setProxy({proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`});
  else await ses.setProxy({mode:'direct'});
  const t0=Date.now(),g=await geoLookup(ses);
  if(!g.info){
   log('check: '+g.statuses.join('; '));
   if(g.alive)return{error:'Подключение работает, но сервисы определения IP не ответили ('+g.statuses.join('; ')+'). Чаще всего это лимит запросов для общего адреса VPN: попробуй позже.'};
   const t=tunnels.get(id),extra=t&&t.err?' · ядро: '+t.err():'';return{error:'Нет ответа через подключение ('+(g.lastErr||g.statuses.join('; '))+')'+extra+vpnHint()};
  }
  const j=g.info,res={ip:j.ip,country:j.country,city:j.city,org:j.org,tz:j.tz,lang:LANG[j.country]||'en-US',ms:Date.now()-t0,provider:g.provider};
  geoCache.set(sig,{t:Date.now(),res});return res;
 }catch(e){const t=tunnels.get(id),extra=t&&t.err?' · ядро: '+t.err():'';log('check: '+e.message+extra+(t&&t.dump?' | '+t.dump():''));return{error:e.message+extra}}
 finally{if(held)dropTunnel(id)}
}

async function checkConn(id){const r=await checkConnRaw(id);
 try{const l=load(),q=l.find(x=>x.id===id);if(q){q.lastCheck=r&&!r.error?{ip:r.ip,country:r.country,city:r.city||'',ms:r.ms,t:Date.now()}:{error:String((r&&r.error)||'нет ответа').slice(0,200),t:Date.now()};save(l);pushMgr()}}catch{}
 return r}

// ---------- всплывающее окно загрузки и анимация «полёта» ----------
function toastItem(){const d=downloads.find(x=>x.id===toastId);if(!d)return null;const all=load();
 return{...d,profile:(all.find(p=>p.id===d.pid)||{name:'—'}).name,folder:path.dirname(d.path),exists:d.state!=='completed'||fs.existsSync(d.path)}}
function toastBounds(){const b=win.getContentBounds(),r=(curW&&curW.dlRect)||{right:b.width-130,bottom:topH()-40},w=340,h=108;
 return{x:Math.round(Math.min(Math.max(r.right-w,6),b.width-w-6)),y:Math.round(r.bottom+8),width:w,height:h}}
function pushToast(){if(toastOpen&&toastV&&!toastV.webContents.isDestroyed())toastV.webContents.send('toast',toastItem())}
function hideToast(){dropOverlay(toastV);toastOpen=false;clearTimeout(toastT)}
function showToast(id,ms){
 if(panelOpen||menuOpen||!win||win.isDestroyed())return;toastId=id;
 if(!toastV){toastV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});toastV.webContents.loadFile('ui/toast.html');toastV.webContents.on('before-input-event',(e,i)=>{if(overlayW&&useW(overlayW)&&hotkey(i,toastV.webContents))e.preventDefault()})}
 attach(toastV);toastV.setBounds(toastBounds());toastV.setVisible(true);toastOpen=true;pushToast();
 clearTimeout(toastT);toastT=setTimeout(()=>{if(!toastHover)hideToast()},ms||5000);
}
function ensureFly(){if(!flyV){flyV=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false});flyV.setBackgroundColor('#4c8dff');flyV.webContents.loadFile('ui/fly.html')}return flyV}
function flyDownload(start,done){   // значок летит от места клика к кнопке загрузок (позиция меняется плавно, размер постоянный)
 try{
  const w0=win,b=w0.getContentBounds(),R=curW&&curW.dlRect,end=R?{x:(R.left+R.right)/2,y:(R.top+R.bottom)/2}:{x:b.width-170,y:60};
  ensureFly();attach(flyV);const SZ=28;
  flyV.setBounds({x:Math.round(start.x-SZ/2),y:Math.round(start.y-SZ/2),width:SZ,height:SZ});flyV.setVisible(true);
  const t0=Date.now(),D=640,c={x:start.x+(end.x-start.x)*0.12,y:Math.min(start.y,end.y)-110};
  const ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
  const step=()=>{
   if(!w0||w0.isDestroyed())return;
   const k=Math.min((Date.now()-t0)/D,1),e=ease(k),u=1-e;
   const x=u*u*start.x+2*u*e*c.x+e*e*end.x,y=u*u*start.y+2*u*e*c.y+e*e*end.y;
   flyV.setBounds({x:Math.round(x-SZ/2),y:Math.round(y-SZ/2),width:SZ,height:SZ});
   if(k>=1){dropOverlay(flyV);if(!w0.webContents.isDestroyed())w0.webContents.send('dl-hit');done()}else setTimeout(step,4)};
  step();
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
const AC=(id,name,desc,rules)=>({id,name,desc,type:'autoclick',builtin:true,params:[{key:'rules',label:'Правила: сайт | текст кнопки или CSS-селектор | задержка, мс | last (только последняя кнопка)',type:'text',def:rules}]});
const BUILTIN=[
 AC('b-claude-continue','Claude: нажимать «Продолжить»','Нажимает только ПОСЛЕДНЮЮ кнопку «Продолжить» и только когда чат прокручен вниз: старые кнопки выше не трогает.','claude.ai | Продолжить | 300 | last\nclaude.ai | Continue | 300 | last'),
 AC('b-cookies','Принимать окна cookie','Нажимает «Принять все» / «Accept all» в баннерах согласия на cookie.','* | Принять все | 800\n* | Принять все файлы cookie | 800\n* | Accept all | 800\n* | Accept all cookies | 800\n* | Allow all | 800'),
 AC('b-dismiss','Закрывать предложения подписки и уведомлений','Нажимает «Не сейчас», «Нет, спасибо», «No thanks», «Not now» во всплывающих окнах.','* | Не сейчас | 600\n* | Нет, спасибо | 600\n* | No thanks | 600\n* | Not now | 600\n* | Maybe later | 600'),
 AC('b-expand','Раскрывать «Читать далее» и «Показать ещё»','Автоматически раскрывает свёрнутые тексты и списки.','* | Читать далее | 500\n* | Показать ещё | 500\n* | Показать больше | 500\n* | Read more | 500\n* | Show more | 500\n* | See more | 500'),
 AC('b-yt-skip','YouTube: пропуск рекламы','Нажимает «Пропустить рекламу», как только кнопка активна.','youtube.com | .ytp-skip-ad-button | 200\nyoutube.com | .ytp-ad-skip-button-modern | 200\nyoutube.com | .ytp-ad-skip-button | 200'),
 AC('b-netflix-skip','Netflix: пропуск заставки и следующая серия','Нажимает «Пропустить заставку» и «Следующая серия».','netflix.com | Пропустить заставку | 300\nnetflix.com | Skip Intro | 300\nnetflix.com | Следующая серия | 300\nnetflix.com | Next Episode | 300'),
 AC('b-twitch-bonus','Twitch: собирать бонусные баллы канала','Нажимает на сундук с бонусом, когда он появляется.','twitch.tv | .claimable-bonus__icon | 500'),
 {id:'b-autoreload',name:'Автообновление страницы',desc:'Перезагружает страницу через заданное число секунд.',type:'js',builtin:true,match:['*'],runAt:'dom-ready',params:[{key:'seconds',label:'Интервал, секунд',type:'number',def:60}],
  code:"const s=Math.max(5,Number(MB.params.seconds)||60);MB.log('автообновление через',s,'с');setTimeout(()=>location.reload(),s*1000);"},
 {id:'b-keepalive',name:'Не давать странице «засыпать»',desc:'Периодически имитирует движение мыши, чтобы сайт не разлогинивал по бездействию.',type:'js',builtin:true,match:['*'],runAt:'dom-ready',params:[{key:'seconds',label:'Интервал, секунд',type:'number',def:45}],
  code:"setInterval(()=>{document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:Math.floor(Math.random()*40),clientY:Math.floor(Math.random()*40)}))},Math.max(5,Number(MB.params.seconds)||45)*1000);"},
 {id:'b-novideoauto',name:'Отключить автозапуск видео',desc:'Ставит на паузу видео и звук, которые запускаются сами (без твоего клика или клавиши): при открытии страницы, в ленте, при переходе к следующему ролику.',type:'js',builtin:true,match:['*'],runAt:'document-start',params:[],
  code:"(()=>{if(window.__mbNoAuto)return;window.__mbNoAuto=1;let last=0;const mark=()=>{last=Date.now()};for(const ev of ['pointerdown','mousedown','keydown','touchstart'])addEventListener(ev,mark,true);const allowed=()=>Date.now()-last<3000||(navigator.userActivation&&navigator.userActivation.isActive);const stop=v=>{try{if(!allowed()){v.autoplay=false;if(v.removeAttribute)v.removeAttribute('autoplay');v.pause()}}catch(e){}};for(const ev of ['play','playing','loadeddata','canplay'])document.addEventListener(ev,e=>{const v=e.target;if(v&&v.tagName&&/^(VIDEO|AUDIO)$/.test(v.tagName))stop(v)},true);const scan=()=>document.querySelectorAll('video,audio').forEach(v=>{if(!v.__mbS){v.__mbS=1;try{v.autoplay=false}catch(e){}}if(!v.paused)stop(v)});const start=()=>{scan();new MutationObserver(scan).observe(document,{childList:true,subtree:true});setInterval(scan,1200)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})();"},
 {id:'b-yt-speed',name:'YouTube: скорость воспроизведения',desc:'Задаёт скорость видео на YouTube (кроме рекламы).',type:'js',builtin:true,match:['youtube.com'],runAt:'dom-ready',params:[{key:'speed',label:'Скорость (1 = обычная)',type:'number',def:1.5}],
  code:"const sp=Number(MB.params.speed)||1;setInterval(()=>{const v=document.querySelector('video');if(v&&v.playbackRate!==sp&&!document.querySelector('.ad-showing'))v.playbackRate=sp},700);"},
 {id:'b-unlock-copy',name:'Разрешить копирование текста',desc:'Снимает запрет выделения и копирования на сайтах, где он включён. Вставку и перетаскивание не трогает.',type:'js',builtin:true,match:['*'],runAt:'dom-ready',params:[],
  code:"const st=document.createElement('style');st.textContent='*{user-select:text!important;-webkit-user-select:text!important}';(document.head||document.documentElement).append(st);for(const ev of ['copy','cut','contextmenu','selectstart'])document.addEventListener(ev,e=>e.stopImmediatePropagation(),true);"},
 {id:'b-autoscroll',name:'Автопрокрутка страницы',desc:'Плавно прокручивает страницу вниз с заданной скоростью.',type:'js',builtin:true,match:['*'],runAt:'dom-ready',params:[{key:'speed',label:'Скорость, пикселей в секунду',type:'number',def:40}],
  code:"let last=performance.now();const sp=Number(MB.params.speed)||40;const f=t=>{window.scrollBy(0,sp*(t-last)/1000);last=t;requestAnimationFrame(f)};requestAnimationFrame(f);"}
];
const allScripts=()=>[...BUILTIN,...scripts.map(x=>({...x,builtin:false,type:x.type==='autoclick'?'autoclick':'js'}))];
function favList(p){const ids=cfg.favScripts||[];if(!ids.length)return[];const all=allScripts(),en=p?enabledIds(p):[];return ids.map(id=>{const sc=all.find(x=>x.id===id);return sc?{id,name:sc.name,on:en.includes(id)}:null}).filter(Boolean)}
const enabledIds=p=>[...new Set([...(p.scripts||[]),...(p.presets||[]).map(x=>'b-'+x)])];
function scriptParams(sc,p){
 const o={};for(const x of sc.params||[])o[x.key]=x.def;const c=(p.scriptCfg||{})[sc.id];if(c)Object.assign(o,c);
 for(const x of sc.params||[]){if(x.type==='number')o[x.key]=Number(o[x.key])||0;else if(x.type==='bool')o[x.key]=o[x.key]===true||o[x.key]==='true'}
 return o;
}
function runAuto(text,url,run){
 const rules=[];
 for(const line of String(text).split(/\r?\n/)){const l=line.trim();if(!l||l[0]==='#')continue;
  const parts=l.split('|').map(x=>x.trim()),site=parts.length>1?parts[0]:'*',target=parts.length>1?parts[1]:parts[0],delay=parseInt(parts[2])||300,last=/^(last|последняя)$/i.test(parts[3]||'');
  if(target&&urlMatch(site,url))rules.push({target,delay,last})}
 if(rules.length)run(prelude()+';MB.autoclick('+JSON.stringify(rules)+');');
}
function userCode(sc,params){return prelude()+';MB.params='+JSON.stringify(params)+';(async()=>{try{\n'+(sc.code||'')+'\n}catch(e){console.error("[MB скрипт]",e)}})();'}
function runScripts(wc,pid,stage){
 if(wc.isDestroyed())return;const p=prof(pid);if(!p)return;const url=wc.getURL();if(!/^https?:/i.test(url))return;
 const run=code=>wc.executeJavaScript(code).catch(e=>log('script error: '+(e&&e.message)));
 if(stage==='dom-ready'&&p.autoclick&&p.autoclick.on&&p.autoclick.rules)runAuto(p.autoclick.rules,url,run);
 const all=allScripts();
 for(const id of enabledIds(p)){const sc=all.find(x=>x.id===id);if(!sc)continue;const params=scriptParams(sc,p);
  if(sc.type==='autoclick'){if(stage==='dom-ready')runAuto(params.rules||'',url,run);continue}
  if((sc.runAt||'dom-ready')!==stage)continue;
  if(!(sc.match&&sc.match.length?sc.match:['*']).some(m=>urlMatch(m,url)))continue;
  run(userCode(sc,params))}
}
// скрипты «в самом начале загрузки» (до скриптов сайта) и служебные вставки: через протокол отладки
async function setDocScript(t,key,source){
 const wc=t.view.webContents;if(wc.isDestroyed())return;t.ds=t.ds||{};t.dsq=t.dsq||{};const my=(t.dsq[key]=(t.dsq[key]||0)+1);
 try{
  try{wc.debugger.attach('1.3')}catch{}
  const old=t.ds[key];delete t.ds[key];
  if(source){await wc.debugger.sendCommand('Page.enable').catch(()=>{});const r=await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source});
   if(t.dsq[key]!==my){try{await wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:r.identifier})}catch{}}else t.ds[key]=r.identifier}
  if(old){try{await wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:old})}catch{}}
 }catch(e){log('docscript '+key+': '+e.message)}
}
function userDocStart(t,url){
 const p=prof(t.pid);if(!p||!/^https?:/i.test(url))return setDocScript(t,'user',null);
 const all=allScripts(),parts=[];
 for(const id of enabledIds(p)){const sc=all.find(x=>x.id===id);if(!sc||sc.type!=='js'||sc.runAt!=='document-start')continue;
  if(!(sc.match&&sc.match.length?sc.match:['*']).some(m=>urlMatch(m,url)))continue;parts.push(userCode(sc,scriptParams(sc,p)))}
 return setDocScript(t,'user',parts.length?parts.join('\n;'):null);
}
const favCache=new Map();
async function favFetch(t,icons){
 const u=(icons||[]).find(x=>/^https?:|^data:image\//i.test(x));if(!u)return;
 try{
  const key=t.pid+'|'+u;let data=favCache.get(key);
  if(!data){
   if(u.startsWith('data:'))data=u.slice(0,90000);
   else{const r=await t.view.webContents.session.fetch(u,{signal:AbortSignal.timeout(8000)});   // через соединение профиля, а не напрямую
    if(!r.ok)return;const ct=(r.headers.get('content-type')||'').split(';')[0];if(!/^image\//.test(ct))return;
    const b=Buffer.from(await r.arrayBuffer());if(!b.length||b.length>80000)return;data='data:'+ct+';base64,'+b.toString('base64')}
   if(favCache.size>400)favCache.clear();favCache.set(key,data)}
  t.favId=crypto.createHash('md5').update(data).digest('hex').slice(0,10);t.favData=data;
  if(t.W&&!t.W.dead){const c=curW;if(useW(t.W))pushTabs();if(c&&!c.dead)useW(c)}
 }catch{}
}
function sendFavs(){const W=curW;if(!W||!win||win.isDestroyed()||win.webContents.isDestroyed())return;W.favSent=W.favSent||new Set();const need={};
 for(const x of tabs)if(x.favId&&x.favData&&!W.favSent.has(x.favId)){need[x.favId]=x.favData;W.favSent.add(x.favId)}
 if(Object.keys(need).length)win.webContents.send('favdata',need)}
async function reconnectProfile(pid){   // после смены подключения: старый туннель закрывается, открытые вкладки идут по новому
 const p=prof(pid);if(!p)return;
 const old=tunnels.get(pid);if(old){tunnels.delete(pid);cleanup(old)}
 const pt=[];for(const W of windows){if(W.dead)continue;for(const t of W.tabs)if(!t.kind&&t.pid===pid)pt.push(t)}
 if(!pt.length)return;
 const parts=new Set(pt.map(t=>t.W.incognito?'inc-'+t.W.uid+'-'+pid:'persist:p-'+pid));
 try{
  let rules;
  if(needsTunnel(p)){const u=await tunnelFor(p);const tn=tunnels.get(pid);if(tn)tn.n=pt.length;rules={proxyRules:u}}
  else if(p.proxy)rules={proxyRules:`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`};else rules={mode:'direct'};
  for(const part of parts)await session.fromPartition(part).setProxy(rules);
  for(const t of pt)t.vpn=needsTunnel(p);
  reloadProfileTabs(pid);
 }catch(e){appDialog({title:'MultiBrowser',type:'error',message:e.message})}
}
function reloadProfileTabs(pid){for(const W of windows){if(W.dead)continue;for(const t of W.tabs)if(!t.kind&&t.pid===pid&&!t.view.webContents.isDestroyed()){try{t.view.webContents.reload()}catch{}}}}

// ---------- свои тёмные диалоги вместо системных белых окон ----------
let dlgN=0;const dlgs=new Map();
function appDialog(o){
 return new Promise(res=>{
  const parent=(windows.find(x=>!x.dead)||{}).win,id=++dlgN;
  const w=new BrowserWindow({parent:parent||undefined,modal:!!parent,width:450,height:200,frame:false,resizable:false,minimizable:false,maximizable:false,show:false,skipTaskbar:true,
   backgroundColor:bgColor(),icon:ICON,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});
  dlgs.set(id,{w,res});
  w.loadFile('ui/dialog.html',{query:{id:String(id),p:JSON.stringify({title:o.title||'MultiBrowser',message:String(o.message||''),detail:String(o.detail||''),input:o.input||'',buttons:o.buttons||['OK'],type:o.type||'info',defaultId:o.defaultId||0,cancelId:o.cancelId})}});
  w.once('ready-to-show',()=>w.show());
  w.on('closed',()=>{const d=dlgs.get(id);if(d){dlgs.delete(id);res({response:o.cancelId!=null?o.cancelId:(o.buttons?o.buttons.length-1:0)})}setTimeout(()=>{const W2=windows.find(x=>!x.dead);if(W2&&useW(W2))focusActive()},100)});
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
 if(!force&&Date.now()-adUpdated<2*864e5)return false;
 await loadEngine(true);
 const urls=['https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts','https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext'];
 let all='';for(const u of urls){try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(r.ok)all+='\n'+await r.text()}catch(e){log('adblock update: '+e.message)}}
 if(all.length<1000)return false;fs.writeFileSync(ADF(),all);adUpdated=Date.now();loadAds();return true}
const isAd=h=>{for(let x=h;x&&x.includes('.');x=x.slice(x.indexOf('.')+1))if(adSet.has(x))return true;return false};
let AdMod=null,adEngine=null,tldtsParse=null;
try{AdMod=require('@ghostery/adblocker')}catch(e){}
try{tldtsParse=require('tldts-experimental').parse}catch(e){}
const ADE=()=>path.join(DATA(),'adengine.bin');
const TYPEMAP={mainFrame:'main_frame',subFrame:'sub_frame',stylesheet:'stylesheet',script:'script',image:'image',font:'font',object:'object',xhr:'xmlhttprequest',ping:'ping',cspReport:'csp_report',media:'media',webSocket:'websocket',other:'other'};
async function loadEngine(force){
 if(!AdMod)return false;
 try{
  if(force)try{fs.rmSync(ADE(),{force:true})}catch{}
  adEngine=await AdMod.FiltersEngine.fromPrebuiltAdsAndTracking(fetch,{path:ADE(),read:fs.promises.readFile,write:fs.promises.writeFile});
  log('adblock engine ready');return true;
 }catch(e){log('adblock engine: '+e.message);return false}
}
// косметические фильтры и «скриптлеты» (в т.ч. для YouTube) вставляются до скриптов сайта
async function adCosmetics(t,url){
 if(!adEngine||!cfg.adblock||!/^https?:/i.test(url))return setDocScript(t,'ad',null);
 try{
  const u=new URL(url),dm=(tldtsParse?tldtsParse(u.hostname).domain:null)||u.hostname;
  const r=adEngine.getCosmeticsFilters({url,hostname:u.hostname,domain:dm,classes:[],hrefs:[],ids:[],getBaseRules:true,getInjectionRules:true,getExtendedRules:false,getRulesFromDOM:false,getRulesFromHostname:true});
  const parts=[];
  if(r.styles)parts.push("(()=>{const css="+JSON.stringify(r.styles)+";const add=()=>{const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)};if(document.documentElement)add();else new MutationObserver((m,o)=>{if(document.documentElement){o.disconnect();add()}}).observe(document,{childList:true})})();");
  for(const sc of r.scripts||[])parts.push(sc);
  await setDocScript(t,'ad',parts.length?parts.join('\n;'):null);
 }catch(e){log('cosmetics: '+e.message)}
}
const NO_BLOCK=new Set(['ipwho.is','api.ip.sb','ipinfo.io','ifconfig.co','api.country.is']);   // сервисы проверки IP: их использует сама программа
function adblockSession(ses,pid,key){
 key=key||pid;if(adHooked.has(key))return;adHooked.add(key);
 ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>{
  if(!cfg.adblock||d.resourceType==='mainFrame'||!d.webContentsId){cb({});return}   // запросы без страницы (проверка IP, расширения) не блокируем
  let h='';try{h=new URL(d.url).hostname.toLowerCase()}catch{cb({});return}
  if(NO_BLOCK.has(h)){cb({});return}
  let hit=false,redir=null;
  if(adEngine){try{
   const wc0=d.webContentsId?webContents.fromId(d.webContentsId):null,src=(wc0&&!wc0.isDestroyed()&&wc0.getURL())||d.referrer||'';
   const m=adEngine.match(AdMod.Request.fromRawDetails({url:d.url,sourceUrl:src,type:TYPEMAP[d.resourceType]||'other'}));
   if(m.match){hit=true;if(m.redirect&&m.redirect.dataUrl)redir=m.redirect.dataUrl}}catch(e){}}
  if(!hit&&isAd(h))hit=true;
  if(!hit){cb({});return}
  adCount++;
  for(const W of windows){const t=W.tabs.find(x=>!x.kind&&x.view.webContents.id===d.webContentsId);
   if(t){t.blocked=(t.blocked||0)+1;adPend.add(W);clearTimeout(adT);
    adT=setTimeout(()=>{const c=curW;for(const W2 of adPend){if(useW(W2))pushTabs()}adPend.clear();if(c&&!c.dead)useW(c)},500);break}}
  if(redir)cb({redirectURL:redir});else cb({cancel:true});   // заглушка вместо рекламного скрипта: плеер не ломается
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

// ---------- разрешения сайтов (камера, микрофон, геолокация, уведомления) ----------
const PERM_ASK={geolocation:'к вашему местоположению','media':'к камере и микрофону','display-capture':'к записи экрана',midi:'к MIDI-устройствам','clipboard-read':'к чтению буфера обмена'};
const permHooked=new Set();
function permSession(ses,pid,key){
 key=key||pid;if(permHooked.has(key))return;permHooked.add(key);
 ses.setPermissionRequestHandler((wc,perm,cb,details)=>{
  const p=prof(pid);if(!p){cb(false);return}
  if(perm==='notifications'){cb(p.notify!==false);return}
  const ask=PERM_ASK[perm];if(!ask){cb(true);return}
  let origin='';try{origin=new URL((details&&details.requestingUrl)||wc.getURL()).origin}catch{}
  const key=origin+'|'+perm,saved=(p.perms||{})[key];
  if(saved!==undefined){cb(saved);return}
  appDialog({title:'Разрешение сайта',message:origin.replace(/^https?:\/\//,'')+' запрашивает доступ '+ask,detail:'Профиль: '+p.name+'. Решение запомнится для этого сайта.',buttons:['Разрешить','Блокировать','Не сейчас'],defaultId:perm==='clipboard-read'?0:1,cancelId:2,type:'question'})
   .then(r=>{if(r.response===2){cb(false);return}const ok=r.response===0,l=load(),q=l.find(x=>x.id===pid);if(q){q.perms=q.perms||{};q.perms[key]=ok;save(l)}cb(ok)});
 });
 ses.setPermissionCheckHandler((wc,perm)=>{if(perm==='notifications'){const p=prof(pid);return !p||p.notify!==false}return true});
}

// ---------- перевод страницы ----------
const LANGS={ru:'русский',en:'английский',uk:'украинский',de:'немецкий',fr:'французский',es:'испанский',it:'итальянский',pl:'польский',tr:'турецкий','zh-CN':'китайский'};
const trSrc=n=>fs.readFileSync(path.join(__dirname,'ui',n),'utf8');
let msTok=null,msTokT=0;const MSLANG={'zh-CN':'zh-Hans'};
async function msToken(ses){
 if(msTok&&Date.now()-msTokT<8*60000)return msTok;
 const r=await ses.fetch('https://edge.microsoft.com/translate/auth',{credentials:'omit',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('авторизация переводчика: '+r.status);msTok=(await r.text()).trim();msTokT=Date.now();return msTok;
}
async function msBatch(ses,texts,to){
 const tok=await msToken(ses);
 const r=await ses.fetch('https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to='+encodeURIComponent(MSLANG[to]||to),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify(texts.map(Text=>({Text}))),credentials:'omit',signal:AbortSignal.timeout(25000)});
 if(!r.ok){if(r.status===401)msTok=null;throw new Error('переводчик ответил '+r.status)}
 const d=await r.json();return d.map(x=>(x.translations&&x.translations[0]&&x.translations[0].text)||null);
}
async function gtxGet(ses,text,to){
 const r=await ses.fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl='+encodeURIComponent(to)+'&q='+encodeURIComponent(text),{credentials:'omit',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('переводчик ответил '+r.status);const d=await r.json();return ((d&&d[0])||[]).map(x=>(x&&x[0])||'').join('');
}
async function translateTexts(ses,texts,to){
 const out=new Array(texts.length).fill(null);let i=0,viaMs=true;
 while(i<texts.length){
  let j=i,len=0;const idx=[];
  while(j<texts.length&&idx.length<80&&(len+texts[j].length<9000||!idx.length)){idx.push(j);len+=texts[j].length;j++}
  const batch=idx.map(k=>texts[k].replace(/\s+/g,' ').slice(0,4000));let res=null;
  if(viaMs){try{res=await msBatch(ses,batch,to)}catch(e){log('ms translate: '+e.message);viaMs=false}}
  if(!res){const rr=new Array(batch.length).fill(null);let q=0;
   await Promise.all(Array.from({length:6},async()=>{while(q<batch.length){const k=q++;try{rr[k]=await gtxGet(ses,batch[k],to)}catch(e){}}}));
   if(!rr.some(Boolean)&&i===0)throw new Error('переводчик недоступен');res=rr}
  idx.forEach((k,n)=>{out[k]=res[n]});i=j;
 }
 return out;
}
async function translateSelection(t,text){
 const to=cfg.translateTo||'ru';
 try{const [res]=await translateTexts(t.view.webContents.session,[text],to);
  const r=await appDialog({title:'Перевод',message:res||'(пусто)',detail:text.length>300?text.slice(0,300)+'…':text,buttons:['Копировать','Закрыть'],defaultId:1,cancelId:1,type:'info'});
  if(r.response===0)clipboard.writeText(res||'')
 }catch(e){appDialog({title:'Перевод',type:'error',message:'Не удалось перевести: '+e.message})}
}
async function translatePage(t,lang){
 if(!t||t.kind)return;const wc=t.view.webContents,W=t.W,to=lang||cfg.translateTo||'ru';
 try{
  t.loading=true;if(useW(W))pushTabs();
  const strs=await wc.executeJavaScript(trSrc('tr-collect.js'));
  if(!strs||!strs.length){t.loading=false;if(useW(W))pushTabs();return}
  const res=await translateTexts(wc.session,strs,to);
  await wc.executeJavaScript('window.__mbTrIn='+JSON.stringify(res)+';'+trSrc('tr-apply.js'));
  t.translated=true;
 }catch(e){log('translate: '+e.message);appDialog({title:'Перевод',type:'error',message:'Не удалось перевести страницу: '+e.message})}
 t.loading=false;if(useW(W))pushTabs();
}
async function translateToggle(t){
 if(!t||t.kind)return;
 if(t.translated){try{await t.view.webContents.executeJavaScript(trSrc('tr-restore.js'))}catch{}t.translated=false;if(useW(t.W))pushTabs()}
 else await translatePage(t);
}

// ---------- контекстное меню страницы (правая кнопка) ----------
function ctxMenu(t,pr){
 const wc=t.view.webContents,vb=t.view.getBounds?t.view.getBounds():{x:0,y:topH()},items=[],sel=(pr.selectionText||'').trim(),link=pr.linkURL,img=pr.mediaType==='image'&&pr.srcURL,f=pr.editFlags||{};
 const cut=x=>x.length>26?x.slice(0,26)+'…':x;
 if(pr.misspelledWord){for(const sg of (pr.dictionarySuggestions||[]).slice(0,5))items.push({label:sg,fn:()=>wc.replaceMisspelling(sg)});items.push({label:'Добавить в словарь',fn:()=>wc.session.addWordToSpellCheckerDictionary(pr.misspelledWord)},{type:'sep'})}
 if(link)items.push({label:'Открыть ссылку в новой вкладке',fn:()=>newTab(t.pid,link,cfg.openBg!==false,t.id)},{label:'Открыть ссылку в профиле…',fn:()=>profileMenu(null,link)},{label:'Копировать адрес ссылки',fn:()=>clipboard.writeText(link)},{type:'sep'});
 if(img)items.push({label:'Открыть изображение в новой вкладке',fn:()=>newTab(t.pid,pr.srcURL,cfg.openBg!==false,t.id)},{label:'Сохранить изображение как…',fn:()=>wc.downloadURL(pr.srcURL)},{label:'Копировать изображение',fn:()=>wc.copyImageAt(pr.x,pr.y)},{label:'Копировать адрес изображения',fn:()=>clipboard.writeText(pr.srcURL)},{type:'sep'});
 if(pr.isEditable)items.push({label:'Отменить',hint:'Ctrl+Z',disabled:!f.canUndo,fn:()=>wc.undo()},{label:'Вырезать',hint:'Ctrl+X',disabled:!f.canCut,fn:()=>wc.cut()},{label:'Копировать',hint:'Ctrl+C',disabled:!f.canCopy,fn:()=>wc.copy()},{label:'Вставить',hint:'Ctrl+V',disabled:!f.canPaste,fn:()=>wc.paste()},{label:'Выделить всё',hint:'Ctrl+A',fn:()=>wc.selectAll()},{type:'sep'});
 else if(sel)items.push({label:'Копировать',hint:'Ctrl+C',fn:()=>wc.copy()},{label:'Найти «'+cut(sel)+'» в поиске',fn:()=>newTab(t.pid,searchUrl()+encodeURIComponent(sel),cfg.openBg!==false,t.id)},{label:'Перевести выделенное на '+(LANGS[cfg.translateTo]||'русский'),fn:()=>translateSelection(t,sel)},{type:'sep'});
 if(!link&&!img&&!sel&&!pr.isEditable){const nh=wc.navigationHistory;
  items.push({label:'Назад',hint:'Alt+←',disabled:!nh.canGoBack(),fn:()=>nh.goBack()},{label:'Вперёд',hint:'Alt+→',disabled:!nh.canGoForward(),fn:()=>nh.goForward()},{label:'Обновить',hint:'F5',fn:()=>wc.reload()},{type:'sep'})}
 items.push({label:t.translated?'Показать оригинал':'Перевести на '+(LANGS[cfg.translateTo]||'русский'),fn:()=>translateToggle(t)},{label:(darkWanted(wc.getURL())?'Выключить':'Включить')+' тёмную тему сайта',fn:()=>toggleSiteDark(t)},
  {label:'Печать…',hint:'Ctrl+P',fn:()=>wc.print()},{label:'Просмотр кода страницы',hint:'Ctrl+U',fn:()=>newTab(t.pid,'view-source:'+wc.getURL())},{label:'Исследовать элемент',hint:'F12',fn:()=>wc.inspectElement(pr.x,pr.y)});
 showMenu(items,{x:vb.x+pr.x,y:vb.y+pr.y,align:'left'});
}

// ---------- перетаскивание вкладок между окнами ----------
let drag=null;
let focusSeq=0;
const cursorPt=(x,y)=>{try{const q=screen.getCursorScreenPoint();if(q&&Number.isFinite(q.x)&&Number.isFinite(q.y))return q}catch{}return{x,y}};
// Куда упадёт вкладка: берём самое верхнее видимое окно под курсором (свёрнутые не считаются);
// вкладка вставляется только если курсор над его строкой вкладок, место вставки считается по положению курсора между вкладками.
function dropTarget(x,y,exclude){
 const cand=windows.filter(W=>!W.dead&&W!==exclude&&W.win&&!W.win.isDestroyed()&&W.win.isVisible()&&!(W.win.isMinimized&&W.win.isMinimized())).sort((a,b)=>(b.fseq||0)-(a.fseq||0));
 for(const W of cand){
  const b=W.win.getBounds();
  if(x<b.x||x>=b.x+b.width||y<b.y||y>=b.y+b.height)continue;     // курсор не над этим окном
  if(exclude&&!!W.incognito!==!!exclude.incognito)return null;    // обычные и инкогнито окна не смешиваются
  const top=W.mode==='top';
  if(top?y>b.y+44:x>b.x+240)return null;                          // над окном, но не над строкой вкладок: оно закрывает окна под собой
  const cb=W.win.getContentBounds(),pos=top?x-cb.x:y-cb.y,g=W.strip||[];
  let idx=0;for(const r of g){if(pos>(r[0]+r[1])/2)idx++}
  return{W,idx,line:idx<g.length?g[idx][0]:(g.length?g[g.length-1][1]:0)};
 }
 return null;
}
ipcMain.on('stripGeom',(e,g)=>{const W=windows.find(w=>!w.dead&&w.win.webContents===e.sender);if(W&&Array.isArray(g))W.strip=g.slice(0,300).map(r=>[+r[0]||0,+r[1]||0])});
function moveTabToWindow(t,from,to,idx){
 useW(from);const i=tabs.indexOf(t);if(i<0)return;
 tabs.splice(i,1);try{win.contentView.removeChildView(t.view)}catch{}
 if(active===t.id)setActive(tabs.length?tabs[Math.max(0,i-1)].id:null);layout();pushTabs();
 t.W=to;useW(to);tabs.splice(idx==null?tabs.length:idx,0,t);setActive(t.id);win.contentView.addChildView(t.view);layout();pushTabs();to.win.focus();focusSoon();updateBadges();
 if(!from.tabs.length&&!from.dead&&windows.filter(x=>!x.dead).length>1)from.win.close();
}

function moveTabsToWindow(list,from,to,idx){
 if(!list.length)return;let at=idx;
 for(const t of list){moveTabToWindow(t,from,to,at);if(at!=null)at++}
 if(to&&!to.dead){useW(to);setActive(list[0].id);layout();pushTabs();focusSoon()}
}
function moveGroup(ids,from,to){const list=ids.map(i=>from.tabs.find(t=>t.id===i)).filter(Boolean);if(list.length)moveTabsToWindow(list,from,to,null)}
function winItems(ids){
 const from=curW,items=[];if(!from||from.incognito)return items;
 for(const W of windows){if(W.dead||W===from||W.incognito)continue;
  const at=W.tabs.find(x=>x.id===W.active),title=(at&&(at.kind?PAGES[at.kind].title:at.title))||('Окно '+(windows.indexOf(W)+1));
  items.push({label:'Переместить в окно «'+String(title).slice(0,38)+'» ('+W.tabs.length+')',fn:()=>moveGroup(ids,from,W)})}
 return items;
}
// ---------- вкладки: поиск, закрепление, окна инкогнито, очистка ----------
function focusTab(W,t){if(!useW(W))return;setActive(t.id);layout();pushTabs();focusSoon();try{if(W.win.isMinimized())W.win.restore();W.win.focus()}catch{}}
function tabSearch(anchor){
 const items=[];
 for(const W of windows){if(W.dead)continue;for(const t of W.tabs){const p=t.kind?null:prof(t.pid),title=t.kind?PAGES[t.kind].title:(t.title||t.url||'Новая вкладка');
  items.push({label:title,color:t.kind?'#8b93a5':colorOf(t.pid),letter:t.kind?PAGES[t.kind].icon:(p?p.name[0].toUpperCase():'?'),tag:p?p.name:'',fn:()=>focusTab(W,t)})}}
 if(items.length)showMenu(items,anchor||{x:200,y:44,align:'left'},{search:true,placeholder:'Найти вкладку…'});
}
function openIncognito(pid){const W=createWindow({incognito:true,instant:true});useW(W);return newTab(pid)}
function incognitoFlow(){const t=cur();if(t&&!t.kind)openIncognito(t.pid);else profileMenu(null,null,true)}
function newWindowFlow(){const t=cur(),pid=t&&!t.kind?t.pid:null,inc=!!(curW&&curW.incognito),W=createWindow({instant:true,incognito:inc});useW(W);if(pid)newTab(pid);else openPage('manager')}
function pinTab(id){const t=tabs.find(x=>x.id===id);if(!t)return;t.pinned=!t.pinned;const pin=tabs.filter(x=>x.pinned),rest=tabs.filter(x=>!x.pinned);tabs.splice(0,tabs.length,...pin,...rest);pushTabs()}
function moveActive(d){const i=tabs.findIndex(x=>x.id===active),j=i+d;if(i<0||j<0||j>=tabs.length)return;const [t]=tabs.splice(i,1);tabs.splice(j,0,t);pushTabs()}
async function clearDataFlow(){
 const t=cur();if(!t||t.kind){appDialog({message:'Открой страницу профиля, данные которого нужно очистить.'});return}
 const p=prof(t.pid),r=await appDialog({title:'Очистка данных',message:'Очистить данные профиля «'+(p?p.name:'?')+'»?',detail:'Кэш удаляется без последствий. Куки и хранилище сайтов удалят входы во все аккаунты этого профиля.',buttons:['Очистить кэш','Кэш и куки','Отмена'],defaultId:0,cancelId:2,type:'question'});
 if(r.response===2)return;const ses=t.view.webContents.session;
 try{await ses.clearCache();if(r.response===1)await ses.clearStorageData();reloadProfileTabs(t.pid)}catch(e){appDialog({type:'error',message:'Не удалось очистить: '+e.message})}
}
function savePage(w){dialog.showSaveDialog(win,{defaultPath:(w.getTitle()||'page').replace(/[\\/:*?"<>|]/g,'_')+'.html',filters:[{name:'Веб-страница, полностью',extensions:['html']}]}).then(r=>{if(!r.canceled&&r.filePath)w.savePage(r.filePath,'HTMLComplete').catch(()=>{})})}
const hostOf=u=>{try{return new URL(u).hostname}catch{return ''}};
const navTo=text=>{const t=cur();hideMenu();if(t&&!t.kind)t.view.webContents.loadURL(norm(text))};

// ---------- расширения Chrome (установка по ссылке или идентификатору) ----------
const EXD=()=>path.join(DATA(),'extensions'),extLoaded=new Map();
function extName(dir,m){
 const mm=/^__MSG_(.+)__$/.exec(m.name||'');if(!mm)return m.name||'';
 for(const lang of [m.default_locale,'ru','en','en_US']){if(!lang)continue;
  try{const j=JSON.parse(fs.readFileSync(path.join(dir,'_locales',lang,'messages.json'),'utf8')),k=Object.keys(j).find(x=>x.toLowerCase()===mm[1].toLowerCase());if(k&&j[k].message)return j[k].message}catch{}}
 return m.name;
}
function extList(){
 try{return fs.readdirSync(EXD(),{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-p]{32}$/.test(d.name)).map(d=>{const dir=path.join(EXD(),d.name);
  try{const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));return{id:d.name,name:extName(dir,m)||d.name,version:m.version||'',mv:m.manifest_version||0}}catch{return{id:d.name,name:d.name,version:'',mv:0}}})}
 catch{return[]}
}
function unzipTo(buf,dir){
 let off=0;if(buf.toString('latin1',0,4)==='Cr24'){const v=buf.readUInt32LE(4);off=v===3?12+buf.readUInt32LE(8):16+buf.readUInt32LE(8)+buf.readUInt32LE(12)}
 const z=buf.subarray(off);let e=-1;
 for(let i=z.length-22;i>=Math.max(0,z.length-70000);i--){if(z.readUInt32LE(i)===0x06054b50){e=i;break}}
 if(e<0)throw new Error('это не архив расширения');
 const n=z.readUInt16LE(e+10);let q=z.readUInt32LE(e+16);const zlib=require('zlib'),root=path.resolve(dir)+path.sep;
 for(let k=0;k<n;k++){
  if(z.readUInt32LE(q)!==0x02014b50)throw new Error('архив повреждён');
  const method=z.readUInt16LE(q+10),csz=z.readUInt32LE(q+20),nl=z.readUInt16LE(q+28),el=z.readUInt16LE(q+30),cl=z.readUInt16LE(q+32),lo=z.readUInt32LE(q+42);
  const name=z.toString('utf8',q+46,q+46+nl);q+=46+nl+el+cl;if(name.endsWith('/'))continue;
  const lnl=z.readUInt16LE(lo+26),lel=z.readUInt16LE(lo+28),ds=lo+30+lnl+lel,data=z.subarray(ds,ds+csz),out=path.resolve(dir,name);
  if(!out.startsWith(root))continue;   // защита от выхода за пределы папки
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,method===0?data:zlib.inflateRawSync(data));
 }
}
async function extFetchCrx(id){
 const url='https://clients2.google.com/service/update2/crx?response=redirect&prodversion='+CHR+'&acceptformat=crx2,crx3&x='+encodeURIComponent('id='+id+'&installsource=ondemand&uc');
 const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Не удалось скачать расширение (код '+r.status+')');
 const buf=Buffer.from(await r.arrayBuffer());if(buf.length<1000)throw new Error('Магазин не отдал файл расширения');return buf;
}
async function extInstall(input){
 const m=String(input||'').match(/[a-p]{32}/);if(!m)throw new Error('Не найден идентификатор расширения (32 буквы). Вставь ссылку из Chrome Web Store или сам идентификатор.');
 const id=m[0],buf=await extFetchCrx(id);
 const dir=path.join(EXD(),id);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});unzipTo(buf,dir);
 if(!fs.existsSync(path.join(dir,'manifest.json')))throw new Error('В архиве нет manifest.json');
 return id;
}
async function extUpdateAll(){   // раз в сутки: скачиваем расширения заново и заменяем, если версия новее
 const res=[];
 for(const x of extList()){
  const tmp=path.join(EXD(),'.tmp-'+x.id);
  try{const buf=await extFetchCrx(x.id);fs.rmSync(tmp,{recursive:true,force:true});fs.mkdirSync(tmp,{recursive:true});unzipTo(buf,tmp);
   const mf=JSON.parse(fs.readFileSync(path.join(tmp,'manifest.json'),'utf8'));
   if(mf.version&&mf.version!==x.version){const dir=path.join(EXD(),x.id);fs.rmSync(dir,{recursive:true,force:true});fs.renameSync(tmp,dir);res.push({id:x.id,name:x.name,from:x.version,to:mf.version})}
   else fs.rmSync(tmp,{recursive:true,force:true});
  }catch(e){try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}log('ext update '+x.id+': '+e.message)}
 }
 if(res.length){const ids=new Set(res.map(r=>r.id));
  for(const [part,m] of extLoaded)for(const id of ids){const e0=m.get(id);if(e0){try{const sx=session.fromPartition(part);await (sx.extensions||sx).removeExtension(e0.id)}catch{}m.delete(id)}}
  for(const q of load()){if(!(q.exts||[]).some(id=>ids.has(id)))continue;const part='persist:p-'+q.id;if(extLoaded.has(part)){await loadExts(session.fromPartition(part),q,part).catch(()=>{});reloadProfileTabs(q.id)}}
  log('extensions updated: '+res.map(r=>r.name+' '+r.from+'→'+r.to).join(', '));
 }
 return res;
}
async function loadExts(ses,p,part){
 let m=extLoaded.get(part);if(!m){m=new Map();extLoaded.set(part,m)}
 for(const id of p.exts||[]){if(m.has(id))continue;const dir=path.join(EXD(),id);if(!fs.existsSync(dir))continue;
  try{m.set(id,await (ses.extensions||ses).loadExtension(dir,{allowFileAccess:true}))}catch(e){log('extension '+id+': '+e.message)}}
}

// ---------- уведомления сайтов: запрос разрешения и показ через Windows ----------
function notifyState(p,url){if(p.notify===false)return 'denied';let o='';try{o=new URL(url).origin}catch{}const v=(p.notifyPerms||{})[o];return v===true?'granted':v===false?'denied':'default'}
// вставка в начале каждой страницы: свой Notification (запрос разрешения и показ через Windows) и Ctrl+клик по ссылкам.
// Связь со страницей идёт через console.log (без протокола отладки и без лишних объектов на странице)
function notifyShim(C){return `(()=>{try{
 if(window.__mbN||!/^https?:$/.test(location.protocol))return;window.__mbN=1;
 const CF=${JSON.stringify(C)},LOG=console.log.bind(console);
 const st=()=>{if(!CF.on)return 'denied';const v=CF.m[location.origin];return v===true?'granted':v===false?'denied':'default'};let perm=st();
 const send=o=>{try{LOG('\\u0001MBN'+JSON.stringify(o))}catch(e){}};window.__mbPermCb={};window.__mbNotes={};let nid=0;window.__mbSetPerm=v=>{perm=v};
 // счётчик на значке в панели задач (Badging API): сообщаем программе, она сама показывает и убирает число
 try{const sendB=n=>{try{LOG('\\u0001MBB'+JSON.stringify({n}))}catch(e){}};
  Object.defineProperty(Navigator.prototype,'setAppBadge',{value:function setAppBadge(n){sendB(n==null?-1:(Number(n)||0));return Promise.resolve()},writable:true,configurable:true,enumerable:true});
  Object.defineProperty(Navigator.prototype,'clearAppBadge',{value:function clearAppBadge(){sendB(0);return Promise.resolve()},writable:true,configurable:true,enumerable:true})}catch(e){}
 class N extends EventTarget{
  constructor(title,o){super();o=o||{};this.title=String(title);this.body=o.body||'';this.tag=o.tag||'';this.icon=o.icon||'';this.data=o.data;this.onclick=null;this.onshow=null;this.onclose=null;this.onerror=null;
   const id=++nid;this.__id=id;window.__mbNotes[id]=this;
   if(perm==='granted'){send({t:'show',id,title:this.title,body:this.body});setTimeout(()=>{const e=new Event('show');this.dispatchEvent(e);if(this.onshow)this.onshow(e)},0)}
   else setTimeout(()=>{const e=new Event('error');this.dispatchEvent(e);if(this.onerror)this.onerror(e)},0)}
  close(){delete window.__mbNotes[this.__id]}
  static get permission(){return perm}
  static get maxActions(){return 0}
  static requestPermission(cb){return new Promise(res=>{if(perm!=='default'){if(cb)cb(perm);res(perm);return}
   const id=Math.random().toString(36).slice(2);window.__mbPermCb[id]=r=>{perm=r;if(cb)cb(r);res(r)};send({t:'ask',id})})}}
 try{Object.defineProperty(window,'Notification',{value:N,configurable:true,writable:true})}catch(e){}
 try{const q=navigator.permissions&&navigator.permissions.query.bind(navigator.permissions);if(q)navigator.permissions.query=d=>(d&&d.name==='notifications')?Promise.resolve({state:perm==='default'?'prompt':perm,onchange:null,addEventListener(){},removeEventListener(){}}):q(d)}catch(e){}
 try{if(window.ServiceWorkerRegistration)ServiceWorkerRegistration.prototype.showNotification=function(t,o){o=o||{};if(perm==='granted')send({t:'show',id:0,title:String(t),body:o.body||''});return Promise.resolve()}}catch(e){}
 // запасной путь вставки картинки (скриншот в буфере): если страница не получила её штатно, программа сама отдаёт её странице
 let lastPaste=0,sentP=0;const askP=()=>{if(Date.now()-sentP>400){sentP=Date.now();LOG('\\u0001MBP')}};
 document.addEventListener('paste',e=>{if(!e.isTrusted)return;lastPaste=Date.now();const d=e.clipboardData;if(!d)return;if(d.files&&d.files.length)return;const ty=[...(d.types||[])];if(ty.some(t=>t==='text/plain'||t==='text/html'||t==='Files'))return;askP()},true);
 document.addEventListener('keydown',e=>{if(!e.isTrusted)return;if(((e.ctrlKey||e.metaKey)&&e.code==='KeyV')||(e.shiftKey&&e.code==='Insert')){const t0=Date.now();setTimeout(()=>{if(lastPaste<t0)askP()},250)}},true);
 if(window===window.top){
  document.addEventListener('click',e=>{const t=e.target;if(!t||t.tagName!=='INPUT'||t.type!=='file'||t.disabled||t.webkitdirectory||window.__mbSkip||e.defaultPrevented)return;
   e.preventDefault();const L=window.__mbFI=window.__mbFI||[];const id=L.push(t)-1;LOG('\\u0001MBF'+JSON.stringify({id,multiple:!!t.multiple,accept:t.accept||''}))},true);
  window.__mbFileNative=id=>{const t=(window.__mbFI||[])[id];if(t){window.__mbSkip=1;try{t.click()}finally{window.__mbSkip=0}}};
 }
 document.addEventListener('click',e=>{if(e.button!==0||!(e.ctrlKey||e.metaKey))return;let a=e.target;while(a&&a.nodeType===1&&a.tagName!=='A')a=a.parentElement;
  if(!a||!a.href||!/^https?:/i.test(a.href))return;e.preventDefault();e.stopImmediatePropagation();LOG('\\u0001MBL'+JSON.stringify({u:a.href,bg:!e.shiftKey}))},true);
}catch(e){}})();`}
function pasteImage(wc,frame){
 try{const img=clipboard.readImage();if(!img||img.isEmpty())return;const png=img.toPNG();if(!png.length||png.length>25e6)return;
  const js='(()=>{const b=atob('+JSON.stringify(png.toString('base64'))+'),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);const f=new File([u],"image.png",{type:"image/png"}),dt=new DataTransfer();dt.items.add(f);(document.activeElement||document.body).dispatchEvent(new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true,composed:true}))})()';
  (frame&&frame.executeJavaScript?frame:wc).executeJavaScript(js).then(()=>log('paste image: sent '+png.length+' bytes')).catch(e=>log('paste image failed: '+e.message));
 }catch(e){log('paste image: '+e.message)}
}
async function openDlg(w,o){   // диалог выбора файла: открывается в папке, откуда файл брали в прошлый раз
 o={...(o||{})};if(!o.defaultPath){const d=cfg.lastFileDir;if(d&&fs.existsSync(d))o.defaultPath=d}
 const r=await (w?dialog.showOpenDialog(w,o):dialog.showOpenDialog(o));
 if(!r.canceled&&r.filePaths&&r.filePaths[0]&&!(o.properties||[]).includes('openDirectory')){cfg.lastFileDir=path.dirname(r.filePaths[0]);saveCfg()}
 return r;
}
function acceptFilters(acc){
 const ext=new Set(),M={'image/*':['png','jpg','jpeg','gif','webp','bmp','svg','avif','heic'],'video/*':['mp4','webm','mov','mkv','avi','m4v'],'audio/*':['mp3','wav','ogg','m4a','flac','aac'],'application/pdf':['pdf'],'text/plain':['txt'],'text/csv':['csv'],'application/json':['json'],'application/zip':['zip']};
 for(let tok of String(acc||'').split(',')){tok=tok.trim().toLowerCase();if(!tok)continue;if(tok.startsWith('.'))ext.add(tok.slice(1).replace(/[^a-z0-9]/g,''));else if(M[tok])M[tok].forEach(x=>ext.add(x))}
 const f=[];if(ext.size)f.push({name:'Подходящие файлы',extensions:[...ext].filter(Boolean)});f.push({name:'Все файлы',extensions:['*']});return f;
}
async function fileChooser(t,wc,m){   // окно выбора файла для <input type=file>: страница просит, программа показывает диалог и подставляет файлы
 if(wc.isDestroyed())return;
 const r=await openDlg(t.W&&!t.W.dead?t.W.win:undefined,{properties:['openFile',...(m.multiple?['multiSelections']:[])],filters:acceptFilters(m.accept)});
 if(r.canceled||!r.filePaths||!r.filePaths.length)return;
 try{
  const setFiles=async()=>{const ev=await wc.debugger.sendCommand('Runtime.evaluate',{expression:'(window.__mbFI||[])['+Number(m.id)+']'});
   if(!ev||!ev.result||!ev.result.objectId)throw new Error('поле не найдено');
   await wc.debugger.sendCommand('DOM.setFileInputFiles',{objectId:ev.result.objectId,files:r.filePaths})};
  try{await setFiles()}catch(e1){await wc.debugger.sendCommand('DOM.enable');await setFiles()}   // в части версий Chromium для этого нужен включённый домен DOM
 }catch(e){log('file input: '+e.message);try{await wc.executeJavaScript('window.__mbFileNative&&window.__mbFileNative('+Number(m.id)+')')}catch{}}   // запасной путь: обычное окно Chromium
}
function tabByWc(wc){for(const W of windows)for(const t of W.tabs)if(!t.kind&&t.view.webContents===wc)return t;return null}
function notifyDoc(t){const p=prof(t.pid);if(!p)return;return setDocScript(t,'notify',notifyShim({on:p.notify!==false,m:p.notifyPerms||{}}))}
function notifyDocAll(pid){for(const W of windows){if(W.dead)continue;for(const t of W.tabs)if(!t.kind&&t.pid===pid&&!t.view.webContents.isDestroyed())notifyDoc(t)}}
function setNotifyPerm(t,val){
 const u=t.view.webContents.getURL();let o='';try{o=new URL(u).origin}catch{return}const l=load(),q=l.find(x=>x.id===t.pid);if(!q)return;
 q.notifyPerms=q.notifyPerms||{};if(val===null)delete q.notifyPerms[o];else q.notifyPerms[o]=val;save(l);notifyDocAll(t.pid);
 try{t.view.webContents.executeJavaScript('window.__mbSetPerm&&window.__mbSetPerm('+JSON.stringify(val===true?'granted':val===false?'denied':'default')+')').catch(()=>{})}catch{}
}
function notifyMenuItems(t){
 const p=prof(t.pid),u=t.view.webContents.getURL();if(!p||!/^https?:/i.test(u))return[];
 if(p.notify===false)return[{label:'Уведомления выключены в настройках профиля',type:'header'}];
 const st=notifyState(p,u),name={granted:'разрешены',denied:'заблокированы',default:'по запросу сайта'}[st],items=[{label:'Уведомления этого сайта: '+name,type:'header'}];
 if(st!=='granted')items.push({label:'Разрешить уведомления этому сайту',fn:()=>setNotifyPerm(t,true)});
 if(st!=='denied')items.push({label:'Заблокировать уведомления этого сайта',fn:()=>setNotifyPerm(t,false)});
 if(st!=='default')items.push({label:'Сбросить решение об уведомлениях',fn:()=>setNotifyPerm(t,null)});
 return items;
}
const notifyRate=new Map();
async function notifyMsg(wc,payload,frame){
 let m;try{m=JSON.parse(payload)}catch{return}const t=tabByWc(wc);if(!t)return;const p=prof(t.pid);if(!p)return;
 let origin='';try{origin=new URL(wc.getURL()).origin}catch{}
 const exec=js=>{try{return(frame&&frame.executeJavaScript?frame:wc).executeJavaScript(js).catch(()=>{})}catch{return Promise.resolve()}};
 if(m.t==='ask'){
  let ans='denied';
  if(p.notify!==false){const saved=(p.notifyPerms||{})[origin];
   if(saved!==undefined)ans=saved?'granted':'denied';
   else{const r=await appDialog({title:'Уведомления',message:origin.replace(/^https?:\/\//,'')+' просит разрешение показывать уведомления',detail:'Профиль: '+p.name+'. Решение запомнится для этого сайта; изменить его можно в меню ⋮.',buttons:['Разрешить','Блокировать'],defaultId:0,cancelId:1,type:'question'});
    ans=r.response===0?'granted':'denied';const l=load(),q=l.find(x=>x.id===t.pid);if(q){q.notifyPerms=q.notifyPerms||{};q.notifyPerms[origin]=ans==='granted';save(l);notifyDocAll(t.pid)}}}
  const idj=JSON.stringify(String(m.id));
  await exec('window.__mbPermCb&&window.__mbPermCb['+idj+']&&window.__mbPermCb['+idj+']('+JSON.stringify(ans)+')');
 }else if(m.t==='show'){
  if(notifyState(p,wc.getURL())!=='granted')return;
  const now=Date.now(),r=(notifyRate.get(wc.id)||[]).filter(x=>now-x<10000);if(r.length>=5)return;r.push(now);notifyRate.set(wc.id,r);
  try{const n=new Notification({title:String(m.title||'').slice(0,120),body:String(m.body||'').slice(0,400)});
   n.on('click',()=>{if(t.W&&!t.W.dead){focusTab(t.W,t);if(m.id)exec('(()=>{const n=window.__mbNotes&&window.__mbNotes['+Number(m.id)+'];if(n){const e=new Event("click");n.dispatchEvent(e);if(n.onclick)n.onclick(e)}})()')}});
   n.show()}catch(e){log('notify: '+e.message)}
 }
}

// ---------- закладки: менеджер, папки, импорт и экспорт ----------
function parseBookmarksHtml(html){
 const out=[],stack=[];let pending='';
 const re=/<(\/?)DL[^>]*>|<H3[^>]*>([\s\S]*?)<\/H3>|<A\s[^>]*?HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi;let m;
 const dec=x=>x.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
 while((m=re.exec(html))){
  const tag=m[0].toLowerCase();
  if(tag.startsWith('<dl')||tag.startsWith('</dl')){if(m[1])stack.pop();else{stack.push(pending);pending=''}}
  else if(m[2]!==undefined)pending=dec(m[2]);
  else if(m[3]!==undefined){const url=m[3].replace(/&amp;/g,'&');if(!/^(https?|file):/i.test(url))continue;
   let f=stack.filter(Boolean).pop()||'';if(/^(bookmarks bar|панель закладок|закладки)$/i.test(f))f='';
   out.push({title:dec(m[4])||url,url,folder:f})}
 }
 return out;
}
function bookmarksHtml(){
 const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),by={};
 for(const b of bookmarks)(by[b.folder||'']=by[b.folder||'']||[]).push(b);
 const line=b=>'    <DT><A HREF="'+esc(b.url)+'" ADD_DATE="'+Math.floor((b.t||Date.now())/1000)+'">'+esc(b.title||b.url)+'</A>\n';
 let h='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
 for(const b of by['']||[])h+=line(b);
 for(const f of Object.keys(by).filter(Boolean)){h+='    <DT><H3>'+esc(f)+'</H3>\n    <DL><p>\n';for(const b of by[f])h+='  '+line(b);h+='    </DL><p>\n'}
 return h+'</DL><p>\n';
}
function openTabNear(url,bg){const t=cur();if(t&&!t.kind)newTab(t.pid,url,!!bg,t.id);else openUrl(url)}

// ---------- несколько выбранных вкладок ----------
function detachTabs(ids){
 const sel=ids.map(id=>tabs.find(t=>t.id===id)).filter(Boolean);if(!sel.length||tabs.length<=sel.length)return;
 const pt=screen.getCursorScreenPoint(),src=curW;
 for(const t of sel){const i=tabs.indexOf(t);if(i>=0)tabs.splice(i,1);try{win.contentView.removeChildView(t.view)}catch{}}
 if(!tabs.some(t=>t.id===active))setActive(tabs[0].id);layout();pushTabs();
 const W2=createWindow({bounds:{x:Math.round(pt.x-220),y:Math.round(pt.y-18),width:1100,height:760},instant:true});
 W2.mode=src.mode;for(const t of sel){t.W=W2;W2.tabs.push(t)}W2.active=sel[0].id;useW(W2);for(const t of sel)W2.win.contentView.addChildView(t.view);layout();pushTabs();
}
function tabsAction(ids,action){
 const ts=(ids||[]).map(id=>tabs.find(t=>t.id===id)).filter(Boolean);if(!ts.length)return;
 if(action==='close'){for(const t of ts)closeTab(t.id)}
 else if(action==='window')detachTabs(ts.map(t=>t.id));
 else if(action==='pin'){const on=!ts.every(t=>t.pinned);for(const t of ts)t.pinned=on;const pin=tabs.filter(x=>x.pinned),rest=tabs.filter(x=>!x.pinned);tabs.splice(0,tabs.length,...pin,...rest);pushTabs()}
 else if(action==='mute'){const pg=ts.filter(t=>!t.kind),on=!pg.every(t=>t.view.webContents.isAudioMuted());for(const t of pg){t.view.webContents.setAudioMuted(on);t.muted=on}pushTabs()}
 else if(action==='reload'){for(const t of ts)if(!t.kind)t.view.webContents.reload()}
 else if(action==='duplicate'){for(const t of ts)if(!t.kind)newTab(t.pid,t.view.webContents.getURL()||t.url,true,t.id)}
 else if(action==='bookmark'){const fname='Вкладки '+new Date().toLocaleDateString('ru-RU');
  for(const t of ts){if(t.kind)continue;const u=t.view.webContents.getURL()||t.url;if(!/^(https?|file):/i.test(u)||bookmarks.some(b=>b.url===u&&(b.folder||'')===fname))continue;bookmarks.push({id:uid(),title:t.title||u,url:u,folder:fname,t:Date.now()})}
  saveBm();pushBm();pushTabs()}
}

// ---------- резервные копии (шифруются паролем) ----------
const BKM='MBBK1';
function bkEncrypt(obj,pw){const salt=crypto.randomBytes(16),key=crypto.scryptSync(pw,salt,32),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=require('zlib').gzipSync(Buffer.from(JSON.stringify(obj))),enc2=Buffer.concat([c.update(data),c.final()]);return Buffer.concat([Buffer.from(BKM),salt,iv,c.getAuthTag(),enc2])}
function bkDecrypt(buf,pw){
 if(buf.subarray(0,5).toString()!==BKM)throw new Error('Это не файл резервной копии MultiBrowser');
 const salt=buf.subarray(5,21),iv=buf.subarray(21,33),tag=buf.subarray(33,49),data=buf.subarray(49),key=crypto.scryptSync(pw,salt,32),d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);
 let raw;try{raw=Buffer.concat([d.update(data),d.final()])}catch{throw new Error('Неверный пароль или файл повреждён (проверь пароль)')}
 return JSON.parse(require('zlib').gunzipSync(raw).toString('utf8'));
}
async function backupData(){
 const profiles=load().map(q=>{const c=JSON.parse(JSON.stringify(q));if(c.vpn)c.vpn=dec(c.vpn);if(c.proxy&&c.proxy.pass)c.proxy.pass=dec(c.proxy.pass);return c}),cookies={};
 for(const q of profiles){try{cookies[q.id]=await session.fromPartition('persist:p-'+q.id).cookies.get({})}catch{cookies[q.id]=[]}}
 const {backupPwEnc,...st}=cfg;return{v:1,t:Date.now(),profiles,cookies,settings:st,bookmarks,scripts,history:history.slice(0,2000)};
}
async function restoreBackup(d){
 const l=load(),byId=new Map(l.map(q=>[q.id,q]));let np=0,nc=0,nb=0;
 for(const q of d.profiles||[]){const c=JSON.parse(JSON.stringify(q));if(c.vpn)c.vpn=enc(c.vpn);if(c.proxy&&c.proxy.pass)c.proxy.pass=enc(c.proxy.pass);
  if(byId.has(c.id))Object.assign(byId.get(c.id),c);else{l.push(c);byId.set(c.id,c)}np++}
 save(l);
 for(const [pid,list] of Object.entries(d.cookies||{})){if(!byId.has(pid))continue;const ses=session.fromPartition('persist:p-'+pid);
  for(const c of list||[]){try{const host=String(c.domain||'').replace(/^\./,'');if(!host)continue;
   await ses.cookies.set({url:(c.secure?'https':'http')+'://'+host+(c.path||'/'),name:c.name,value:c.value,...(c.hostOnly?{}:{domain:c.domain}),path:c.path||'/',secure:!!c.secure,httpOnly:!!c.httpOnly,...(c.expirationDate?{expirationDate:c.expirationDate}:{}),sameSite:c.sameSite||'unspecified'});nc++}catch{}}}
 const have=new Set(bookmarks.map(b=>b.url+'|'+(b.folder||'')));
 for(const b of d.bookmarks||[]){const k=b.url+'|'+(b.folder||'');if(have.has(k))continue;have.add(k);bookmarks.push({id:uid(),title:b.title,url:b.url,folder:b.folder||'',t:b.t||Date.now()});nb++}saveBm();
 const sid=new Set(scripts.map(x=>x.id));for(const x of d.scripts||[])if(!sid.has(x.id))scripts.push(x);saveScripts();
 if(d.settings){const keep=cfg.backupPwEnc;Object.assign(cfg,d.settings);if(keep)cfg.backupPwEnc=keep;saveCfg();applyTheme()}
 pushMgr();pushTabs();pushBm();return{np,nc,nb};
}
async function askPw(msg){const r=await appDialog({title:'Резервные копии',message:msg,buttons:['OK','Отмена'],defaultId:0,cancelId:1,input:'password'});return r.response===0?(r.text||''):null}

// ---------- локальный API для Playwright и Selenium (выключен по умолчанию) ----------
// Только 127.0.0.1, доступ по токену, запросы из браузера и с чужих Host отклоняются.
const http=require('http');
let apiSrv=null,apiFails=[];
const apiTok=()=>{try{return cfg.apiTokenEnc?dec(cfg.apiTokenEnc):null}catch{return null}};
function apiNewToken(){const t=crypto.randomBytes(24).toString('hex');cfg.apiTokenEnc=enc(t);saveCfg();return t}
const apiErr=(code,msg)=>Object.assign(new Error(msg),{code});
function waitCdp(port,ms){const end=Date.now()+ms;return new Promise((res,rej)=>{
 const retry=()=>{if(Date.now()<end)setTimeout(tick,300);else rej(apiErr(504,'Браузер не открыл отладочный порт вовремя'))};
 const tick=()=>{const rq=http.get({host:'127.0.0.1',port,path:'/json/version',timeout:1500},r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res(JSON.parse(b))}catch{retry()}})});rq.on('error',retry);rq.on('timeout',()=>rq.destroy())};
 tick()})}
async function apiStartProfile(id,o){
 if(!prof(id))throw apiErr(404,'Профиль не найден');
 let j=running.get(id);
 if(!j){const port=await freePort();await launch(id,{debugPort:port,url:o&&o.url});j=running.get(id)}
 if(!j||!j.debugPort)throw apiErr(409,'Профиль уже запущен вручную (без отладочного порта): закрой его и запусти через API');
 const v=await waitCdp(j.debugPort,30000);
 return{id,running:true,http:'http://127.0.0.1:'+j.debugPort,ws:v.webSocketDebuggerUrl,browser:v.Browser};
}
const apiProf=q=>{const j=running.get(q.id);return{id:q.id,name:q.name,folder:q.folder||'',tags:q.tags||[],connection:connKind(q),running:!!j,http:j&&j.debugPort?'http://127.0.0.1:'+j.debugPort:null}};
async function apiRoute(req,body){
 const parts=new URL(req.url,'http://x').pathname.split('/').filter(Boolean),m=req.method;
 if(parts[0]!=='v1')throw apiErr(404,'Неизвестный путь');
 if(parts[1]==='status'&&m==='GET')return{app:'MultiBrowser',version:app.getVersion(),running:[...running.keys()]};
 if(parts[1]==='profiles'){
  if(parts.length===2){
   if(m==='GET')return load().map(apiProf);
   if(m==='POST'){
    const d={name:String(body.name||'Профиль').slice(0,80),folder:body.folder,mode:'none'};
    if(body.proxy){const x=body.proxy;if(!['socks5','http'].includes(x.type)||!x.host||!(+x.port>0))throw apiErr(400,'proxy: нужны type (socks5 или http), host и port');
     Object.assign(d,{mode:'proxy',type:x.type,host:String(x.host),port:String(x.port),user:x.user,pass:x.pass})}
    else if(body.wireguard){d.mode='vpn';d.confText=String(body.wireguard)}
    const r=addProfile(d);if(r.error)throw apiErr(400,r.error);
    if(Array.isArray(body.tags)){const l=load(),q=l.find(x=>x.id===r.id);if(q){q.tags=[...new Set(body.tags.map(x=>String(x).trim().slice(0,30)).filter(Boolean))].slice(0,20);save(l)}}
    return apiProf(prof(r.id));
   }
   throw apiErr(405,'Метод не поддерживается');
  }
  const id=parts[2],q=prof(id);if(!q)throw apiErr(404,'Профиль не найден');
  if(parts.length===3){
   if(m==='GET')return apiProf(q);
   if(m==='DELETE'){removeProfile(id);return{id,deleted:true}}
  }else if(parts[3]==='start'&&m==='POST')return apiStartProfile(id,body);
  else if(parts[3]==='stop'&&m==='POST'){const j=running.get(id);if(j)kill(j.chrome);return{id,running:false}}
  throw apiErr(405,'Метод не поддерживается');
 }
 throw apiErr(404,'Неизвестный путь');
}
function apiStop(){if(apiSrv){try{apiSrv.close()}catch{}apiSrv=null}}
function apiApply(){
 apiStop();if(!cfg.apiOn)return;
 const port=parseInt(cfg.apiPort)||35777,tok=apiTok()||apiNewToken();
 const srv=http.createServer(async(req,res)=>{
  const send=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
  try{
   if(!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(String(req.headers.host||'')))return send(403,{error:'Недопустимый Host'});   // защита от DNS rebinding
   if(req.headers.origin)return send(403,{error:'Запросы со страниц сайтов запрещены'});                                          // защита от CSRF
   const now=Date.now();apiFails=apiFails.filter(x=>now-x<60000);if(apiFails.length>=20)return send(429,{error:'Слишком много неверных попыток, подожди минуту'});
   const a=String(req.headers.authorization||''),given=a.startsWith('Bearer ')?a.slice(7):'';
   const ok=given.length===tok.length&&crypto.timingSafeEqual(Buffer.from(given),Buffer.from(tok));
   if(!ok){apiFails.push(now);return send(401,{error:'Нужен заголовок Authorization: Bearer <токен>'})}
   let body={};
   if(req.method==='POST'||req.method==='PUT'){const ch=[];let n=0;for await(const c of req){n+=c.length;if(n>65536)return send(413,{error:'Слишком большой запрос'});ch.push(c)}
    const raw=Buffer.concat(ch).toString('utf8');if(raw.trim()){try{body=JSON.parse(raw)}catch{return send(400,{error:'Тело запроса должно быть JSON'})}}}
   send(200,await apiRoute(req,body));
  }catch(e){send(typeof e.code==='number'?e.code:500,{error:e.message})}
 });
 srv.on('error',e=>{log('api: '+e.message);if(apiSrv===srv)apiSrv=null});
 srv.listen(port,'127.0.0.1',()=>log('local api: 127.0.0.1:'+port));
 apiSrv=srv;
}

// ---------- число на значке в панели задач ----------
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function pngEncode(w,h,rgba){
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4)}
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc])};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',require('zlib').deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const BFONT={'0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],'4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],'+':[0,4,4,31,4,4,0]};
function badgePng(n){
 const S=32,buf=Buffer.alloc(S*S*4),txt=n>99?'99+':String(n),sc=txt.length===1?3:(txt.length===2?2:1);
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=x-15.5,dy=y-15.5,d=Math.sqrt(dx*dx+dy*dy);if(d<=15){const i=(y*S+x)*4;buf[i]=229;buf[i+1]=72;buf[i+2]=77;buf[i+3]=d>14?Math.max(0,Math.round((15-d)*255)):255}}
 const gw=5*sc,gap=sc>1?2:1,tw=txt.length*gw+(txt.length-1)*gap,x0=Math.round((S-tw)/2),y0=Math.round((S-7*sc)/2);
 [...txt].forEach((ch,ci)=>{const g=BFONT[ch];if(!g)return;for(let r=0;r<7;r++)for(let c=0;c<5;c++){if(!(g[r]&(16>>c)))continue;
  for(let yy=0;yy<sc;yy++)for(let xx=0;xx<sc;xx++){const px=x0+ci*(gw+gap)+c*sc+xx,py=y0+r*sc+yy;if(px>=0&&px<S&&py>=0&&py<S){const i=(py*S+px)*4;buf[i]=255;buf[i+1]=255;buf[i+2]=255;buf[i+3]=255}}}});
 return pngEncode(S,S,buf);
}
function updateBadges(){   // у каждого окна своё число: сумма счётчиков его открытых вкладок
 for(const W of windows){if(W.dead||!W.win||W.win.isDestroyed())continue;
  let n=0;if(cfg.taskbarBadge!==false)for(const t of W.tabs)n+=t.badge>0?t.badge:0;
  if(W.__badge===n)continue;W.__badge=n;
  try{W.win.setOverlayIcon(n>0?nativeImage.createFromBuffer(badgePng(n)):null,n>0?'Непрочитано: '+n:'')}catch(e){log('badge: '+e.message)}}
}
// ---------- VPN: конфликты с другим VPN и дубли ключей ----------
const wgKey=q=>{try{const m=/PrivateKey\s*=\s*(\S+)/i.exec(dec(q.vpn));return m?m[1]:null}catch{return null}};
function dupKeyProfile(p,list){const k=wgKey(p);if(!k)return null;return (list||load()).find(x=>x.id!==p.id&&x.vpn&&wgKey(x)===k)||null}
function sysVpnNames(){try{const out=[];for(const [name,list] of Object.entries(require('os').networkInterfaces())){
 if(/(wintun|wireguard|\bwg\d*\b|tap-windows|\btap\b|openvpn|nordlynx|proton|mullvad|expressvpn|surfshark|warp|vpn|hiddify|v2ray|clash)/i.test(name)&&(list||[]).some(a=>!a.internal&&a.family==='IPv4'))out.push(name)}return out}catch{return[]}}
const vpnHint=()=>{const v=sysVpnNames();return v.length?' Обнаружен другой VPN в системе ('+v.join(', ')+'): профильный VPN внутри него может не соединяться. Попробуй включить у профиля «Режим совместимости с другим VPN» или выключить системный VPN на время работы профиля.':''};
const dupWarned=new Set();
function warnDupKey(p){
 const k=wgKey(p);if(!k)return;
 for(const [pid,tn] of tunnels){if(pid===p.id||!(tn.n>0))continue;const q=prof(pid);if(q&&q.vpn&&wgKey(q)===k){const key=[p.id,pid].sort().join('|');if(dupWarned.has(key))return;dupWarned.add(key);
  appDialog({title:'VPN',type:'warning',message:'Профили «'+p.name+'» и «'+q.name+'» используют один и тот же ключ WireGuard',detail:'VPN-сервер допускает одно подключение на ключ, поэтому два профиля одновременно будут мешать друг другу. Для каждого профиля создай отдельное устройство в личном кабинете VPN и подставь его конфиг.',buttons:['Понятно']}).catch(()=>{});return}}
}
// ---------- импорт закладок из других браузеров ----------
function browserProfiles(){
 const L=process.env.LOCALAPPDATA||'',R=process.env.APPDATA||'',out=[];
 const roots=[['Chrome',path.join(L,'Google','Chrome','User Data')],['Edge',path.join(L,'Microsoft','Edge','User Data')],['Brave',path.join(L,'BraveSoftware','Brave-Browser','User Data')],['Yandex',path.join(L,'Yandex','YandexBrowser','User Data')],['Vivaldi',path.join(L,'Vivaldi','User Data')],['Chromium',path.join(L,'Chromium','User Data')]];
 for(const [b,dir] of roots){try{if(!fs.existsSync(dir))continue;const names={};
  try{const ls=JSON.parse(fs.readFileSync(path.join(dir,'Local State'),'utf8'));for(const [k,v] of Object.entries((ls.profile&&ls.profile.info_cache)||{}))names[k]=v.name}catch{}
  for(const d of fs.readdirSync(dir)){if(d!=='Default'&&!/^Profile \d+$/.test(d))continue;const f=path.join(dir,d,'Bookmarks');if(fs.existsSync(f))out.push({browser:b,dir:d,name:names[d]||d,file:f})}}catch{}}
 try{const op=path.join(R,'Opera Software','Opera Stable','Bookmarks');if(fs.existsSync(op))out.push({browser:'Opera',dir:'Opera Stable',name:'Opera',file:op})}catch{}
 return out;
}
function parseChromeBookmarks(j){
 const out=[],walk=(node,trail)=>{if(!node)return;
  if(node.type==='url'){if(/^(https?|file):/i.test(node.url||''))out.push({title:node.name||node.url,url:node.url,folder:trail.join(' / ')});return}
  const t2=node.name?[...trail,node.name]:trail;for(const c of node.children||[])walk(c,t2)};
 const r=(j&&j.roots)||{};
 for(const [k,label] of [['bookmark_bar','Панель'],['other','Другие'],['synced','С других устройств']]){const n=r[k];if(n)for(const c of n.children||[])walk(c,[label])}
 return out;
}
// ---------- когда профиль последний раз открывали ----------
const usedPending=new Map();let usedT=null;
function touchProfile(id){usedPending.set(id,Date.now());if(usedT)return;
 usedT=setTimeout(()=>{usedT=null;const l=load();let ch=false;for(const [k,v] of usedPending){const q=l.find(x=>x.id===k);if(q){q.lastUsed=v;ch=true}}usedPending.clear();if(ch){save(l);pushMgr()}},8000)}

const engineVer=()=>{try{return fs.readFileSync(path.join(RES,'engine-version.txt'),'utf8').trim()}catch{return ''}};
async function autoBackupTick(force){   // автоматическая зашифрованная копия в выбранную папку, хранятся 5 последних
 if(!cfg.autoBackup&&!force)return{skipped:'off'};
 const dir=cfg.autoBackupDir;if(!dir||!fs.existsSync(dir))return{error:'Папка для копий не найдена: выбери её заново'};
 let pw=null;try{pw=cfg.backupPwEnc?dec(cfg.backupPwEnc):null}catch{}if(!pw)return{error:'Сначала задай пароль резервных копий'};
 const days=Math.max(1,parseInt(cfg.autoBackupDays)||7);if(!force&&Date.now()-(cfg.lastAutoBackup||0)<days*864e5)return{skipped:'recent'};
 try{const data=await backupData(),name='MultiBrowser-auto-'+new Date().toISOString().slice(0,10)+'.mbbak';
  fs.writeFileSync(path.join(dir,name),bkEncrypt(data,pw));cfg.lastAutoBackup=Date.now();saveCfg();
  const olds=fs.readdirSync(dir).filter(f=>/^MultiBrowser-auto-.*\.mbbak$/.test(f)).sort();while(olds.length>5){try{fs.rmSync(path.join(dir,olds.shift()))}catch{}}
  log('auto backup: '+name);return{ok:true,file:name};
 }catch(e){log('auto backup: '+e.message);return{error:e.message}}
}

// ---------- отпечаток профиля ----------
// Обычный режим: значения подменяются скриптом в начале страницы. Усиленный режим: те же значения уходят в параметры движка.
const FP_SCREENS=[[1920,1080],[1920,1080],[1920,1080],[1920,1080],[1366,768],[1366,768],[1536,864],[1536,864],[1440,900],[1600,900],[2560,1440],[1280,720],[1680,1050]];
const FP_CORES=[4,6,8,8,8,12,16],FP_MEM=[4,8,8,8];
const FP_GPUS=[
 ['Google Inc. (NVIDIA)','ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)','NVIDIA GeForce GTX 1650'],
 ['Google Inc. (NVIDIA)','ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)','NVIDIA GeForce RTX 3060'],
 ['Google Inc. (NVIDIA)','ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)','NVIDIA GeForce GTX 1060'],
 ['Google Inc. (Intel)','ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)','Intel UHD Graphics 630'],
 ['Google Inc. (Intel)','ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)','Intel Iris Xe Graphics'],
 ['Google Inc. (AMD)','ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)','AMD Radeon RX 580']];
function rng(seed){let a=(seed>>>0)||1;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function fpResolve(p){
 const r=rng((p.seed||1)^0x9e3779b9),pick=l=>l[Math.floor(r()*l.length)],f=p.fp||{};
 const sc=pick(FP_SCREENS),cores=pick(FP_CORES),mem=pick(FP_MEM),gi=Math.floor(r()*FP_GPUS.length),g=f.gpu!=null&&FP_GPUS[f.gpu]?FP_GPUS[f.gpu]:FP_GPUS[gi];
 return{cores:f.cores||cores,mem:f.mem||mem,sw:f.sw||sc[0],sh:f.sh||sc[1],gpuV:g[0],gpuR:g[1],canvas:f.canvas!==false,audio:f.audio!==false,webrtc:f.webrtc||'',seed:p.seed||1,
  auto:{cores,mem,screen:sc[0]+'×'+sc[1],gpu:FP_GPUS[gi][2]}};
}
const rtcPolicy=q=>({proxy:'disable_non_proxied_udp',default:'default',public:'default_public_interface_only'})[(q.fp||{}).webrtc]||'disable_non_proxied_udp';
function fpShim(F){return `(()=>{try{
 if(window.__mbFP)return;window.__mbFP=1;
 const C=${JSON.stringify({cores:F.cores,mem:F.mem,sw:F.sw,sh:F.sh,gv:F.gpuV,gr:F.gpuR,seed:F.seed,cv:F.canvas,au:F.audio})};
 const nat=new WeakMap(),ts=Function.prototype.toString;
 const mk=(fn,name)=>{try{Object.defineProperty(fn,'name',{value:name,configurable:true})}catch(e){}nat.set(fn,'function '+name+'() { [native code] }');return fn};
 const tsP=new Proxy(ts,{apply(t,th,a){return nat.has(th)?nat.get(th):Reflect.apply(t,th,a)}});nat.set(tsP,'function toString() { [native code] }');
 try{Object.defineProperty(Function.prototype,'toString',{value:tsP,writable:true,configurable:true})}catch(e){}
 const getter=(proto,key,fn)=>{try{const d=Object.getOwnPropertyDescriptor(proto,key);Object.defineProperty(proto,key,{get:mk(fn,'get '+key),set:d?d.set:undefined,enumerable:d?d.enumerable:true,configurable:true})}catch(e){}};
 getter(Navigator.prototype,'hardwareConcurrency',()=>C.cores);
 if(window.isSecureContext)getter(Navigator.prototype,'deviceMemory',()=>C.mem);
 const big=(v,o)=>Math.max(v,window[o]||0);
 getter(Screen.prototype,'width',()=>big(C.sw,'outerWidth'));getter(Screen.prototype,'height',()=>big(C.sh,'outerHeight'));
 getter(Screen.prototype,'availWidth',()=>big(C.sw,'outerWidth'));getter(Screen.prototype,'availHeight',()=>big(C.sh-40,'outerHeight'));
 getter(Screen.prototype,'colorDepth',()=>24);getter(Screen.prototype,'pixelDepth',()=>24);
 const gl=P=>{if(!P)return;const o=P.getParameter;P.getParameter=mk(function getParameter(p){if(p===37445)return C.gv;if(p===37446)return C.gr;return o.apply(this,arguments)},'getParameter')};
 gl(window.WebGLRenderingContext&&WebGLRenderingContext.prototype);gl(window.WebGL2RenderingContext&&WebGL2RenderingContext.prototype);
 const noise=i=>{let x=(i^C.seed)>>>0;x=Math.imul(x^(x>>>16),2246822507);x=Math.imul(x^(x>>>13),3266489909);return(x^(x>>>16))>>>0};
 if(C.cv&&window.CanvasRenderingContext2D){
  const perturb=d=>{for(let i=0;i<d.length;i+=4){const h=noise(i);if(h%53===0){const c=h%3;d[i+c]=d[i+c]>0?d[i+c]-1:d[i+c]+1}}};
  const og=CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData=mk(function getImageData(){const r=og.apply(this,arguments);try{perturb(r.data)}catch(e){}return r},'getImageData');
  const copy=cv=>{const c=document.createElement('canvas');c.width=cv.width;c.height=cv.height;const x=c.getContext('2d');x.drawImage(cv,0,0);const id=og.call(x,0,0,c.width,c.height);perturb(id.data);x.putImageData(id,0,0);return c};
  for(const name of ['toDataURL','toBlob']){const o=HTMLCanvasElement.prototype[name];HTMLCanvasElement.prototype[name]=mk(function(){let t=this;try{if(this.width&&this.height&&this.width*this.height<4e6)t=copy(this)}catch(e){}return o.apply(t,arguments)},name)}
 }
 if(C.au&&window.AudioBuffer){const og=AudioBuffer.prototype.getChannelData,done=new WeakSet();
  AudioBuffer.prototype.getChannelData=mk(function getChannelData(){const d=og.apply(this,arguments);try{if(!done.has(d)){done.add(d);for(let i=0;i<d.length;i+=100)d[i]+=((noise(i)%1000)-500)*1e-10}}catch(e){}return d},'getChannelData')}
}catch(e){}})();`}
function fpDoc(t){const q=prof(t.pid);if(!q)return;return setDocScript(t,'fp',fpShim(fpResolve(q)))}
function reapplyFp(pid){   // после смены отпечатка, часового пояса или языка: новые значения для уже открытых вкладок
 const q=prof(pid);if(!q)return;
 for(const W of windows){if(W.dead)continue;for(const t of W.tabs){if(t.kind||t.pid!==pid||t.view.webContents.isDestroyed())continue;
  const wc=t.view.webContents;applyGeo(wc,q);try{wc.setWebRTCIPHandlingPolicy(rtcPolicy(q))}catch{}fpDoc(t)}}
 reloadProfileTabs(pid);
}

// ---------- IPC ----------
H('list',()=>({profiles:view(),running:[...running.keys()]}));
H('pickConf',async()=>{const r=await openDlg(win,{filters:[{name:'VPN-конфиг',extensions:['conf']}],properties:['openFile']});
 return r.canceled?null:{name:path.basename(r.filePaths[0]),text:fs.readFileSync(r.filePaths[0],'utf8')}});
function addProfile(d){const l=load(),p={id:crypto.randomUUID(),name:d.name||'Профиль',seed:crypto.randomInt(1,2147483647),created:Date.now()};if((cfg.extAll||[]).length)p.exts=[...cfg.extAll];let note='';if(d.folder)p.folder=String(d.folder).trim().slice(0,60);
 if(d.mode==='vpn'&&d.confText){try{if(parseWg(d.confText).awg){p.vpnNote='awg';note='Обнаружен конфиг AmneziaWG: для него используется отдельное ядро sing-box-lx, параметры маскировки сохраняются.'}}catch(x){return{error:x.message}}p.vpn=enc(d.confText)}
 else if(d.mode==='proxy'&&d.host){p.proxy={type:d.type,host:d.host,port:d.port};if(d.user){p.proxy.user=d.user;p.proxy.pass=enc(d.pass||'')}}
 if(p.vpn){const dup=dupKeyProfile(p,l);if(dup)note+=(note?' ':'')+'Этот WireGuard-ключ уже используется в профиле «'+dup.name+'»: два профиля с одним ключом одновременно работают нестабильно (сервер допускает одно подключение на ключ).'}
 l.push(p);save(l);pushTabs();pushMgr();return{ok:true,note,id:p.id}}
H('add',(e,d)=>addProfile(d));
H('launch',async(e,id)=>{try{await launch(id);return null}catch(x){return x.message}});
H('stop',(e,id)=>{const j=running.get(id);if(j)kill(j.chrome)});
function removeProfile(id){const ctx=curW;for(const W of [...windows]){if(W.dead)continue;useW(W);for(const t of tabs.filter(x=>x.pid===id))closeTab(t.id)}if(ctx&&!ctx.dead)useW(ctx);history=history.filter(h=>h.pid!==id);saveHistSoon();
 const j=running.get(id);if(j){kill(j.chrome);cleanup(j);running.delete(id)}save(load().filter(p=>p.id!==id))}
H('remove',(e,id)=>removeProfile(id));
H('openInShell',(e,id)=>newTab(id));
H('newTab',(e,id)=>newTab(id));
H('newTabMenu',(e,a)=>{if(Date.now()-lastMenuBlur<250)return;profileMenu(a)});
H('activate',(e,id)=>{if(curW)curW.anchor=null;setActive(id);layout();pushTabs();focusSoon()});
H('closeTab',(e,id)=>closeTab(id));
H('navigate',(e,s)=>{const t=tabs.find(x=>x.id===active);if(t&&!t.kind)t.view.webContents.loadURL(norm(s))});
H('nav',(e,a)=>{const t=tabs.find(x=>x.id===active);if(!t||t.kind)return;const h=t.view.webContents.navigationHistory;
 if(a==='back')h.goBack();else if(a==='forward')h.goForward();else t.view.webContents.reload()});
H('setMode',(e,m)=>{setMode(m==='side'?'side':'top');layout();pushTabs()});
function openPage(kind,bg){   // внутренние страницы («Профили», «Настройки») открываются как вкладки
 const def=PAGES[kind],ex=tabs.find(x=>x.kind===kind);if(ex){if(!bg){setActive(ex.id);layout();pushTabs()}return ex}
 const v=mkView({preload:path.join(__dirname,'preload.js'),contextIsolation:true});
 const t={id:nextId++,pid:def.pid,kind,view:v,title:def.title,url:'',ready:false,W:curW};tabs.push(t);
 const rdy=()=>{if(!t.ready&&useW(t.W)){t.ready=true;layout();pushTabs();if(t.id===active)focusSoon()}};
 v.webContents.once('did-finish-load',rdy);setTimeout(rdy,2500);
 v.webContents.on('before-input-event',(e,i)=>{if(useW(t.W)&&hotkey(i,v.webContents))e.preventDefault()});
 win.contentView.addChildView(v);if(!bg||active===null)setActive(t.id);v.webContents.loadFile(def.file);layout();pushTabs();return t;
}
const openManager=bg=>openPage('manager',bg);
H('openManager',()=>{openManager()});
H('openSettings',()=>{openPage('settings')});
H('getSettings',()=>{const {backupPwEnc,apiTokenEnc,...c}=cfg;return{...c,hasBackupPw:!!backupPwEnc,engineVer:engineVer(),chromium:process.versions.chrome,electron:process.versions.electron,version:app.getVersion(),dlDefault:app.getPath('downloads')}});
H('setSettings',(e,p)=>{for(const k of Object.keys(DEF))if(k in p)cfg[k]=p[k];cfg.apiPort=Math.min(65535,Math.max(1024,parseInt(cfg.apiPort)||35777));saveCfg();applyTheme();layout();pushBm();if('apiOn' in p||'apiPort' in p)apiApply();updateBadges();return true});
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
H('pickFolder',async()=>{const r=await openDlg(win,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0]});
H('getProfile',(e,id)=>{const p=prof(id);if(!p)return null;const x=p.proxy;
 return{id:p.id,name:p.name,downloadDir:p.downloadDir||'',effective:downloadDirFor(p),autoclick:p.autoclick||{on:false,rules:''},scripts:enabledIds(p),fp:p.fp||{},fpEff:fpResolve(p),seed:p.seed||1,tz:p.tz||'',lang:p.lang||'',vpnCompat:!!p.vpnCompat,note:p.note||'',color:p.color||'',icon:p.icon||'',folder:p.folder||'',tags:p.tags||[],start:p.start||'',notify:p.notify!==false,
  conn:{mode:p.vpn?'vpn':x?'proxy':'none',type:x?x.type:'socks5',host:x?x.host:'',port:x?x.port:'',user:(x&&x.user)||'',hasPass:!!(x&&x.pass),hasVpn:!!p.vpn,vpnNote:!!p.vpnNote}}});
H('updateProfile',(e,d)=>{const l=load(),p=l.find(x=>x.id===d.id);if(!p)return{error:'Профиль не найден'};const before=JSON.stringify([p.vpn||null,p.proxy||null,p.vpnCompat||null]),fpBefore=JSON.stringify([p.fp||null,p.seed||null,p.tz||null,p.lang||null]);
 if(d.name&&d.name.trim())p.name=d.name.trim();if(d.downloadDir)p.downloadDir=d.downloadDir;else delete p.downloadDir;
 if(d.autoclick)p.autoclick={on:!!d.autoclick.on,rules:String(d.autoclick.rules||'').slice(0,4000)};
 if(Array.isArray(d.scripts)){p.scripts=d.scripts.filter(x=>allScripts().some(s=>s.id===x));delete p.presets}
 if(d.fp&&typeof d.fp==='object'){const f=d.fp,o={},num=(v,a,b)=>{v=+v;return Number.isFinite(v)&&v>=a&&v<=b?Math.round(v):undefined};
  const cores=num(f.cores,1,64),mem=[2,4,8].includes(+f.mem)?+f.mem:undefined,sw=num(f.sw,640,7680),sh=num(f.sh,480,4320);
  if(cores)o.cores=cores;if(mem)o.mem=mem;if(sw&&sh){o.sw=sw;o.sh=sh}
  if(f.gpu!==''&&f.gpu!=null&&Number.isInteger(+f.gpu)&&FP_GPUS[+f.gpu])o.gpu=+f.gpu;
  if(f.canvas===false)o.canvas=false;if(f.audio===false)o.audio=false;if(['proxy','default','public'].includes(f.webrtc))o.webrtc=f.webrtc;
  if(Object.keys(o).length)p.fp=o;else delete p.fp}
 if(Number.isInteger(d.seed)&&d.seed>0&&d.seed<2147483647)p.seed=d.seed;
 if(typeof d.tz==='string'){if(!d.tz.trim())delete p.tz;else if(/^[A-Za-z0-9_\/+\-]{1,40}$/.test(d.tz.trim()))p.tz=d.tz.trim()}
 if(typeof d.lang==='string'){if(!d.lang.trim())delete p.lang;else if(/^[a-z]{2,3}(-[A-Z]{2})?$/.test(d.lang.trim()))p.lang=d.lang.trim()}
 if(typeof d.vpnCompat==='boolean'){if(d.vpnCompat)p.vpnCompat=true;else delete p.vpnCompat}
 if(typeof d.note==='string'){const nn=d.note.trim().slice(0,500);if(nn)p.note=nn;else delete p.note}
 if(typeof d.notify==='boolean'){p.notify=d.notify;setTimeout(()=>notifyDocAll(p.id),0)}
 if(typeof d.color==='string')p.color=/^#[0-9a-fA-F]{6}$/.test(d.color)?d.color:'';
 if(typeof d.icon==='string'&&d.icon.length<60000&&(d.icon===''||/^emoji:/.test(d.icon)||/^img:data:image\/(png|jpeg|webp);base64,/.test(d.icon)))p.icon=d.icon;
 if(typeof d.folder==='string')p.folder=d.folder.trim().slice(0,60);
 if(Array.isArray(d.tags))p.tags=[...new Set(d.tags.map(x=>String(x).trim().slice(0,30)).filter(Boolean))].slice(0,20);
 if(typeof d.start==='string')p.start=['','google','blank','info'].includes(d.start)?d.start:'';
 let note='';const c=d.conn;
 if(c){
  if(c.mode==='none'){delete p.proxy;delete p.vpn;delete p.vpnNote}
  else if(c.mode==='proxy'){
   if(!c.host||!String(c.host).trim())return{error:'Укажи адрес прокси'};
   const old=p.proxy||{};p.proxy={type:c.type==='http'?'http':'socks5',host:String(c.host).trim(),port:String(c.port||'').trim()};
   if(c.user){p.proxy.user=c.user;if(c.pass)p.proxy.pass=enc(c.pass);else if(old.pass)p.proxy.pass=old.pass}
   delete p.vpn;delete p.vpnNote}
  else if(c.mode==='vpn'){
   if(c.confText){try{const w=parseWg(c.confText);p.vpn=enc(c.confText);if(w.awg){p.vpnNote='awg';note='Обнаружен конфиг AmneziaWG: используется ядро sing-box-lx.'}else delete p.vpnNote}catch(x){return{error:x.message}}}
   else if(!p.vpn)return{error:'Выбери файл VPN-конфига (.conf)'};
   delete p.proxy}
 }
 const changed=JSON.stringify([p.vpn||null,p.proxy||null,p.vpnCompat||null])!==before;if(changed){delete p.vpnPort;delete p.vpnDns}
 if(changed&&p.vpn){const dup=dupKeyProfile(p,l);if(dup)note+=(note?' ':'')+'Этот WireGuard-ключ уже используется в профиле «'+dup.name+'»: два профиля с одним ключом одновременно работают нестабильно (сервер допускает одно подключение на ключ).'}   // запомненные порт и DNS относились к старому конфигу
 save(l);pushTabs();pushMgr();if(changed)reconnectProfile(p.id).catch(x=>log('reconnect: '+x.message));if(JSON.stringify([p.fp||null,p.seed||null,p.tz||null,p.lang||null])!==fpBefore)setTimeout(()=>reapplyFp(p.id),0);return{ok:true,note}});
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
H('menuResize',(e,h)=>{if(menuOpen&&menuV)menuV.setBounds(menuBounds(menuW,h))});
H('menuPick',(e,arg)=>{const id=typeof arg==='string'?arg:(arg&&arg.id),mid=!!(arg&&typeof arg==='object'&&arg.mid),f=(mid&&menuAlts.get(id))||menuActs.get(id);hideMenu();focusSoon();if(f)setTimeout(f,0)});
H('checkConn',(e,id)=>checkConn(id));
H('applyGeo',(e,{id,tz,lang})=>{const l=load(),p=l.find(x=>x.id===id);if(!p)return false;if(tz)p.tz=tz;else delete p.tz;if(lang)p.lang=lang;else delete p.lang;save(l);pushMgr();setTimeout(()=>reapplyFp(id),0);return true});
H('fpOptions',()=>({gpus:FP_GPUS.map(g=>g[2]),screens:[...new Set(FP_SCREENS.map(x=>x[0]+'x'+x[1]))],cores:[2,4,6,8,12,16],mem:[2,4,8]}));
H('toastGet',()=>toastItem());
H('toastHover',(e,h)=>{toastHover=!!h;if(!h){clearTimeout(toastT);toastT=setTimeout(hideToast,1800)}});
H('dlAnchor',(e,r)=>{if(curW)curW.dlRect=r});
H('toastAction',(e,{action,id})=>{
 if(action==='panel'){hideToast();showPanel();return}
 if(action==='close'){hideToast();return}
 const d=downloads.find(x=>x.id===id);if(!d)return;const it=live.get(id);
 if(action==='open')shell.openPath(d.path);else if(action==='show')shell.showItemInFolder(d.path);else if(action==='cancel'&&it)it.cancel();
 if(action!=='cancel')hideToast()});
H('scList',()=>allScripts().map(x=>({...x,fav:(cfg.favScripts||[]).includes(x.id)})));
H('scFav',(e,{sid,on})=>{const set=new Set(cfg.favScripts||[]);if(on)set.add(sid);else set.delete(sid);cfg.favScripts=[...set];saveCfg();const c0=curW;for(const W of windows){if(W.dead)continue;useW(W);layout();pushTabs();pushBm()}if(c0&&!c0.dead)useW(c0);return true});
H('scProfiles',()=>load().map(p=>({id:p.id,name:p.name,color:colorOf(p.id),enabled:enabledIds(p),cfg:p.scriptCfg||{}})));
H('scToggle',(e,{sid,pid,on})=>{const l=load(),p=l.find(x=>x.id===pid);if(!p)return false;
 const ids=enabledIds(p).filter(x=>x!==sid);if(on)ids.push(sid);p.scripts=ids;delete p.presets;save(l);reloadProfileTabs(pid);pushMgr();pushTabsAll();return true});
function pushTabsAll(){const c0=curW;for(const W of windows){if(W.dead)continue;useW(W);pushTabs()}if(c0&&!c0.dead)useW(c0)}
H('scCfg',(e,{sid,pid,cfg})=>{const l=load(),p=l.find(x=>x.id===pid);if(!p)return false;p.scriptCfg=p.scriptCfg||{};
 if(cfg&&Object.keys(cfg).length)p.scriptCfg[sid]=cfg;else delete p.scriptCfg[sid];save(l);reloadProfileTabs(pid);return true});
H('scSave',(e,sc)=>{if(!sc||!(sc.name||'').trim())return null;let x=scripts.find(s=>s.id===sc.id);if(!x){x={id:uid()};scripts.push(x)}
 x.name=sc.name.trim().slice(0,80);x.desc=String(sc.desc||'').slice(0,300);x.type=sc.type==='autoclick'?'autoclick':'js';x.code=String(sc.code||'').slice(0,200000);
 x.match=(Array.isArray(sc.match)?sc.match:String(sc.match||'').split(/\r?\n/)).map(m=>m.trim()).filter(Boolean);
 x.runAt=['load','document-start'].includes(sc.runAt)?sc.runAt:'dom-ready';
 x.params=(Array.isArray(sc.params)?sc.params:[]).filter(q=>q&&/^[A-Za-z_]\w*$/.test(q.key||'')).slice(0,20).map(q=>({key:q.key,label:String(q.label||q.key).slice(0,120),type:['number','bool'].includes(q.type)?q.type:'text',def:q.def}));
 if(x.type==='autoclick'&&!x.params.some(q=>q.key==='rules'))x.params.unshift({key:'rules',label:'Правила: сайт | кнопка | задержка, мс',type:'text',def:''});
 saveScripts();for(const p of load())if(enabledIds(p).includes(x.id))reloadProfileTabs(p.id);return x.id});
H('scDup',(e,sid)=>{const s0=allScripts().find(x=>x.id===sid);if(!s0)return null;
 const x={id:uid(),name:s0.name+' (копия)',desc:s0.desc||'',type:s0.type,match:s0.match||['*'],runAt:s0.runAt||'dom-ready',code:s0.code||'',params:JSON.parse(JSON.stringify(s0.params||[]))};scripts.push(x);saveScripts();return x.id});
H('scDelete',(e,id)=>{scripts=scripts.filter(s=>s.id!==id);saveScripts();cfg.favScripts=(cfg.favScripts||[]).filter(x=>x!==id);saveCfg();const l=load();let ch=false;
 for(const p of l){if(p.scripts&&p.scripts.includes(id)){p.scripts=p.scripts.filter(x=>x!==id);ch=true}if(p.scriptCfg&&p.scriptCfg[id]){delete p.scriptCfg[id];ch=true}}if(ch)save(l)});
H('openScripts',()=>{openPage('scripts')});
H('importProfiles',(e,text)=>{const l=load(),bad=[];let n=0;
 for(const raw of String(text).split(/\r?\n/)){const line=raw.trim();if(!line||line[0]==='#')continue;
  let nm='',px='';if(line.includes('|')){const i=line.indexOf('|');nm=line.slice(0,i).trim();px=line.slice(i+1).trim()}else if(line.includes(':'))px=line;else nm=line;
  const p={id:crypto.randomUUID(),name:nm||('Профиль '+(l.length+1)),seed:crypto.randomInt(1,2147483647),created:Date.now()};if((cfg.extAll||[]).length)p.exts=[...cfg.extAll];
  if(px){try{const u=new URL(px.includes('://')?px:'socks5://'+px),t=u.protocol.replace(':','');
    if(!['http','https','socks5','socks'].includes(t)||!u.hostname)throw new Error('bad');
    p.proxy={type:t.startsWith('http')?'http':'socks5',host:u.hostname,port:u.port||(t.startsWith('http')?'80':'1080')};
    if(u.username){p.proxy.user=decodeURIComponent(u.username);p.proxy.pass=enc(decodeURIComponent(u.password||''))}}
   catch{bad.push(line);continue}}
  l.push(p);n++}
 save(l);pushMgr();pushTabs();return{n,bad}});
H('resetPerms',(e,id)=>{const l=load(),p=l.find(x=>x.id===id);if(p){delete p.perms;delete p.notifyPerms;save(l);notifyDocAll(id)}return true});
H('translatePage',()=>{const t=cur();if(t)translateToggle(t)});
H('dragStart',(e,{id,ids,x,y,gx,gy})=>{
 const list=(ids&&ids.length>1?ids:[id]).map(i=>tabs.find(t=>t.id===i)).filter(Boolean);if(!list.length)return false;
 const t=list.find(q=>q.id===id)||list[0],src=curW,sb=src.win.getBounds();
 if(tabs.length>list.length){
  const firstIdx=Math.min(...list.map(q=>tabs.indexOf(q)));
  for(const q of list){const i=tabs.indexOf(q);if(i>=0)tabs.splice(i,1);try{win.contentView.removeChildView(q.view)}catch{}}
  if(!tabs.some(q=>q.id===active))setActive(tabs[Math.min(Math.max(0,firstIdx-1),tabs.length-1)].id);layout();pushTabs();
  const W2=createWindow({bounds:{x:Math.round(x-gx),y:Math.round(y-gy),width:sb.width,height:sb.height},instant:true});
  W2.mode=src.mode;for(const q of list){q.W=W2;W2.tabs.push(q)}W2.active=t.id;useW(W2);for(const q of list)W2.win.contentView.addChildView(q.view);layout();pushTabs();
  drag={W:W2,t,list,gx,gy,hint:null};
 }else drag={W:src,t,list,gx,gy,hint:null};
 return true});
ipcMain.on('dragMove',(e,{x,y})=>{
 if(!drag||drag.W.dead)return;const pt=cursorPt(x,y);drag.W.win.setPosition(Math.round(pt.x-drag.gx),Math.round(pt.y-drag.gy));
 const T=dropTarget(pt.x,pt.y,drag.W),h=drag.hint,same=(!T&&!h)||(T&&h&&T.W===h.W&&T.idx===h.idx);
 if(!same){if(h&&!h.W.dead&&(!T||T.W!==h.W))h.W.win.webContents.send('drop-hint',false);if(T)T.W.win.webContents.send('drop-hint',{idx:T.idx,line:T.line});drag.hint=T}});
H('dragEnd',(e,{x,y})=>{
 if(!drag)return;const d=drag;drag=null;
 if(d.hint&&!d.hint.W.dead)d.hint.W.win.webContents.send('drop-hint',false);
 const pt=cursorPt(x,y),T=d.W.dead?null:dropTarget(pt.x,pt.y,d.W);
 if(T){if(d.list&&d.list.length>1)moveTabsToWindow(d.list,d.W,T.W,T.idx);else moveTabToWindow(d.t,d.W,T.W,T.idx)}else if(!d.W.dead&&useW(d.W)){layout();pushTabs()}});
H('tabSearch',(e,a)=>{if(Date.now()-lastMenuBlur<250)return;tabSearch(a)});
H('muteTab',(e,id)=>{const t=tabs.find(x=>x.id===id);if(!t||t.kind)return;const w=t.view.webContents;w.setAudioMuted(!w.isAudioMuted());t.muted=w.isAudioMuted();pushTabs()});
H('navMenu',(e,{dir,anchor})=>{const w=pageWc();if(!w)return;const nh=w.navigationHistory,ents=nh.getAllEntries(),ai=nh.getActiveIndex(),items=[];
 if(dir==='back'){for(let i=ai-1;i>=0;i--)items.push({label:ents[i].title||ents[i].url,tag:hostOf(ents[i].url),fn:()=>nh.goToIndex(i),alt:()=>openTabNear(ents[i].url,true)})}
 else{for(let i=ai+1;i<ents.length;i++)items.push({label:ents[i].title||ents[i].url,tag:hostOf(ents[i].url),fn:()=>nh.goToIndex(i),alt:()=>openTabNear(ents[i].url,true)})}
 if(items.length)showMenu(items.slice(0,15),anchor,{width:340})});
H('suggest',(e,{q,anchor})=>{
 q=String(q||'').trim();if(!q){if(menuOpen&&menuPayload.suggest)hideMenu();return}
 const ql=q.toLowerCase(),t=cur(),items=[],looksUrl=/^[^\s]+\.[^\s]{2,}$/.test(q)||/^https?:\/\//i.test(q),seen=new Set();
 items.push({label:looksUrl?'Открыть '+q:'Искать «'+q+'»',hint:'Enter',fn:()=>navTo(q)});
 let n=0;for(const b of bookmarks){if(n>=3)break;if(((b.title||'')+' '+b.url).toLowerCase().includes(ql)){seen.add(b.url);n++;items.push({label:'★ '+(b.title||b.url),tag:hostOf(b.url),fn:()=>navTo(b.url)})}}
 let m=0;for(const h of history){if(m>=6)break;if(t&&!t.kind&&h.pid!==t.pid)continue;if(seen.has(h.url))continue;if(((h.title||'')+' '+h.url).toLowerCase().includes(ql)){seen.add(h.url);m++;items.push({label:h.title||h.url,tag:hostOf(h.url),fn:()=>navTo(h.url)})}}
 suggestSel=-1;showMenu(items,anchor,{noFocus:true,suggest:true,width:Math.max(320,(anchor&&anchor.width)||320)})});
H('suggestMove',(e,d)=>{if(!menuOpen||!menuPayload.suggest)return;const n=menuPayload.items.length;if(!n)return;suggestSel=suggestSel<0?(d>0?0:n-1):(suggestSel+d+n)%n;if(menuV&&!menuV.webContents.isDestroyed())menuV.webContents.send('menu-sel',suggestSel)});
H('suggestPick',()=>{if(!menuOpen||!menuPayload.suggest||suggestSel<0)return false;const it=menuPayload.items[suggestSel],f=it&&it.id&&menuActs.get(it.id);if(f){hideMenu();f();return true}return false});
H('suggestHide',()=>{if(menuOpen&&menuPayload.suggest)hideMenu()});
H('extList',()=>({all:cfg.extAll||[],exts:extList(),profiles:load().map(p=>({id:p.id,name:p.name,color:colorOf(p.id),enabled:p.exts||[]}))}));
H('extInstall',async(e,input)=>{try{const id=await extInstall(input);
 const set=new Set(cfg.extAll||[]);set.add(id);cfg.extAll=[...set];saveCfg();   // новое расширение по умолчанию включается для всех профилей
 const l=load();for(const q of l){const s2=new Set(q.exts||[]);s2.add(id);q.exts=[...s2]}save(l);
 return{ok:true,id}}catch(x){return{error:x.message}}});
H('extAll',(e,{id,on})=>{const set=new Set(cfg.extAll||[]);if(on)set.add(id);else set.delete(id);cfg.extAll=[...set];saveCfg();
 if(on){const l=load(),ch=[];for(const q of l){const s2=new Set(q.exts||[]);if(!s2.has(id)){s2.add(id);q.exts=[...s2];ch.push(q.id)}}save(l);for(const pid of ch)reloadProfileTabs(pid)}
 return true});
H('extUpdate',async()=>extUpdateAll());
H('extToggle',async(e,{id,pid,on})=>{const l=load(),p=l.find(x=>x.id===pid);if(!p)return false;const set=new Set(p.exts||[]);if(on)set.add(id);else set.delete(id);p.exts=[...set];save(l);
 if(!on){const part='persist:p-'+pid,m=extLoaded.get(part),ex=m&&m.get(id);if(ex){try{await (()=>{const x=session.fromPartition(part);return (x.extensions||x).removeExtension(ex.id)})()}catch{}m.delete(id)}}
 reloadProfileTabs(pid);return true});
H('extRemove',async(e,id)=>{
 for(const [part,m] of extLoaded){const ex=m.get(id);if(ex){try{await (()=>{const x=session.fromPartition(part);return (x.extensions||x).removeExtension(ex.id)})()}catch{}m.delete(id)}}
 const l=load();for(const p of l)if(p.exts)p.exts=p.exts.filter(x=>x!==id);save(l);cfg.extAll=(cfg.extAll||[]).filter(x=>x!==id);saveCfg();try{fs.rmSync(path.join(EXD(),id),{recursive:true,force:true})}catch{}return true});
H('profMeta',(e,{ids,folder,addTags,removeTags,color,icon})=>{
 const set=new Set(ids||[]),l=load();
 for(const q of l){if(!set.has(q.id))continue;
  if(typeof folder==='string')q.folder=folder.trim().slice(0,60);
  if(Array.isArray(addTags))q.tags=[...new Set([...(q.tags||[]),...addTags.map(x=>String(x).trim().slice(0,30)).filter(Boolean)])].slice(0,20);
  if(Array.isArray(removeTags))q.tags=(q.tags||[]).filter(x=>!removeTags.includes(x));
  if(typeof color==='string')q.color=/^#[0-9a-fA-F]{6}$/.test(color)?color:'';
  if(typeof icon==='string'&&icon.length<60000)q.icon=icon}
 save(l);pushTabs();pushMgr();return true});
H('openProfiles',async(e,{ids,newWindow})=>{
 const list=(ids||[]).filter(id=>prof(id));if(!list.length)return false;
 if(newWindow){const W=createWindow({instant:true,incognito:!!(curW&&curW.incognito)});useW(W)}
 const base=cur();let first=true;
 for(const id of list){await newTab(id,undefined,!first&&true,first&&base&&!newWindow?base.id:undefined);first=false}
 return true});
H('diagReport',()=>{   // отчёт для поддержки: версии и последние строки журнала без полных IP-адресов и паролей
 let lines='';try{lines=fs.readFileSync(LOG(),'utf8').split('\n').slice(-120).join('\n')}catch{}
 const mask=x=>x.replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g,'$1.$2.x.x').replace(/(password|pass|token|key)=\S+/gi,'$1=***');
 return mask(['MultiBrowser '+app.getVersion(),'Chromium '+process.versions.chrome+' / Electron '+process.versions.electron,'Windows '+require('os').release(),'Движок усиленного режима: '+(engineVer()||'?'),'Профилей: '+load().length,'','--- журнал ---',lines].join('\n'));
});
H('openLogDir',()=>{try{shell.showItemInFolder(LOG())}catch{}return true});
H('changelog',()=>{try{return fs.readFileSync(path.join(__dirname,'ui','changelog.md'),'utf8')}catch{return'Список изменений недоступен.'}});
H('openWhatsNew',()=>{openPage('whatsnew');return true});
H('bkAutoNow',()=>autoBackupTick(true));
H('bkInfo',()=>({hasPw:!!cfg.backupPwEnc}));
H('bkSetPw',async()=>{const a=await askPw('Придумай пароль для резервных копий');if(!a)return{canceled:true};if(a.length<6)return{error:'Пароль слишком короткий (минимум 6 символов)'};
 const b=await askPw('Повтори пароль');if(b!==a)return{error:'Пароли не совпали'};cfg.backupPwEnc=enc(a);saveCfg();return{ok:true}});
H('bkCreate',async()=>{
 let pw=null;try{pw=cfg.backupPwEnc?dec(cfg.backupPwEnc):null}catch{}
 if(!pw){const a=await askPw('Задай пароль для резервных копий (запомни его: он нужен при восстановлении на другом компьютере)');if(!a||a.length<6)return{error:'Нужен пароль не короче 6 символов'};cfg.backupPwEnc=enc(a);saveCfg();pw=a}
 const r=await dialog.showSaveDialog(win,{defaultPath:'MultiBrowser-'+new Date().toISOString().slice(0,10)+'.mbbak',filters:[{name:'Резервная копия MultiBrowser',extensions:['mbbak']}]});
 if(r.canceled||!r.filePath)return{canceled:true};
 const data=await backupData();fs.writeFileSync(r.filePath,bkEncrypt(data,pw));
 return{ok:true,profiles:data.profiles.length,cookies:Object.values(data.cookies).reduce((a,x)=>a+x.length,0)}});
H('bkRestore',async()=>{
 const r=await openDlg(win,{filters:[{name:'Резервная копия MultiBrowser',extensions:['mbbak']}],properties:['openFile']});
 if(r.canceled||!r.filePaths||!r.filePaths[0])return{canceled:true};
 const buf=fs.readFileSync(r.filePaths[0]);let data=null,pw=null;try{pw=cfg.backupPwEnc?dec(cfg.backupPwEnc):null}catch{}
 if(pw){try{data=bkDecrypt(buf,pw)}catch(e){if(!/пароль/i.test(e.message))return{error:e.message}}}
 if(!data){const a=await askPw('Введи пароль этой резервной копии');if(!a)return{canceled:true};try{data=bkDecrypt(buf,a)}catch(e){return{error:e.message}}}
 const c=await appDialog({title:'Восстановление',message:'Восстановить данные из копии?',detail:'Профилей: '+(data.profiles||[]).length+', закладок: '+(data.bookmarks||[]).length+'. Профили с теми же идентификаторами будут заменены, остальное добавится.',buttons:['Восстановить','Отмена'],defaultId:0,cancelId:1,type:'question'});
 if(c.response!==0)return{canceled:true};
 return{ok:true,...(await restoreBackup(data))}});
H('apiToken',()=>cfg.apiOn?(apiTok()||apiNewToken()):null);
H('apiNewToken',()=>{const t=apiNewToken();apiApply();return t});
H('copyText',(e,t)=>{clipboard.writeText(String(t).slice(0,2000));return true});
H('checkMany',async(e,ids)=>{   // проверка подключения у нескольких профилей, по три одновременно
 const list=(ids||[]).filter(id=>prof(id));let i=0,ok=0,bad=0;
 const run=async()=>{while(i<list.length){const id=list[i++];try{const r=await checkConn(id);if(r&&r.error)bad++;else ok++}catch{bad++}}};
 await Promise.all([run(),run(),run()]);return{ok,bad,total:list.length}});
H('profDuplicate',(e,ids)=>{const l=load(),out=[];
 for(const id of ids||[]){const q=l.find(x=>x.id===id);if(!q)continue;const c=JSON.parse(JSON.stringify(q));
  c.id=crypto.randomUUID();c.name=(q.name+' (копия)').slice(0,80);c.seed=crypto.randomInt(1,2147483647);c.created=Date.now();
  for(const k of ['lastUsed','lastCheck','perms','notifyPerms','vpnPort','vpnDns'])delete c[k];l.push(c);out.push(c.id)}
 save(l);pushMgr();return out});
H('bmChromeList',()=>browserProfiles().map(({browser,dir,name,file})=>({browser,dir,name,file})));
H('bmChromeImport',(e,{file})=>{const found=browserProfiles().find(x=>x.file===file);if(!found)return{error:'Профиль браузера не найден'};
 let j;try{j=JSON.parse(fs.readFileSync(file,'utf8'))}catch(x){return{error:'Не удалось прочитать закладки: '+x.message}}
 const items=parseChromeBookmarks(j),have=new Set(bookmarks.map(b=>b.url+'|'+(b.folder||''))),pre='Из '+found.browser+(found.name&&found.name!==found.browser&&found.name!=='Default'?': '+found.name:'');let n=0;
 for(const b of items){const folder=(pre+(b.folder?' / '+b.folder:'')).slice(0,60),k=b.url+'|'+folder;if(have.has(k))continue;have.add(k);bookmarks.push({id:uid(),title:b.title,url:b.url,folder,t:Date.now()});n++}
 saveBm();pushBm();return{ok:true,n}});
H('moveTabs',(e,{ids,to})=>{const set=new Set(ids||[]),moving=tabs.filter(t=>set.has(t.id));if(!moving.length)return;const rest=tabs.filter(t=>!set.has(t.id));rest.splice(Math.max(0,Math.min(to,rest.length)),0,...moving);tabs.splice(0,tabs.length,...rest);pushTabs()});
H('moveTab',(e,{id,to})=>{const i=tabs.findIndex(x=>x.id===id);if(i<0)return;const [t]=tabs.splice(i,1);tabs.splice(Math.max(0,Math.min(to,tabs.length)),0,t);pushTabs()});
H('detachTab',(e,{id,x,y})=>detachTab(id,x,y));
H('tabsAction',(e,{ids,action})=>tabsAction(ids,action));
H('bmSave',(e,{id,title,url,folder})=>{const b=bookmarks.find(x=>x.id===id);if(!b)return false;if(title&&title.trim())b.title=title.trim();if(url&&/^(https?|file):/i.test(url.trim()))b.url=url.trim();b.folder=String(folder||'').trim().slice(0,60);saveBm();pushBm();pushTabs();return true});
H('bmAdd',(e,{title,url,folder})=>{url=String(url||'').trim();if(!/^(https?|file):/i.test(url))return{error:'Нужна ссылка вида https://…'};bookmarks.push({id:uid(),title:String(title||'').trim()||url,url,folder:String(folder||'').trim().slice(0,60),t:Date.now()});saveBm();pushBm();pushTabs();return{ok:true}});
H('bmDelete',(e,ids)=>{const set=new Set(ids||[]);bookmarks=bookmarks.filter(b=>!set.has(b.id));saveBm();pushBm();pushTabs();return true});
H('bmMove',(e,{ids,folder})=>{const set=new Set(ids||[]),f=String(folder||'').trim().slice(0,60);for(const b of bookmarks)if(set.has(b.id))b.folder=f;saveBm();pushBm();return true});
H('bmExport',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'bookmarks.html',filters:[{name:'Закладки (HTML)',extensions:['html']}]});if(r.canceled||!r.filePath)return{canceled:true};fs.writeFileSync(r.filePath,bookmarksHtml());return{ok:true,n:bookmarks.length}});
H('bmImport',async()=>{const r=await openDlg(win,{filters:[{name:'Закладки (HTML)',extensions:['html','htm']}],properties:['openFile']});if(r.canceled||!r.filePaths||!r.filePaths[0])return{canceled:true};
 const items=parseBookmarksHtml(fs.readFileSync(r.filePaths[0],'utf8')),have=new Set(bookmarks.map(b=>b.url+'|'+(b.folder||'')));let n=0;
 for(const b of items){const k=b.url+'|'+b.folder;if(have.has(k))continue;have.add(k);bookmarks.push({id:uid(),title:b.title,url:b.url,folder:b.folder,t:Date.now()});n++}
 saveBm();pushBm();return{ok:true,n}});
H('bmChipMenu',(e,{id,anchor})=>{const b=bookmarks.find(x=>x.id===id);if(!b)return;
 showMenu([{label:'Открыть',fn:()=>navTo(b.url)},{label:'Открыть в новой вкладке',fn:()=>openTabNear(b.url,false)},{label:'Открыть в фоновой вкладке',fn:()=>openTabNear(b.url,true)},{label:'Открыть в профиле…',fn:()=>profileMenu(null,b.url)},{type:'sep'},{label:'Изменить в менеджере закладок',fn:()=>openPage('bookmarks')},{label:'Удалить закладку',fn:()=>{bookmarks=bookmarks.filter(x=>x.id!==id);saveBm();pushBm();pushTabs()}}],anchor||cursorAnchor())});
H('bmFolderMenu',(e,{name,anchor})=>{const items=bookmarks.filter(b=>(b.folder||'')===name).map(b=>({label:b.title||b.url,tag:hostOf(b.url),fn:()=>navTo(b.url),alt:()=>openTabNear(b.url,true)}));
 if(items.length)showMenu(items,anchor,{width:340})});
H('tabMenu',(e,{id,anchor,ids})=>{
 if(ids&&ids.length>1&&ids.includes(id)){const n=ids.length;
  showMenu([{label:'Выбрано вкладок: '+n,type:'header'},{label:'Обновить',fn:()=>tabsAction(ids,'reload')},{label:'Дублировать',fn:()=>tabsAction(ids,'duplicate')},{label:'Закрепить / открепить',fn:()=>tabsAction(ids,'pin')},{label:'Отключить / включить звук',fn:()=>tabsAction(ids,'mute')},{label:'Добавить в закладки (в папку)',fn:()=>tabsAction(ids,'bookmark')},{label:'Открыть в новом окне',fn:()=>tabsAction(ids,'window')},...winItems(ids),{type:'sep'},{label:'Закрыть выбранные ('+n+')',hint:'Delete',fn:()=>tabsAction(ids,'close')}],anchor||cursorAnchor());return}
 const t=tabs.find(x=>x.id===id);if(!t)return;const i=tabs.indexOf(t),items=[];
 if(!t.kind)items.push({label:'Обновить',fn:()=>t.view.webContents.reload()},{label:'Дублировать',fn:()=>newTab(t.pid,t.view.webContents.getURL()||t.url,false,t.id)},{label:t.pinned?'Открепить вкладку':'Закрепить вкладку',fn:()=>pinTab(id)},{label:t.muted?'Включить звук вкладки':'Отключить звук вкладки',fn:()=>{const w=t.view.webContents;w.setAudioMuted(!w.isAudioMuted());t.muted=w.isAudioMuted();pushTabs()}});
 if(tabs.length>1)items.push({label:'Открыть в новом окне',fn:()=>{const pt=screen.getCursorScreenPoint();detachTab(id,pt.x,pt.y)}});
 items.push(...winItems([id]));
 items.push({type:'sep'},{label:'Закрыть',hint:'Ctrl+W',fn:()=>closeTab(id)});
 if(tabs.length>1)items.push({label:'Закрыть остальные',fn:()=>{for(const x of tabs.filter(y=>y.id!==id))closeTab(x.id)}});
 if(i<tabs.length-1)items.push({label:'Закрыть вкладки справа',fn:()=>{for(const x of tabs.slice(i+1))closeTab(x.id)}});
 showMenu(items,anchor||cursorAnchor())});
H('dlgResult',(e,{id,i,text})=>{const d=dlgs.get(id);if(d){dlgs.delete(id);d.res({response:i,text});if(!d.w.isDestroyed())d.w.close()}});
H('dlgResize',(e,{id,h})=>{const d=dlgs.get(id);if(!d||d.w.isDestroyed())return;d.w.setContentSize(450,Math.max(150,Math.min(h,520)));
 const P=windows.find(x=>!x.dead);if(P){const b=P.win.getBounds();d.w.setPosition(Math.round(b.x+(b.width-450)/2),Math.round(b.y+(b.height-h)/3))}});
H('uiConfirm',(e,m)=>appDialog({message:String(m),buttons:['Да','Отмена'],defaultId:0,cancelId:1,type:'question'}).then(r=>r.response===0));
H('uiAlert',(e,m)=>appDialog({message:String(m)}).then(()=>true));
H('adToggle',()=>{cfg.adblock=!cfg.adblock;saveCfg();pushTabs();return cfg.adblock});
H('adInfo',()=>({domains:adSet.size,count:adCount,updated:adUpdated,engine:!!adEngine}));
H('adUpdate',async()=>{const ok=await updateAds(true);return{ok,domains:adSet.size,updated:adUpdated}});
H('showLog',()=>{shell.showItemInFolder(LOG())});
const ovl=()=>{const d=themeNow()==='dark';return{color:d?'#181c25':'#f3f4f7',symbolColor:d?'#e6e9f0':'#1b1f2a',height:40}};
function createWindow(o={}){
 const W={win:null,tabs:[],active:null,mode:'top',dead:false,dlRect:null,first:!!o.first,incognito:!!o.incognito,uid:uid()},b=o.bounds;
 const w=new BrowserWindow({width:(b&&b.width)||1280,height:(b&&b.height)||800,...(b&&Number.isFinite(b.x)&&Number.isFinite(b.y)?{x:b.x,y:b.y}:{}),
  title:'MultiBrowser',icon:ICON,backgroundColor:bgColor(),show:false,titleBarStyle:'hidden',titleBarOverlay:o.incognito?{color:'#2b2140',symbolColor:'#e6e9f0',height:40}:ovl(),
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,backgroundThrottling:false}});
 W.win=w;windows.push(W);w.loadFile('ui/shell.html');
 const c=fn=>(...a)=>{if(useW(W))fn(...a)};
 w.once('ready-to-show',c(()=>{if(o.instant){w.show();return}w.setOpacity(0);w.show();fadeTo(1,240)}));   // плавное появление
 setTimeout(()=>{if(!w.isDestroyed()&&!w.isVisible()){w.show();w.setOpacity(1)}},4000);
 w.on('minimize',()=>{try{w.setOpacity(0)}catch{}});                         // скрываем кадр перерисовки при разворачивании
 w.on('restore',c(()=>fadeTo(1,90)));
 w.on('show',c(()=>{if(w.getOpacity()<1&&!fading)fadeTo(1,90)}));
 w.on('resize',c(()=>{hideMenu();hideToast()}));
 w.webContents.on('before-input-event',(e,i)=>{if(useW(W)&&hotkey(i,w.webContents))e.preventDefault()});
 w.webContents.on('did-finish-load',c(()=>{layout();pushTabs();pushBm();if(W.first&&!started){started=true;restoreSession()}}));
 for(const ev of ['resize','maximize','unmaximize','enter-full-screen','leave-full-screen'])w.on(ev,c(layout));
 w.on('focus',()=>{W.fseq=++focusSeq});W.fseq=++focusSeq;
 w.on('close',()=>{
  if(W.incognito)return;
  const othersN=windows.some(x=>!x.dead&&x!==W&&!x.incognito);
  if(W.tabs.length){const st=windowState(W);recentClosed.push({t:Date.now(),state:st});if(recentClosed.length>10)recentClosed.shift();
   if(othersN){closedTabs.push({type:'window',state:st});if(closedTabs.length>30)closedTabs.shift()}}
  if(!othersN&&useW(W))saveSession();});
 w.on('closed',()=>{W.dead=true;const i=windows.indexOf(W);if(i>=0)windows.splice(i,1);
  if(!windows.length){quitting=true;app.quit()}else{if(curW===W)useW(windows[windows.length-1]);if(!quitting&&windows.some(x=>!x.incognito))saveSoon()}});
 useW(W);return W;
}
const gotLock=typeof app.requestSingleInstanceLock!=='function'||app.requestSingleInstanceLock();   // вторая копия программы не запускается: показывается первая
if(!gotLock)app.quit();
app.on('second-instance',(e,argv)=>{
 const W=windows.filter(x=>!x.dead).sort((a,b)=>(b.fseq||0)-(a.fseq||0))[0];
 if(W){try{if(W.win.isMinimized())W.win.restore();W.win.show();W.win.focus()}catch{}}
 const u=(argv||[]).find(a=>/^https?:\/\//i.test(a));if(u&&W&&useW(W))openUrl(u);
});
app.on('certificate-error',(e,wc,url,error,cert,cb)=>{   // свои локальные серверы с самоподписанным сертификатом: только петля (localhost, 127.0.0.1)
 let h='';try{h=new URL(url).hostname}catch{}
 if(h==='localhost'||h==='127.0.0.1'||h==='[::1]'||h==='::1'){e.preventDefault();cb(true)}else cb(false)});
app.on('render-process-gone',(e,wc,d)=>{   // вкладка упала: обновляем её сама, не больше трёх раз в минуту
 log('render gone: '+(d&&d.reason));const t=tabByWc(wc);if(!t||!d||d.reason==='clean-exit'||d.reason==='killed')return;
 t.crashes=(t.crashes||[]).filter(x=>Date.now()-x<60000);t.crashes.push(Date.now());
 if(t.crashes.length<=3)setTimeout(()=>{try{if(!wc.isDestroyed())wc.reload()}catch{}},800)});
app.on('child-process-gone',(e,d)=>log('child gone: '+((d&&d.type)||'?')+' '+((d&&d.reason)||'')));
function showWhatsNew(){const v=app.getVersion(),prev=cfg.lastVer;cfg.lastVer=v;saveCfg();
 if(prev&&prev!==v){const W=windows.find(w=>!w.dead&&!w.incognito);if(W&&useW(W))openPage('whatsnew')}}
app.whenReady().then(()=>{
 if(!gotLock)return;
 loadCfg();applyTheme();loadDownloads();loadBm();loadScripts();loadAds();loadEngine(false).catch(()=>{});
 try{if(fs.statSync(LOG()).size>200000)fs.rmSync(LOG())}catch{}
 log('start v'+app.getVersion());
 try{app.setAppUserModelId('app.multibrowser')}catch{}
 Menu.setApplicationMenu(null);
 createWindow({first:true});ensureFly();apiApply();setTimeout(()=>showWhatsNew(),3500);
 setupUpdater();setTimeout(()=>extUpdateAll().catch(()=>{}),90000);setInterval(()=>extUpdateAll().catch(()=>{}),24*3600*1000);setTimeout(()=>autoBackupTick().catch(()=>{}),30000);setInterval(()=>autoBackupTick().catch(()=>{}),6*3600*1000);
 setTimeout(()=>updateAds(false).catch(()=>{}),15000);setInterval(()=>updateAds(false).catch(()=>{}),12*3600*1000);
 nativeTheme.on('updated',()=>{broadcastTheme();for(const W of windows){if(W.dead)continue;try{if(!W.incognito)W.win.setTitleBarOverlay(ovl());W.win.setBackgroundColor(bgColor());for(const t of W.tabs)if(t.kind)t.view.setBackgroundColor(bgColor())}catch{}}
  try{if(panel)panel.setBackgroundColor(bgColor());if(menuV)menuV.setBackgroundColor(bgColor())}catch{}});
});
app.on('before-quit',()=>{apiStop();saveHistNow();for(const j of running.values()){kill(j.chrome);cleanup(j)}for(const t of tunnels.values())cleanup(t)});
