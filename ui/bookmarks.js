const $=i=>document.getElementById(i);let all=[];
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
async function load(){all=await api.bmList();draw()}
function draw(){const q=$('q').value.trim().toLowerCase(),L=$('list');L.replaceChildren();
 const list=all.filter(b=>!q||(b.title+' '+b.url).toLowerCase().includes(q));$('none').hidden=list.length>0;
 $('none').textContent=all.length?'Ничего не найдено.':'Закладок пока нет. Нажми ☆ в адресной строке или Ctrl+D на странице.';
 for(const b of list){const r=el('div',null,'row'),m=el('div',null,'main'),tt=el('div',b.title,'ttl');m.append(tt,el('div',b.url,'m'));
  const a=el('div',null,'act'),o=el('button','Открыть','p'),pr=el('button','В профиле…'),rn=el('button','Переименовать'),dl=el('button','Удалить');
  o.onclick=()=>api.openUrl({url:b.url});pr.onclick=()=>api.openUrl({url:b.url,pick:true});
  dl.onclick=async()=>{await api.bmRemove(b.id);load()};
  rn.onclick=()=>{const i=el('input');i.value=b.title;tt.replaceChildren(i);i.focus();i.select();let done=false;
   const fin=async ok=>{if(done)return;done=true;if(ok&&i.value.trim())await api.bmRename({id:b.id,title:i.value});load()};
   i.onkeydown=e=>{if(e.key==='Enter')fin(true);else if(e.key==='Escape')fin(false)};i.onblur=()=>fin(true)};
  a.append(o,pr,rn,dl);r.append(m,a);L.append(r)}}
$('q').oninput=draw;api.onBmChanged(load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});load();
