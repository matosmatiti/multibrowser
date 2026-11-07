const $=i=>document.getElementById(i);let all=[],folder='*',sel=new Set(),editing=null;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
let mT=null;const msg=t=>{$('msg').textContent=t;clearTimeout(mT);if(t)mT=setTimeout(()=>{$('msg').textContent=''},3000)};
async function load(){all=await api.bmList();const ids=new Set(all.map(b=>b.id));for(const i of [...sel])if(!ids.has(i))sel.delete(i);draw()}
const names=()=>[...new Set(all.map(b=>b.folder||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
function drawFolders(){const F=$('folders');F.replaceChildren();
 const mk=(label,val,n,ed)=>{const row=el('div',null,'f'),b=el('button',null,'fb'+(folder===val?' on':''));b.append(el('span',label),el('span',String(n),'cnt'));b.onclick=()=>{folder=val;draw()};row.append(b);
  if(ed){const r=el('button','✎','small');r.title='Переименовать';r.onclick=()=>renameFolder(val,row,b);const d=el('button','✕','small');d.title='Удалить папку (закладки останутся на панели)';
   d.onclick=async()=>{if(await api.confirm('Удалить папку «'+val+'»? Закладки из неё останутся на панели.')){await api.bmMove({ids:all.filter(x=>x.folder===val).map(x=>x.id),folder:''});if(folder===val)folder='*';load()}};row.append(r,d)}F.append(row)};
 mk('Все закладки','*',all.length);mk('Панель закладок','',all.filter(b=>!b.folder).length);for(const n of names())mk(n,n,all.filter(b=>b.folder===n).length,true);
 const dl=$('fl');dl.replaceChildren();for(const n of names()){const o=document.createElement('option');o.value=n;dl.append(o)}}
function renameFolder(old,row,btn){const i=el('input');i.value=old;row.replaceChildren(i);i.focus();i.select();let done=false;
 const fin=async ok=>{if(done)return;done=true;const v=i.value.trim();if(ok&&v&&v!==old){await api.bmMove({ids:all.filter(x=>x.folder===old).map(x=>x.id),folder:v});if(folder===old)folder=v}load()};
 i.onkeydown=e=>{if(e.key==='Enter')fin(true);else if(e.key==='Escape')fin(false)};i.onblur=()=>fin(true)}
function draw(){drawFolders();const q=$('q').value.trim().toLowerCase(),L=$('list');L.replaceChildren();
 const list=all.filter(b=>(folder==='*'||(b.folder||'')===folder)&&(!q||((b.title||'')+' '+b.url+' '+(b.folder||'')).toLowerCase().includes(q)));
 $('none').hidden=list.length>0;$('none').textContent=all.length?'Здесь пусто или ничего не найдено.':'Закладок пока нет. Нажми ☆ в адресной строке, Ctrl+D на странице или «Импорт».';
 $('bulk').hidden=!sel.size;$('cnt').textContent=sel.size;
 for(const b of list){const r=el('div',null,'row'),cb=el('input');cb.type='checkbox';cb.checked=sel.has(b.id);cb.onchange=()=>{cb.checked?sel.add(b.id):sel.delete(b.id);draw()};r.append(cb);
  if(editing===b.id){const f=el('div',null,'edit'),t=el('input'),u=el('input'),fo=el('input'),sv=el('button','Сохранить','p');t.value=b.title||'';u.value=b.url;fo.value=b.folder||'';fo.setAttribute('list','fl');fo.placeholder='Папка';
   sv.onclick=async()=>{await api.bmSave({id:b.id,title:t.value,url:u.value,folder:fo.value});editing=null;load()};
   [t,u,fo].forEach(x=>x.onkeydown=e=>{if(e.key==='Enter')sv.click();else if(e.key==='Escape'){editing=null;draw()}});
   const cn=el('button','Отмена');cn.onclick=()=>{editing=null;draw()};f.append(t,u,fo,el('div'));r.append(f);const a=el('div',null,'act');a.append(sv,cn);r.append(a);L.append(r);continue}
  const m=el('div',null,'main2'),tt=el('div',null,'ttl');tt.append(b.title||b.url);if(b.folder)tt.append(el('span',b.folder,'tag'));m.append(tt,el('div',b.url,'m'));
  const a=el('div',null,'act'),o=el('button','Открыть','p'),pr=el('button','В профиле…'),ed=el('button','Изменить'),dl=el('button','Удалить');
  o.onclick=()=>api.openUrl({url:b.url});pr.onclick=()=>api.openUrl({url:b.url,pick:true});ed.onclick=()=>{editing=b.id;draw()};
  dl.onclick=async()=>{await api.bmDelete([b.id]);load()};a.append(o,pr,ed,dl);r.append(m,a);L.append(r)}}
$('q').oninput=draw;
$('add').onclick=()=>{$('addbox').hidden=!$('addbox').hidden;$('af').value=(folder!=='*'?folder:'');if(!$('addbox').hidden)$('au').focus()};
$('acancel').onclick=()=>{$('addbox').hidden=true};
$('asave').onclick=async()=>{const r=await api.bmAdd({title:$('at').value,url:$('au').value,folder:$('af').value});if(r&&r.error){msg(r.error);return}$('at').value='';$('au').value='';$('addbox').hidden=true;msg('Закладка добавлена');load()};
$('nfb').onclick=()=>{const v=$('nf').value.trim();if(!v)return;$('af').value=v;$('mv').value=v;folder=v;$('nf').value='';$('addbox').hidden=false;$('au').focus();msg('Папка появится после добавления в неё первой закладки')};
$('nf').onkeydown=e=>{if(e.key==='Enter')$('nfb').click()};
$('all').onclick=()=>{const q=$('q').value.trim().toLowerCase(),vis=all.filter(b=>(folder==='*'||(b.folder||'')===folder)&&(!q||((b.title||'')+' '+b.url+' '+(b.folder||'')).toLowerCase().includes(q)));const allOn=vis.every(b=>sel.has(b.id));for(const b of vis)allOn?sel.delete(b.id):sel.add(b.id);draw()};
$('bclr').onclick=()=>{sel.clear();draw()};
$('bdel').onclick=async()=>{if(await api.confirm('Удалить выбранные закладки ('+sel.size+')?')){await api.bmDelete([...sel]);sel.clear();msg('Удалено');load()}};
$('bmv').onclick=async()=>{await api.bmMove({ids:[...sel],folder:$('mv').value});sel.clear();$('mv').value='';msg('Перенесено');load()};
$('bopen').onclick=()=>{for(const b of all.filter(x=>sel.has(x.id)))api.openUrl({url:b.url})};
$('imp').onclick=async()=>{const r=await api.bmImport();if(r&&r.ok){msg('Импортировано закладок: '+r.n);load()}};
$('exp').onclick=async()=>{const r=await api.bmExport();if(r&&r.ok)msg('Экспортировано закладок: '+r.n)};
api.onBmChanged(load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});load();
