const $=i=>document.getElementById(i);let S={mode:'top',tabs:[],profiles:[]};
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
function tab(t){const d=el('div',null,'tab'+(t.id===S.active?' act':''));d.style.setProperty('--c',t.color);
 d.append(el('span',t.letter,'dot'),el('span',t.title,'ttl'));const x=el('button','×','x');x.title='Закрыть';
 x.onclick=e=>{e.stopPropagation();api.closeTab(t.id)};d.append(x);d.onclick=()=>api.activate(t.id);return d}
function render(){document.body.className=S.mode;const a=$('addr');if(document.activeElement!==a)a.value=S.url||'';
 $('back').disabled=!S.canBack;$('fwd').disabled=!S.canFwd;$('empty').style.display=S.tabs.length?'none':'flex';
 const T=$('tabs'),G=$('groups');T.replaceChildren();G.replaceChildren();
 if(S.mode==='top')for(const t of S.tabs)T.append(tab(t));
 else{for(const p of S.profiles){const h=el('div',null,'gh'),d=el('span',p.id==='_mgr'?'☰':p.name[0].toUpperCase(),'dot');d.style.setProperty('--c',p.color);h.append(d,el('span',p.name));
   if(p.id!=='_mgr'){const b=el('button','+');b.title='Новая вкладка в этом аккаунте';b.onclick=()=>api.newTab(p.id);h.append(b)}
   G.append(h);for(const t of S.tabs.filter(x=>x.pid===p.id))G.append(tab(t))}
  const n=el('button','+ Новая вкладка…');n.onclick=()=>api.newTabMenu();G.append(n)}}
api.onTabs(s=>{S=s;render()});
$('plus').onclick=()=>api.newTabMenu();
$('back').onclick=()=>api.nav('back');$('fwd').onclick=()=>api.nav('forward');$('rl').onclick=()=>api.nav('reload');
$('mgr').onclick=()=>api.openManager();$('mode').onclick=()=>api.setMode(S.mode==='top'?'side':'top');
$('addr').onkeydown=e=>{if(e.key==='Enter'){api.navigate($('addr').value);$('addr').blur()}};
render();
