// MultiBrowser, этап 1: профили, запуск движка, прокси и VPN-конфиги (WireGuard/AmneziaWG)
const {app,BrowserWindow,ipcMain,safeStorage,dialog}=require('electron');
const path=require('path'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn}=require('child_process');
const RES=app.isPackaged?process.resourcesPath:path.join(__dirname,'resources');
const DATA=()=>app.getPath('userData'), FILE=()=>path.join(DATA(),'profiles.json');
const running=new Map(); let win;
const load=()=>{try{return JSON.parse(fs.readFileSync(FILE(),'utf8'))}catch{return[]}};
const save=l=>fs.writeFileSync(FILE(),JSON.stringify(l,null,1));
// секреты (пароли, VPN-конфиги) шифруются средствами Windows (DPAPI), мастер-пароль не нужен
const enc=s=>safeStorage.encryptString(s).toString('base64');
const dec=s=>safeStorage.decryptString(Buffer.from(s,'base64'));
function findFile(dir,name){try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
 if(e.isDirectory()){const r=findFile(p,name);if(r)return r}else if(e.name.toLowerCase()===name)return p}}catch{}return null}
const freePort=()=>new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
const probe=p=>new Promise(r=>{const c=net.connect(p,'127.0.0.1');c.on('connect',()=>{c.destroy();r(true)});c.on('error',()=>r(false))});
async function waitPort(p){for(let i=0;i<40;i++){if(await probe(p))return true;await new Promise(r=>setTimeout(r,200))}return false}
const kill=c=>{try{c&&c.pid&&spawn('taskkill',['/pid',String(c.pid),'/T','/F'],{windowsHide:true})}catch{}};
function cleanup(j){kill(j.wp);if(j.conf)try{fs.rmSync(j.conf,{force:true})}catch{}}
const push=()=>win&&win.webContents.send('state',[...running.keys()]);
const view=()=>load().map(p=>({id:p.id,name:p.name,kind:p.vpn?'VPN-конфиг':p.proxy?p.proxy.type.toUpperCase()+' '+p.proxy.host+':'+p.proxy.port:'Без прокси'}));

async function launch(id){
 const p=load().find(x=>x.id===id); if(!p||running.has(id))return;
 const chrome=findFile(path.join(RES,'engine'),'chrome.exe'); if(!chrome)throw new Error('Движок не найден (resources/engine)');
 const job={}; let proxy=null;
 if(p.vpn){ // VPN-конфиг -> локальный туннель wireproxy (без прав администратора), профиль ходит через него
  const port=await freePort(), dir=path.join(DATA(),'run'); fs.mkdirSync(dir,{recursive:true});
  job.conf=path.join(dir,id+'.conf');
  fs.writeFileSync(job.conf,dec(p.vpn)+`\n\n[Socks5]\nBindAddress = 127.0.0.1:${port}\n`);
  job.wp=spawn(path.join(RES,'wireproxy.exe'),['-s','-c',job.conf],{windowsHide:true});
  if(!await waitPort(port)){cleanup(job);throw new Error('VPN-туннель не поднялся: проверь конфиг')}
  proxy=`socks5://127.0.0.1:${port}`;
 } else if(p.proxy) proxy=`${p.proxy.type}://${p.proxy.host}:${p.proxy.port}`;
 const args=[`--user-data-dir=${path.join(DATA(),'profiles',id)}`,`--fingerprint=${p.seed}`,'--no-first-run','--no-default-browser-check'];
 if(proxy)args.push(`--proxy-server=${proxy}`,'--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
 job.chrome=spawn(chrome,args); running.set(id,job); push();
 job.chrome.on('exit',()=>{cleanup(job);running.delete(id);push()});
}
ipcMain.handle('list',()=>({profiles:view(),running:[...running.keys()]}));
ipcMain.handle('pickConf',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'VPN-конфиг',extensions:['conf']}],properties:['openFile']});
 return r.canceled?null:{name:path.basename(r.filePaths[0]),text:fs.readFileSync(r.filePaths[0],'utf8')}});
ipcMain.handle('add',(e,d)=>{const l=load(),p={id:crypto.randomUUID(),name:d.name||'Профиль',seed:crypto.randomInt(1,2147483647)};
 if(d.mode==='vpn'&&d.confText)p.vpn=enc(d.confText);
 else if(d.mode==='proxy'&&d.host)p.proxy={type:d.type,host:d.host,port:d.port};
 l.push(p);save(l)});
ipcMain.handle('launch',async(e,id)=>{try{await launch(id);return null}catch(x){return x.message}});
ipcMain.handle('stop',(e,id)=>{const j=running.get(id);if(j)kill(j.chrome)});
ipcMain.handle('remove',(e,id)=>{const j=running.get(id);if(j){kill(j.chrome);cleanup(j);running.delete(id)}save(load().filter(p=>p.id!==id))});
app.whenReady().then(()=>{win=new BrowserWindow({width:1100,height:700,title:'MultiBrowser',backgroundColor:'#12151c',
 webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}});win.setMenuBarVisibility(false);win.loadFile('ui/index.html')});
app.on('before-quit',()=>{for(const j of running.values()){kill(j.chrome);cleanup(j)}});
