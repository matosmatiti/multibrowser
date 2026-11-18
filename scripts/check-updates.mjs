// Проверяет новые версии компонентов и, с флагом --apply, правит versions.json и package.json.
// Правила безопасности: берём только стабильные выпуски старше MIN_AGE_DAYS (по умолчанию 3 дня);
// Electron обновляется автоматически только внутри текущей мажорной версии, новая мажорная лишь упоминается;
// sing-box и sing-box-lx остаются в своей минорной ветке (например 1.13.x), потому что настройки между ветками меняются.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const MIN_AGE_DAYS=+(process.env.MIN_AGE_DAYS||3);
const nums=v=>String(v).replace(/^v/,'').split(/[.\-]|lx/).filter(x=>x!=='').map(x=>/^\d+$/.test(x)?+x:0);
export const cmp=(a,b)=>{const x=nums(a),y=nums(b);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d}return 0};
const oldEnough=r=>(Date.now()-new Date(r.published_at||0).getTime())>=MIN_AGE_DAYS*864e5;
const stable=r=>!r.prerelease&&!r.draft;
const best=(list,key)=>list.reduce((a,b)=>(!a||cmp(key(b),key(a))>0)?b:a,null);

export async function check(fj,files){
 const ver=JSON.parse(files.versions),pkg=JSON.parse(files.pkg),changes=[],majors=[];
 const gh=(repo,n=60)=>fj(`https://api.github.com/repos/${repo}/releases?per_page=${n}`);

 // Electron (двигатель программы: Chromium и безопасность страниц)
 {const cur=pkg.devDependencies.electron,cm=nums(cur)[0],rels=(await gh('electron/electron')).filter(r=>stable(r)&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&oldEnough(r));
  const same=best(rels.filter(r=>nums(r.tag_name)[0]===cm),r=>r.tag_name);
  if(same&&cmp(same.tag_name,cur)>0)changes.push({name:'Electron',key:'electron',from:cur,to:same.tag_name.slice(1),url:same.html_url});
  const any=best(rels,r=>r.tag_name);if(any&&nums(any.tag_name)[0]>cm)majors.push({name:'Electron',from:cur,to:any.tag_name.slice(1),url:any.html_url,note:'новая мажорная версия: между мажорными версиями меняется API, обновляй вручную после проверки'})}
 // sing-box
 {const cur=ver.singbox,[ma,mi]=nums(cur),rels=(await gh('SagerNet/sing-box')).filter(r=>stable(r)&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&oldEnough(r)&&nums(r.tag_name)[0]===ma&&nums(r.tag_name)[1]===mi);
  const b=best(rels,r=>r.tag_name);if(b&&cmp(b.tag_name,cur)>0)changes.push({name:'sing-box',key:'singbox',from:cur,to:b.tag_name.slice(1),url:b.html_url})}
 // sing-box-lx (AmneziaWG)
 {const cur=ver.lx,[ma,mi]=nums(cur),re=/^v(\d+)\.(\d+)\.(\d+)-lx\.(\d+)$/,rels=(await gh('Leadaxe/sing-box-lx')).filter(r=>stable(r)&&re.test(r.tag_name)&&oldEnough(r)&&nums(r.tag_name)[0]===ma&&nums(r.tag_name)[1]===mi);
  const key=r=>{const m=re.exec(r.tag_name);return m[3].padStart(4,'0')+'.'+m[4].padStart(4,'0')};
  const b=best(rels,key);if(b&&cmp(key(b),(()=>{const m=re.exec(cur);return m?m[3].padStart(4,'0')+'.'+m[4].padStart(4,'0'):'0'})())>0)changes.push({name:'sing-box-lx',key:'lx',from:cur,to:b.tag_name,url:b.html_url})}
 // движок усиленного режима (fingerprint-chromium)
 {const cur=ver.engine,rels=(await gh('adryfish/fingerprint-chromium',30)).filter(r=>stable(r)&&/^\d+\.\d+\.\d+\.\d+$/.test(r.tag_name)&&oldEnough(r)&&(r.assets||[]).some(a=>/win/i.test(a.name)&&/\.(zip|7z)$/i.test(a.name)));
  const b=best(rels,r=>r.tag_name);if(b&&cmp(b.tag_name,cur)>0)changes.push({name:'Движок усиленного режима (fingerprint-chromium)',key:'engine',from:cur,to:b.tag_name,url:b.html_url})}

 const out={versions:{...ver},pkg:JSON.parse(files.pkg)};
 for(const c of changes){if(c.key==='electron')out.pkg.devDependencies.electron=c.to;else out.versions[c.key]=c.to}
 const body=changes.length||majors.length?[
  '## Обновление компонентов','',
  ...(changes.length?['Автоматически найдены новые стабильные версии (старше '+MIN_AGE_DAYS+' дней):','',...changes.map(c=>`- **${c.name}**: ${c.from} → ${c.to} ([что нового](${c.url}))`),'','После слияния запустится сборка, и программа у всех обновится сама.']:[]),
  ...(majors.length?['','### Требует ручной проверки (не применено)','',...majors.map(c=>`- **${c.name}**: ${c.from} → ${c.to} ([что нового](${c.url})): ${c.note}`)]:[]),
 ].join('\n')+'\n':'';
 return{changes,majors,versions:JSON.stringify(out.versions,null,2)+'\n',pkg:JSON.stringify(out.pkg,null,1)+'\n',body};
}

async function main(){
 const headers={'User-Agent':'multibrowser-updater',Accept:'application/vnd.github+json',...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})};
 const fj=async u=>{const r=await fetch(u,{headers});if(!r.ok)throw new Error(u+' → '+r.status);return r.json()};
 const files={versions:fs.readFileSync('versions.json','utf8'),pkg:fs.readFileSync('package.json','utf8')};
 const res=await check(fj,files);
 for(const c of res.changes)console.log(`${c.name}: ${c.from} -> ${c.to}`);
 for(const c of res.majors)console.log(`(вручную) ${c.name}: ${c.from} -> ${c.to}`);
 if(!res.changes.length&&!res.majors.length)console.log('Всё актуально.');
 if(process.argv.includes('--apply')){
  if(res.changes.length){fs.writeFileSync('versions.json',res.versions);fs.writeFileSync('package.json',res.pkg)}
  if(res.body)fs.writeFileSync('update-body.md',res.body);
  if(res.changes.length)fs.writeFileSync('update-has-changes','1');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exit(1)});
