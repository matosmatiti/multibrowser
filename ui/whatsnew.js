const $=i=>document.getElementById(i);
const el=(t,x)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;return e};
// мини-разбор: «# заголовок», «## раздел», «- пункт», **жирный**
function inline(node,text){const parts=text.split(/(\*\*[^*]+\*\*)/);for(const p of parts){if(/^\*\*[^*]+\*\*$/.test(p))node.append(el('b',p.slice(2,-2)));else if(p)node.append(p)}}
api.changelog().then(md=>{const box=$('c');let cur=box,ul=null,first=true;
 for(const line of String(md).split('\n')){
  if(/^# /.test(line)){$('v').textContent=line.slice(2);ul=null}
  else if(/^### /.test(line)){const d=document.createElement('details');if(first){d.open=true;first=false}const s=el('summary',line.slice(4));d.append(s);box.append(d);cur=d;ul=null}
  else if(/^## /.test(line)){cur.append(el('h2',line.slice(3)));ul=null}
  else if(/^- /.test(line)){if(!ul){ul=el('ul');cur.append(ul)}const li=el('li');inline(li,line.slice(2));ul.append(li)}
  else if(line.trim()){const p=el('p');inline(p,line);cur.append(p);ul=null}}});
