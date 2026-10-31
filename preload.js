const {contextBridge,ipcRenderer:r}=require('electron');const c=n=>a=>r.invoke(n,a);
contextBridge.exposeInMainWorld('api',{list:()=>r.invoke('list'),pickConf:()=>r.invoke('pickConf'),add:c('add'),launch:c('launch'),stop:c('stop'),remove:c('remove'),
 onState:f=>r.on('state',(e,s)=>f(s)),openInShell:c('openInShell'),newTab:c('newTab'),newTabMenu:()=>r.invoke('newTabMenu'),activate:c('activate'),
 closeTab:c('closeTab'),navigate:c('navigate'),nav:c('nav'),setMode:c('setMode'),openManager:()=>r.invoke('openManager'),onTabs:f=>r.on('tabs',(e,s)=>f(s))});
