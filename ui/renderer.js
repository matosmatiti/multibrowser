const $=i=>document.getElementById(i);let conf=null,run=[],all=[];
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
function show(){const q=$('q').value.trim().toLowerCase(),b=$('rows');b.replaceChildren();
 const list=all.filter(p=>!q||(p.name+' '+p.kind).toLowerCase().includes(q));
 $('none').textContent=all.length?(list.length?'':'Ничего не найдено.'):'Профилей пока нет. Нажми «+ Новый профиль» и создай первый.';
 for(const p of list){const on=run.includes(p.id),tr=el('tr'),n=el('td'),ic=el('span',p.name[0].toUpperCase(),'ic');ic.style.background=p.color;n.append(ic,p.name);
  tr.append(n,el('td',p.kind,'m'),el('td',on?'● Запущен':'○ Остановлен',on?'on':'m'));
  const td=el('td'),sh=el('button','Открыть в оболочке','p'),go=el('button',on?'Закрыть':'Усиленный режим'),rm=el('button','Удалить');
  sh.onclick=()=>api.openInShell(p.id);
  go.onclick=async()=>{if(on)await api.stop(p.id);else{const e=await api.launch(p.id);if(e)alert(e)}draw()};
  rm.onclick=async()=>{if(confirm('Удалить профиль «'+p.name+'»?')){await api.remove(p.id);draw()}};
  td.append(sh,' ',go,' ',rm);tr.append(td);b.append(tr)}}
async function draw(){const d=await api.list();all=d.profiles;run=d.running;if(!all.length)$('form').hidden=false;show()}
$('q').oninput=show;$('new').onclick=()=>{$('form').hidden=!$('form').hidden};$('cancel').onclick=()=>{$('form').hidden=true};
$('mode').onchange=()=>{const m=$('mode').value;$('px').hidden=m!=='proxy';$('pick').hidden=m!=='vpn'};
$('pick').onclick=async()=>{const r=await api.pickConf();if(r){conf=r.text;$('cf').textContent=r.name}};
$('add').onclick=async()=>{await api.add({name:$('n').value,mode:$('mode').value,type:$('ty').value,host:$('h').value,port:$('po').value,user:$('us').value,pass:$('pw').value,confText:conf});
 $('n').value='';$('us').value='';$('pw').value='';conf=null;$('cf').textContent='';$('form').hidden=true;draw()};
api.onState(draw);draw();
