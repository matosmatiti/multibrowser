const $=i=>document.getElementById(i);let data={items:[],search:false},sel=-1;
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
function render(d,keep){if(!keep)$('s').value='';data=d;const L=$('in');L.replaceChildren();$('s').hidden=!d.search;const q=$('s').value.trim().toLowerCase();
 for(const it of d.items){
  if(it.type==='sep'){L.append(el('div',null,'sp'));continue}
  if(it.type==='header'){L.append(el('div',it.label,'hd'));continue}
  if(q&&!it.label.toLowerCase().includes(q))continue;
  const r=el('button',null,'it');r.disabled=!!it.disabled;
  if(it.color){const c=el('span',it.letter||'','dot');c.style.background=it.color;r.append(c)}
  else if(it.checked!==undefined)r.append(el('span',it.checked?'✓':'','chk'));
  r.append(el('span',it.label,'lb'));if(it.tag||it.hint)r.append(el('span',it.tag||it.hint,'hint'));
  if(it.id)r.onclick=()=>api.menuPick(it.id);L.append(r)}
 sel=-1;const b=$('box');b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');
 requestAnimationFrame(()=>api.menuResize(($('s').hidden?0:$('s').offsetHeight+12)+L.offsetHeight+10));
 if(d.search&&!keep)$('s').focus()}
$('s').oninput=()=>render(data,true);
document.addEventListener('keydown',e=>{const its=[...document.querySelectorAll('.it:not(:disabled)')];
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!its.length)return;sel=(sel+(e.key==='ArrowDown'?1:-1)+its.length)%its.length;its.forEach((x,i)=>x.classList.toggle('sel',i===sel));its[sel].scrollIntoView({block:'nearest'})}
 else if(e.key==='Enter'){const x=its[sel>=0?sel:0];if(x)x.click()}});
api.onMenu(d=>render(d,false));api.menuGet().then(d=>{if(d&&d.items&&d.items.length)render(d,false)});
