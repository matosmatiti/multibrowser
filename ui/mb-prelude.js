// Помощники MB для скриптов страниц: MB.click, MB.waitFor, MB.find, MB.findAll, MB.sleep, MB.log, MB.autoclick
(function(){
 if(window.MB)return;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const shown=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 // «активна» = можно нажать: не disabled, не aria-disabled, без pointer-events:none, не занята (aria-busy)
 const enabled=e=>!(e.disabled||e.getAttribute('aria-disabled')==='true'||e.hasAttribute('data-disabled')||e.getAttribute('aria-busy')==='true'||getComputedStyle(e).pointerEvents==='none');
 const isSel=t=>/[#.\[\]>:=]/.test(t);
 function findAll(t){
  t=String(t||'').trim();if(!t)return [];
  if(isSel(t)){try{const l=[...document.querySelectorAll(t)].filter(shown);if(l.length)return l}catch(_){}}
  const low=t.toLowerCase(),out=[];
  for(const e of document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button],[onclick]')){
   const x=((e.innerText||e.value||e.getAttribute('aria-label')||e.title||'')+'').trim().toLowerCase();
   if(x&&x.includes(low)&&shown(e))out.push(e)}
  return out;
 }
 const find=t=>findAll(t).find(enabled)||null;
 // Нажимает кнопку, когда она становится АКТИВНОЙ; если станет неактивной и снова активной, нажмёт ещё раз
 function click(t,o){
  o=o||{};const d=o.delay==null?300:o.delay,clicked=new WeakSet();
  const tick=()=>{for(const e of findAll(t)){
   if(enabled(e)){if(!clicked.has(e)){clicked.add(e);setTimeout(()=>{try{if(document.contains(e)&&enabled(e))e.click()}catch(_){}},d)}}
   else clicked.delete(e)}};
  tick();const mo=new MutationObserver(tick);mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  const iv=setInterval(tick,700);return()=>{mo.disconnect();clearInterval(iv)};
 }
 const autoclick=rules=>rules.map(r=>click(r.target,{delay:r.delay}));
 function waitFor(t,timeout){
  return new Promise((res,rej)=>{const t0=Date.now(),tick=()=>{const e=find(t);if(e)return res(e);
   if(Date.now()-t0>(timeout||15000))return rej(new Error('MB.waitFor: не найдено '+t));setTimeout(tick,250)};tick()});
 }
 const log=(...a)=>console.log('[MB]',...a);
 window.MB={find,findAll,click,autoclick,waitFor,sleep,log};
})();
