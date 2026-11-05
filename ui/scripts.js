const $=i=>document.getElementById(i);let lib=[],profs=[],cur=null;const openCfg=new Set();
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const EX={
 click:"// Нажимать кнопку с таким текстом, когда она станет активной\nMB.click('Принять все', {delay: 500});",
 wait:"// Дождаться кнопки и нажать\nconst b = await MB.waitFor('button.continue', 20000);\nawait MB.sleep(500);\nb.click();",
 hide:"// Скрыть назойливые блоки\nconst s = document.createElement('style');\ns.textContent = '.banner, .popup, [class*=\"cookie\"] { display: none !important; }';\ndocument.head.append(s);",
 param:"// Параметр seconds задаётся в строке параметров: seconds | Интервал, секунд | number | 30\nsetInterval(() => MB.log('прошло', MB.params.seconds, 'с'), MB.params.seconds * 1000);"};
let msgT=null;const msg=t=>{$('msg').textContent=t;clearTimeout(msgT);msgT=setTimeout(()=>{$('msg').textContent=''},2500)};
const paramsToText=a=>(a||[]).map(p=>[p.key,p.label||p.key,p.type||'text',String(p.def==null?'':p.def).replace(/\n/g,'\\n')].join(' | ')).join('\n');
const textToParams=t=>t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const [key,label,type,...d]=l.split('|').map(x=>x.trim());return{key,label:label||key,type:['number','bool'].includes(type)?type:'text',def:d.join('|').replace(/\\n/g,'\n')}});
async function load(){lib=await api.scList();profs=await api.scProfiles();drawList();if(cur&&cur.id){const s=lib.find(x=>x.id===cur.id);if(s){cur=s;drawProfiles(s)}}}
function drawList(){const q=$('sq').value.trim().toLowerCase(),L=$('list');L.replaceChildren();
 for(const [t,list] of [['Готовые',lib.filter(x=>x.builtin)],['Мои',lib.filter(x=>!x.builtin)]]){
  const f=list.filter(x=>!q||((x.name||'')+' '+(x.desc||'')).toLowerCase().includes(q));if(!f.length)continue;L.append(el('div',t,'gh'));
  for(const s of f){const n=profs.filter(p=>p.enabled.includes(s.id)).length,b=el('button',null,'sc'+(cur&&cur.id===s.id?' on':''));
   b.append(el('span',s.name,'nm'),el('span',n?String(n):'','cnt'));b.title=s.desc||'';b.onclick=()=>show(s);L.append(b)}}}
function field(prm,val,onch){const w=el('label',null,'pf');w.append(el('span',prm.label||prm.key,'pl'));let i;
 if(prm.type==='bool'){i=el('input');i.type='checkbox';i.checked=val===true||val==='true'}
 else if(prm.type==='number'){i=el('input');i.type='number';i.step='any';i.value=val}
 else if(prm.key==='rules'||String(val).includes('\n')){i=el('textarea');i.rows=5;i.value=val;i.spellcheck=false}
 else{i=el('input');i.type='text';i.value=val}
 i.onchange=()=>onch(prm.type==='bool'?i.checked:i.value);w.append(i);return w}
function drawProfiles(s){const P=$('plist');P.replaceChildren();
 if(!profs.length){P.append(el('div','Профилей пока нет.','m'));return}
 for(const p of profs){
  const row=el('div',null,'prow'),lb=el('label'),cb=el('input'),dot=el('span',null,'dot');cb.type='checkbox';cb.checked=p.enabled.includes(s.id);dot.style.background=p.color;
  cb.onchange=async()=>{await api.scToggle({sid:s.id,pid:p.id,on:cb.checked});p.enabled=cb.checked?[...p.enabled,s.id]:p.enabled.filter(x=>x!==s.id);drawList();msg('Готово: открытые страницы профиля «'+p.name+'» обновлены')};
  lb.append(cb,dot,el('span',p.name));row.append(lb);
  if((s.params||[]).length){const g=el('button','⚙ Настройки');g.onclick=()=>{const k=s.id+p.id;openCfg.has(k)?openCfg.delete(k):openCfg.add(k);drawProfiles(s)};row.append(g)}
  P.append(row);
  if(openCfg.has(s.id+p.id)){const box=el('div',null,'pcfg'),cfg={...(p.cfg[s.id]||{})};
   for(const prm of s.params){const v=cfg[prm.key]!==undefined?cfg[prm.key]:prm.def;
    box.append(field(prm,v,async val=>{cfg[prm.key]=val;p.cfg[s.id]={...cfg};await api.scCfg({sid:s.id,pid:p.id,cfg});msg('Сохранено: страницы профиля «'+p.name+'» обновлены')}))}
   const r=el('button','Сбросить к значениям по умолчанию');r.onclick=async()=>{p.cfg[s.id]={};await api.scCfg({sid:s.id,pid:p.id,cfg:{}});drawProfiles(s);msg('Настройки сброшены')};box.append(r);P.append(box)}}}
function show(s){cur=s;$('hint').hidden=true;$('ed').hidden=false;$('ttl').textContent=s.name||'Новый скрипт';$('dsc').textContent=s.desc||'';
 $('badge').textContent=s.builtin?'готовый':(s.id?'мой':'новый');$('msg').textContent='';
 $('bi').hidden=!s.builtin;$('own').hidden=!!s.builtin;$('applybox').hidden=!s.id;
 if(!s.builtin){$('name').value=s.name||'';$('desc').value=s.desc||'';$('type').value=s.type||'js';$('match').value=(s.match||['*']).join('\n');$('runAt').value=s.runAt||'dom-ready';$('code').value=s.code||'';$('params').value=paramsToText(s.params);typeUi()}
 if(s.id)drawProfiles(s);drawList()}
function typeUi(){$('jsbox').hidden=$('type').value==='autoclick'}
$('type').onchange=typeUi;
$('new').onclick=()=>show({id:null,name:'',type:'js',match:['*'],runAt:'dom-ready',code:'',params:[]});
$('sq').oninput=drawList;
$('save').onclick=async()=>{if(!$('name').value.trim()){msg('Укажи название');return}
 const id=await api.scSave({id:cur&&cur.id,name:$('name').value,desc:$('desc').value,type:$('type').value,match:$('match').value,runAt:$('runAt').value,code:$('code').value,params:textToParams($('params').value)});
 await load();const s=lib.find(x=>x.id===id);if(s){show(s);msg('Сохранено')}};
$('del').onclick=async()=>{if(cur&&cur.id&&await api.confirm('Удалить скрипт «'+cur.name+'»?')){await api.scDelete(cur.id);cur=null;$('ed').hidden=true;$('hint').hidden=false;load()}};
$('dup').onclick=async()=>{const id=await api.scDup(cur.id);await load();const s=lib.find(x=>x.id===id);if(s)show(s)};
$('ex').onchange=()=>{const k=$('ex').value;if(k){const c=$('code');c.value=(c.value?c.value+'\n\n':'')+EX[k];$('ex').value=''}};
$('code').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();const c=e.target,s=c.selectionStart;c.value=c.value.slice(0,s)+'  '+c.value.slice(c.selectionEnd);c.selectionStart=c.selectionEnd=s+2}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
load();
