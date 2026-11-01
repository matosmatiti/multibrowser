const q=new URLSearchParams(location.search),id=+q.get('id');let P={};try{P=JSON.parse(q.get('p')||'{}')}catch{}
const ICON={error:'<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',question:'<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',info:'<svg viewBox="0 0 24 24"><path d="M12 11v6M12 7h.01"/><circle cx="12" cy="12" r="9"/></svg>'};
const $=i=>document.getElementById(i);
$('tt').textContent=P.title||'MultiBrowser';$('msg').textContent=P.message||'';$('det').textContent=P.detail||'';
const t=ICON[P.type]?P.type:'info';$('ic').className='ic '+t;$('ic').innerHTML=ICON[t];
const B=P.buttons||['OK'],def=P.defaultId||0,cancel=P.cancelId!=null?P.cancelId:B.length-1;
B.forEach((txt,i)=>{const b=document.createElement('button');b.textContent=txt;if(i===def)b.className='d';b.onclick=()=>api.dlgResult({id,i});$('ac').append(b)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')api.dlgResult({id,i:cancel});else if(e.key==='Enter')api.dlgResult({id,i:def})});
requestAnimationFrame(()=>{api.dlgResize({id,h:document.documentElement.scrollHeight});const d=document.querySelector('button.d');if(d)d.focus()});
