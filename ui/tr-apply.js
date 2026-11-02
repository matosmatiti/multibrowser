(()=>{
 const T=window.__mbTr,tr=window.__mbTrIn;if(!T||!tr)return 0;let k=0;
 for(let i=0;i<T.nodes.length;i++){const s=tr[i];if(s==null||s==='')continue;
  const o=T.orig[i],lead=o.match(/^\s*/)[0],trail=o.match(/\s*$/)[0];T.nodes[i].nodeValue=lead+String(s).trim()+trail;k++}
 T.translated=true;window.__mbTrIn=null;return k;
})()
