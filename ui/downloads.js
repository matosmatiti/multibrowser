const $=i=>document.getElementById(i);
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const fmt=n=>{if(!n||n<0)return '';const u=['Б','КБ','МБ','ГБ'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+' '+u[i]};
const btn=(t,a,id,dis)=>{const b=el('button',t);b.disabled=!!dis;b.onclick=()=>api.dlAction({id,action:a});return b};
function draw(list){const L=$('list');L.replaceChildren();$('none').hidden=list.length>0;
 for(const d of list){const it=el('div',null,'it');it.append(el('div',d.name,'nm'));
  it.append(el('div','Профиль: '+d.profile+' · '+d.folder,'m'));
  const a=el('div',null,'act');
  if(d.state==='progressing'){const pc=d.total>0?Math.round(d.received*100/d.total):0,b=el('div',null,'bar'),i=el('i');i.style.width=(d.total>0?pc:30)+'%';b.append(i);it.append(b);
   it.append(el('div',(d.paused?'Пауза · ':'')+fmt(d.received)+(d.total>0?' из '+fmt(d.total)+' ('+pc+'%)':''),'m'));
   a.append(btn(d.paused?'Продолжить':'Пауза',d.paused?'resume':'pause',d.id),btn('Отмена','cancel',d.id))}
  else if(d.state==='completed'){it.append(el('div',d.exists?'Завершено · '+fmt(d.total||d.received):'Файл удалён или перемещён','m'));
   a.append(btn('Открыть','open',d.id,!d.exists),btn('В папку','show',d.id,!d.exists),btn('Убрать','remove',d.id))}
  else{it.append(el('div',d.state==='cancelled'?'Отменено':'Прервано','m'));
   if(d.live)a.append(btn('Продолжить','resume',d.id),btn('Отмена','cancel',d.id));else a.append(btn('Убрать','remove',d.id))}
  it.append(a);L.append(it)}}
$('clr').onclick=()=>api.dlAction({action:'clear'});
api.onDownloads(draw);api.dlList().then(draw);
