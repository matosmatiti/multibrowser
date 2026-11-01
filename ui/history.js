const $=i=>document.getElementById(i);
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const f=x=>x.toDateString(),day=t=>{const d=new Date(t);return f(d)===f(new Date())?'Сегодня':f(d)===f(new Date(Date.now()-864e5))?'Вчера':d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})};
async function load(){const list=await api.histList({q:$('q').value.trim()}),L=$('list');L.replaceChildren();
 $('none').hidden=list.length>0;$('none').textContent=$('q').value.trim()?'Ничего не найдено.':'История пуста.';let cur='';
 for(const h of list){const d=day(h.t);if(d!==cur){cur=d;L.append(el('div',d,'day'))}
  const r=el('div',null,'row'),m=el('div',null,'main');
  m.append(el('div',h.title||h.url,'ttl'),el('div',new Date(h.t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+' · '+h.profile+' · '+h.url,'m'));
  const a=el('div',null,'act'),o=el('button','Открыть','p'),x=el('button','✕');x.title='Удалить из истории';
  o.onclick=()=>api.openUrl({url:h.url,pid:h.pid});x.onclick=async()=>{await api.histRemove(h.id);load()};
  a.append(o,x);r.append(m,a);L.append(r)}}
$('q').oninput=load;$('rf').onclick=load;$('clr').onclick=async()=>{if(await api.confirm('Удалить всю историю?')){await api.histClear();load()}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});load();
