const $=i=>document.getElementById(i);
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
let msgT=null;const msg=(t,err)=>{const m=$('msg');m.textContent=t;m.className=err?'err':'';clearTimeout(msgT);if(t)msgT=setTimeout(()=>{m.textContent=''},5000)};
async function load(){const d=await api.extList(),L=$('list');L.replaceChildren();$('none').hidden=d.exts.length>0;
 for(const x of d.exts){const c=el('div',null,'ex'),h=el('div',null,'eh'),n=el('div',null,'');
  n.append(el('span',x.name,'nm'),el('span','MV'+(x.mv||'?')+(x.version?' · '+x.version:''),'badge'));
  const del=el('button','Удалить');del.onclick=async()=>{if(await api.confirm('Удалить расширение «'+x.name+'»?')){await api.extRemove(x.id);load()}};
  h.append(n,del);c.append(h);
  const pr=el('div',null,'pr');
  if(!d.profiles.length)pr.append(el('span','Профилей пока нет.','m'));
  for(const p of d.profiles){const lb=el('label'),cb=el('input');cb.type='checkbox';cb.checked=p.enabled.includes(x.id);
   cb.onchange=async()=>{await api.extToggle({id:x.id,pid:p.id,on:cb.checked});msg('Готово: страницы профиля «'+p.name+'» обновлены')};
   lb.append(cb,p.name);pr.append(lb)}
  c.append(pr);L.append(c)}}
$('inst').onclick=async()=>{const v=$('src').value.trim();if(!v){msg('Вставь ссылку или идентификатор',true);return}
 $('inst').disabled=true;$('inst').textContent='Скачиваю…';const r=await api.extInstall(v);$('inst').disabled=false;$('inst').textContent='Установить';
 if(r.error)msg(r.error,true);else{msg('Установлено. Включи расширение у нужных профилей.');$('src').value='';load()}};
$('src').addEventListener('keydown',e=>{if(e.key==='Enter')$('inst').click()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
load();
