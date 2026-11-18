const q=new URLSearchParams(location.search),$=i=>document.getElementById(i),name=q.get('name')||'Профиль',color=q.get('color')||'#4c8dff',icon=q.get('icon')||'',sp=q.get('s')||'https://www.google.com/search?q=';
document.title=name;$('nm').textContent=name;$('conn').textContent=q.get('conn')||'';
const ic=$('ic');
if(icon.startsWith('img:')){const i=document.createElement('img');i.src=icon.slice(4);ic.append(i)}
else{ic.style.background=color;ic.textContent=icon.startsWith('emoji:')?icon.slice(6):name[0].toUpperCase()}
$('f').onsubmit=e=>{e.preventDefault();const v=$('s').value.trim();if(!v)return;
 location.href=/^https?:\/\//i.test(v)?v:(/^[^\s]+\.[^\s]{2,}$/.test(v)?'https://'+v:sp+encodeURIComponent(v))};
const SV=[['https://ipwho.is/',j=>j.success===false?null:{ip:j.ip,cc:j.country_code,city:j.city,tz:j.timezone&&j.timezone.id,org:j.connection&&(j.connection.isp||j.connection.org)}],
 ['https://api.ip.sb/geoip',j=>({ip:j.ip,cc:j.country_code,city:j.city,tz:j.timezone,org:j.organization||j.isp})],
 ['https://ipinfo.io/json',j=>({ip:j.ip,cc:j.country,city:j.city,tz:j.timezone,org:j.org})]];
(async()=>{let info=null;
 for(const [u,m] of SV){try{const r=await fetch(u,{signal:AbortSignal.timeout(9000)});if(!r.ok)continue;const x=m(await r.json());if(x&&x.ip){info=x;break}}catch{}}
 if(!info){for(const i of ['ip','cc','city','tz','org'])$(i).textContent='не удалось определить';$('note').textContent='Сервисы определения IP не ответили: проверь прокси или VPN этого профиля либо попробуй позже.';return}
 let cn=info.cc||'?';try{cn=new Intl.DisplayNames(['ru'],{type:'region'}).of(info.cc)}catch{}
 $('ip').textContent=info.ip||'?';$('cc').textContent=cn;$('city').textContent=info.city||'?';$('tz').textContent=info.tz||'?';$('org').textContent=info.org||'?'})();
