const q=new URLSearchParams(location.search),$=i=>document.getElementById(i),name=q.get('name')||'Профиль',color=q.get('color')||'#4c8dff',icon=q.get('icon')||'',sp=q.get('s')||'https://www.google.com/search?q=';
document.title=name;$('nm').textContent=name;$('conn').textContent=q.get('conn')||'';
const ic=$('ic');
if(icon.startsWith('img:')){const i=document.createElement('img');i.src=icon.slice(4);ic.append(i)}
else{ic.style.background=color;ic.textContent=icon.startsWith('emoji:')?icon.slice(6):name[0].toUpperCase()}
$('f').onsubmit=e=>{e.preventDefault();const v=$('s').value.trim();if(!v)return;
 location.href=/^https?:\/\//i.test(v)?v:(/^[^\s]+\.[^\s]{2,}$/.test(v)?'https://'+v:sp+encodeURIComponent(v))};
fetch('https://ipinfo.io/json').then(r=>r.json()).then(j=>{
 let cn=j.country||'?';try{cn=new Intl.DisplayNames(['ru'],{type:'region'}).of(j.country)}catch{}
 $('ip').textContent=j.ip||'?';$('cc').textContent=cn;$('city').textContent=[j.city,j.region].filter(Boolean).join(', ')||'?';$('tz').textContent=j.timezone||'?';$('org').textContent=j.org||'?'
}).catch(()=>{for(const i of ['ip','cc','city','tz','org'])$(i).textContent='не удалось определить';$('note').textContent='Нет соединения: проверь прокси или VPN этого профиля.'});
