(()=>{
 if(window.__mbTr&&window.__mbTr.nodes)return null;
 const skip=/^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA|SVG|IFRAME|OPTION)$/;
 const w=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
  const p=n.parentElement;if(!p||skip.test(p.tagName)||p.isContentEditable)return NodeFilter.FILTER_REJECT;
  return /\p{L}/u.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
 const nodes=[],orig=[];let n,total=0;
 while((n=w.nextNode())&&nodes.length<2500&&total<150000){nodes.push(n);orig.push(n.nodeValue);total+=n.nodeValue.length}
 window.__mbTr={nodes,orig};
 return orig.map(s=>s.trim());
})()
