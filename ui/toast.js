const $=i=>document.getElementById(i);let cur=null,key='';
const fmt=n=>{if(!n||n<0)return '';const u=['Б','КБ','МБ','ГБ'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+' '+u[i]};
function btn(b,text,act){b.hidden=!text;if(!text)return;b.textContent=text;b.onclick=e=>{e.stopPropagation();api.toastAction({action:act,id:cur&&cur.id})}}
function draw(d){
 if(!d)return;cur=d;const k=d.id+d.state;if(k!==key){key=k;const c=$('c');c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop')}
 $('nm').textContent=d.name;const pg=d.total>0?Math.round(d.received*100/d.total):0;$('ic').classList.toggle('ok',d.state==='completed');
 if(d.state==='progressing'){$('sub').textContent=(d.paused?'Пауза · ':'Загрузка · ')+fmt(d.received)+(d.total>0?' из '+fmt(d.total)+' ('+pg+'%)':'');
  $('bw').hidden=false;$('bi').style.width=(d.total>0?pg:35)+'%';btn($('b1'),'Список','panel');btn($('b2'),'Отмена','cancel')}
 else if(d.state==='completed'){$('sub').textContent='Готово · '+d.profile;$('bw').hidden=true;btn($('b1'),d.exists?'Открыть':'','open');btn($('b2'),d.exists?'В папку':'','show')}
 else{$('sub').textContent=d.state==='cancelled'?'Загрузка отменена':'Загрузка прервана';$('bw').hidden=true;btn($('b1'),'Список','panel');btn($('b2'),'','')}}
$('x').onclick=e=>{e.stopPropagation();api.toastAction({action:'close'})};
$('c').onclick=()=>api.toastAction({action:'panel'});
document.documentElement.addEventListener('mouseenter',()=>api.toastHover(true));document.documentElement.addEventListener('mouseleave',()=>api.toastHover(false));
api.onToast(draw);api.toastGet().then(draw);
