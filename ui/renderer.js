const $=i=>document.getElementById(i);let conf=null,run=[];
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
async function draw(){const d=await api.list();run=d.running;const b=$('rows');b.replaceChildren();
 for(const p of d.profiles){const on=run.includes(p.id),tr=el('tr');
  tr.append(el('td',p.name),el('td',p.kind,'m'),el('td',on?'● Запущен':'○ Остановлен',on?'on':'m'));
  const td=el('td'),go=el('button',on?'Закрыть':'Запустить',on?'':'p'),rm=el('button','Удалить');
  go.onclick=async()=>{if(on)await api.stop(p.id);else{const e=await api.launch(p.id);if(e)alert(e)}draw()};
  rm.onclick=async()=>{if(confirm('Удалить профиль «'+p.name+'»?')){await api.remove(p.id);draw()}};
  td.append(go,' ',rm);tr.append(td);b.append(tr)}}
$('mode').onchange=()=>{const m=$('mode').value;$('px').hidden=m!=='proxy';$('pick').hidden=m!=='vpn'};
$('pick').onclick=async()=>{const r=await api.pickConf();if(r){conf=r.text;$('cf').textContent=r.name}};
$('add').onclick=async()=>{await api.add({name:$('n').value,mode:$('mode').value,type:$('ty').value,host:$('h').value,port:$('po').value,confText:conf});
 $('n').value='';conf=null;$('cf').textContent='';draw()};
api.onState(draw);draw();
