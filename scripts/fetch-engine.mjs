// Скачивает движок fingerprint-chromium (Windows) в resources/engine. Версия закреплена, чтобы сборка не менялась сама.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const TAG=process.env.ENGINE_TAG||'148.0.7778.215';
const rel=await (await fetch(`https://api.github.com/repos/adryfish/fingerprint-chromium/releases/tags/${TAG}`,{headers:{'User-Agent':'multibrowser'}})).json();
const names=(rel.assets||[]).map(a=>a.name);
const a=(rel.assets||[]).find(x=>/win/i.test(x.name)&&/\.(zip|7z)$/i.test(x.name));
if(!a){console.log('Не нашёл файл движка для Windows. Доступные файлы:',names);process.exit(1)}
console.log('Движок',TAG,a.name);
const buf=Buffer.from(await (await fetch(a.browser_download_url)).arrayBuffer());
console.log('SHA256',createHash('sha256').update(buf).digest('hex'));
fs.mkdirSync('resources/engine',{recursive:true});fs.writeFileSync('engine-'+a.name,buf);
execFileSync('7z',['x','engine-'+a.name,'-oresources/engine','-y'],{stdio:'inherit'});
