const $=i=>document.getElementById(i);let t=null;
function flash(){const o=$('ok');o.textContent='Сохранено';clearTimeout(t);t=setTimeout(()=>o.textContent='',1500)}
async function save(p){await api.setSettings(p);flash()}
async function init(){const c=await api.getSettings();
 for(const k of ['search','home','theme'])$(k).value=c[k];
 for(const k of ['restore','autoUpdate'])$(k).checked=!!c[k];
 $('custom').value=c.customHome||'';$('cr').hidden=c.home!=='custom';$('ver').textContent=c.version;
 for(const k of ['search','theme'])$(k).onchange=()=>save({[k]:$(k).value});
 $('home').onchange=()=>{$('cr').hidden=$('home').value!=='custom';save({home:$('home').value})};
 $('custom').onchange=()=>save({customHome:$('custom').value.trim()});
 for(const k of ['restore','autoUpdate'])$(k).onchange=()=>save({[k]:$(k).checked});
 $('chk').onclick=()=>api.checkUpdates()}
init();
