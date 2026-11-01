// Помощники MB для скриптов страниц: MB.click, MB.waitFor, MB.find, MB.sleep, MB.log, MB.autoclick
(function(){
 if(window.MB)return;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.disabled};
 const isSel=t=>/[#.\[\]>:=]/.test(t);
 function find(t){
  t=String(t||'').trim();if(!t)return null;
  if(isSel(t)){try{const e=[...document.querySelectorAll(t)].find(vis);if(e)return e}catch(_){}}
  const low=t.toLowerCase(),els=document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button],[onclick]');
  for(const e of els){const x=((e.innerText||e.value||e.getAttribute('aria-label')||e.title||'')+'').trim().toLowerCase();if(x&&x.includes(low)&&vis(e))return e}
  return null;
 }
 function click(t,o){
  o=o||{};const d=o.delay==null?300:o.delay,done=new WeakSet();
  const tick=()=>{const e=find(t);if(e&&!done.has(e)){done.add(e);setTimeout(()=>{try{e.click()}catch(_){}},d)}};
  tick();const mo=new MutationObserver(tick);mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  const iv=setInterval(tick,1000);return()=>{mo.disconnect();clearInterval(iv)};
 }
 const autoclick=rules=>rules.map(r=>click(r.target,{delay:r.delay}));
 function waitFor(t,timeout){
  return new Promise((res,rej)=>{const t0=Date.now(),tick=()=>{const e=find(t);if(e)return res(e);
   if(Date.now()-t0>(timeout||15000))return rej(new Error('MB.waitFor: не найдено '+t));setTimeout(tick,250)};tick()});
 }
 const log=(...a)=>console.log('[MB]',...a);
 window.MB={find,click,autoclick,waitFor,sleep,log};
})();
