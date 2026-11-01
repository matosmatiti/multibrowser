const $=i=>document.getElementById(i);let all=[],cur=null;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const EX={
 click:"// Нажимать кнопку с таким текстом, когда она появится\nMB.click('Принять все', {delay: 500});",
 wait:"// Дождаться кнопки и нажать\nconst b = await MB.waitFor('button.continue', 20000);\nawait MB.sleep(500);\nb.click();",
 hide:"// Скрыть назойливые блоки\nconst s = document.createElement('style');\ns.textContent = '.banner, .popup, [class*=\"cookie\"] { display: none !important; }';\ndocument.head.append(s);"};
async function load(){all=await api.scList();draw()}
function draw(){const L=$('list');L.replaceChildren();for(const s of all){const b=el('button',s.name,'sc'+(cur&&cur.id===s.id?' on':''));b.onclick=()=>open(s);L.append(b)}}
function open(s){cur=s;$('hint').hidden=true;$('ed').hidden=false;$('name').value=s.name||'';$('match').value=(s.match||[]).join('\n');$('runAt').value=s.runAt||'dom-ready';$('code').value=s.code||'';$('msg').textContent='';draw()}
$('new').onclick=()=>open({id:null,name:'',match:['*'],runAt:'dom-ready',code:''});
$('save').onclick=async()=>{if(!$('name').value.trim()){$('msg').textContent='Укажи название';return}
 const id=await api.scSave({id:cur&&cur.id,name:$('name').value,match:$('match').value,runAt:$('runAt').value,code:$('code').value});
 await load();cur=all.find(s=>s.id===id)||cur;draw();$('msg').textContent='Сохранено'};
$('del').onclick=async()=>{if(cur&&cur.id&&confirm('Удалить скрипт «'+cur.name+'»?')){await api.scDelete(cur.id);cur=null;$('ed').hidden=true;$('hint').hidden=false;load()}};
$('ex').onchange=()=>{const k=$('ex').value;if(k){const c=$('code');c.value=(c.value?c.value+'\n\n':'')+EX[k];$('ex').value=''}};
$('code').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();const c=e.target,s=c.selectionStart;c.value=c.value.slice(0,s)+'  '+c.value.slice(c.selectionEnd);c.selectionStart=c.selectionEnd=s+2}};
load();
