const $=i=>document.getElementById(i);let t=null;
function flash(){const o=$('ok');o.textContent='Сохранено';clearTimeout(t);t=setTimeout(()=>o.textContent='',1500)}
async function save(p){await api.setSettings(p);flash()}
async function init(){const c=await api.getSettings();
 for(const k of ['search','home','theme','siteDark'])$(k).value=c[k];
 for(const k of ['restore','autoUpdate','bmBar','keepHistory','dlToast','adblock'])$(k).checked=!!c[k];
 const showDd=c=>{$('ddv').textContent=c.downloadDir||('Системная: '+c.dlDefault)};showDd(c);
 $('dd').onclick=async()=>{const f=await api.pickFolder();if(f){c.downloadDir=f;showDd(c);save({downloadDir:f})}};
 $('ddr').onclick=()=>{c.downloadDir='';showDd(c);save({downloadDir:''})};
 $('custom').value=c.customHome||'';$('cr').hidden=c.home!=='custom';$('ver').textContent=c.version;
 for(const k of ['search','theme'])$(k).onchange=()=>save({[k]:$(k).value});
 $('siteDark').onchange=()=>{save({siteDark:$('siteDark').value});api.alert('Изменение применится после перезапуска программы.')};
 $('home').onchange=()=>{$('cr').hidden=$('home').value!=='custom';save({home:$('home').value})};
 $('custom').onchange=()=>save({customHome:$('custom').value.trim()});
 for(const k of ['restore','autoUpdate','bmBar','keepHistory','dlToast','adblock'])$(k).onchange=()=>save({[k]:$(k).checked});
 const adShow=async()=>{const i=await api.adInfo();$('adv').textContent=i.domains+' доменов'+(i.updated?', обновлено '+new Date(i.updated).toLocaleDateString('ru-RU'):'')};adShow();
 $('adu').onclick=async()=>{$('adu').disabled=true;$('adu').textContent='Обновляю…';await api.adUpdate();$('adu').disabled=false;$('adu').textContent='Обновить сейчас';adShow();flash()};
 $('chk').onclick=()=>api.checkUpdates();$('log').onclick=()=>api.showLog()}
init();
