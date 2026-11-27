const $=i=>document.getElementById(i);
const el=(t,x,c)=>{const e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e};
const fmtMs=ms=>{const m=Math.round(ms/60000);if(m<1)return ms>0?'< 1 мин':'0';const h=Math.floor(m/60);return h?h+' ч '+(m%60)+' мин':m+' мин'};
const fmtB=b=>b>=1073741824?(b/1073741824).toFixed(1)+' ГБ':b>=1048576?Math.round(b/1048576)+' МБ':b>=1024?Math.round(b/1024)+' КБ':b+' Б';
const fmtMB=m=>m>=1024?(m/1024).toFixed(1)+' ГБ':m+' МБ';
let timer=null;
function show(n){for(const i of [1,2,3]){$('s'+i).hidden=i!==n;$('n'+i).classList.toggle('on',i===n)}clearInterval(timer);if(n===1)loadStats();if(n===2){loadMetrics();timer=setInterval(loadMetrics,3000)}}
for(const i of [1,2,3])$('n'+i).onclick=()=>show(i);
// ---- использование
async function loadStats(){const d=await api.statsGet(+$('days').value);$('off').hidden=d.enabled;
 const tot=d.byDay.reduce((a,x)=>({ms:a.ms+x.ms,pages:a.pages+x.pages,blk:a.blk+x.blk,dl:a.dl+x.dl}),{ms:0,pages:0,blk:0,dl:0});
 const T=$('tiles');T.replaceChildren();for(const [l,v] of [['Время работы',fmtMs(tot.ms)],['Страниц открыто',String(tot.pages)],['Заблокировано рекламы и трекеров',String(tot.blk)],['Загрузок',String(tot.dl)]]){const t=el('div',null,'tile');t.append(el('span',l,'m'),el('b',v));T.append(t)}
 const C=$('chart');C.replaceChildren();const mx=Math.max(1,...d.byDay.map(x=>x.ms));for(const x of d.byDay){const b=el('div');b.style.height=Math.max(2,Math.round(x.ms/mx*100))+'%';b.title=x.day+': '+fmtMs(x.ms)+', страниц '+x.pages;C.append(b)}
 $('chartn').textContent=d.byDay.length?d.byDay[0].day+' … '+d.byDay[d.byDay.length-1].day+' (высота столбика = время работы за день)':'';
 $('since').textContent=d.since?'Статистика ведётся с '+d.since:'';
 const tb=$('ptb');tb.replaceChildren();if(!d.profiles.length){const tr=el('tr'),td=el('td','Пока нет данных: поработай в браузере.','m');td.colSpan=6;tr.append(td);tb.append(tr)}
 for(const p of d.profiles){const tr=el('tr'),c1=el('td');const dot=el('span',null,'dot');dot.style.background=p.color;c1.append(dot,p.name);
  tr.append(c1,el('td',fmtMs(p.ms)),el('td',String(p.pages)),el('td',String(p.blk)),el('td',p.dl?p.dl+' ('+fmtB(p.dlb)+')':'0'),el('td',p.top.map(x=>x[0]).join(', '),'m'));tb.append(tr)}}
$('days').onchange=loadStats;
$('reset').onclick=async()=>{if(await api.confirm('Сбросить всю статистику?')){await api.statsReset();loadStats()}};
// ---- ресурсы
async function loadMetrics(){const d=await api.metrics();$('tot').textContent='Всего занято: '+fmtMB(d.total);
 const by={};for(const t of d.tabs){const a=by[t.profile]=by[t.profile]||{mb:0,color:t.color,n:0};a.mb+=t.memMB;a.n++}
 const B=$('byprof');B.replaceChildren();for(const [n,a] of Object.entries(by).sort((x,y)=>y[1].mb-x[1].mb).slice(0,12)){const s=el('span',null,'tile');s.style.padding='4px 10px';const dot=el('span',null,'dot');dot.style.background=a.color;s.append(dot,n+': '+fmtMB(a.mb)+' ('+a.n+')');B.append(s)}
 const mx=Math.max(1,...d.tabs.map(t=>t.memMB)),tb=$('rtb');tb.replaceChildren();
 for(const t of d.tabs.sort((a,b)=>b.memMB-a.memMB)){const tr=el('tr'),c1=el('td',t.title.slice(0,70)||'(без названия)');if(t.deferred){c1.append(el('span',' · не загружена','m'))}
  const c2=el('td'),dot=el('span',null,'dot');dot.style.background=t.color;c2.append(dot,t.profile);
  const c4=el('td');const bar=el('div',null,'bar');bar.style.width=Math.max(2,Math.round(t.memMB/mx*120))+'px';c4.append(el('span',fmtMB(t.memMB)),bar);
  const c6=el('td'),sh=el('button','Показать'),rl=el('button','Обновить'),cl=el('button','Закрыть');sh.onclick=()=>api.metricsAct({tabId:t.tabId,act:'show'});rl.onclick=()=>api.metricsAct({tabId:t.tabId,act:'reload'});cl.onclick=async()=>{await api.metricsAct({tabId:t.tabId,act:'close'});loadMetrics()};c6.style.whiteSpace='nowrap';c6.append(sh,' ',rl,' ',cl);
  tr.append(c1,c2,el('td',String(t.win)),c4,el('td',t.cpu+' %'),c6);tb.append(tr)}
 const ot=$('otb');ot.replaceChildren();for(const o of d.other.sort((a,b)=>b.memMB-a.memMB)){const tr=el('tr');tr.append(el('td',({Browser:'Главный процесс',GPU:'Графика (GPU)',Utility:'Служебный',Tab:'Вкладка (вне списка)'})[o.type]||o.type),el('td',fmtMB(o.memMB)),el('td',o.cpu+' %'));ot.append(tr)}}
// ---- хранилище
let last=[];
async function calc(){$('calc').disabled=true;$('calc').textContent='Считаю…';$('sttot').textContent='';
 try{last=await api.storageInfo();render()}finally{$('calc').disabled=false;$('calc').textContent='Посчитать заново'}}
function render(){const tb=$('stb');tb.replaceChildren();let all=0,cache=0;
 for(const p of last.sort((a,b)=>b.total-a.total)){all+=p.total;cache+=p.cache;const tr=el('tr');
  const big=Object.entries(p.parts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]+' '+fmtB(x[1])).join(', ')+(p.enhanced?(Object.keys(p.parts).length?', ':'')+'усиленный режим '+fmtB(p.enhanced):'');
  const b=el('button','Очистить кэш');b.onclick=async()=>{b.disabled=true;await api.clearCache([p.id]);calc()};
  tr.append(el('td',p.name),el('td',fmtB(p.total)),el('td',fmtB(p.cache)),el('td',big,'m'),(()=>{const c=el('td');c.append(b);return c})());tb.append(tr)}
 $('sttot').textContent='Всего: '+fmtB(all)+', из них кэш: '+fmtB(cache);$('clrall').disabled=!last.length}
$('calc').onclick=calc;
$('clrall').onclick=async()=>{if(await api.confirm('Очистить кэш у всех профилей? Входы в аккаунты сохранятся, сайты в первый раз загрузятся чуть дольше.')){$('clrall').disabled=true;await api.clearCache(last.map(p=>p.id));calc()}};
loadStats();
