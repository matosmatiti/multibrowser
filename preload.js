const {contextBridge,ipcRenderer:r}=require('electron');const c=n=>a=>r.invoke(n,a);
contextBridge.exposeInMainWorld('api',{list:()=>r.invoke('list'),pickConf:()=>r.invoke('pickConf'),add:c('add'),launch:c('launch'),stop:c('stop'),remove:c('remove'),
 onState:f=>r.on('state',(e,s)=>f(s)),openInShell:c('openInShell'),newTab:c('newTab'),newTabMenu:()=>r.invoke('newTabMenu'),activate:c('activate'),
 closeTab:c('closeTab'),navigate:c('navigate'),nav:c('nav'),setMode:c('setMode'),openManager:()=>r.invoke('openManager'),openSettings:()=>r.invoke('openSettings'),getSettings:()=>r.invoke('getSettings'),setSettings:c('setSettings'),checkUpdates:()=>r.invoke('checkUpdates'),showLog:()=>r.invoke('showLog'),onUpdate:f=>r.on('update',(e,u)=>f(u)),onTabs:f=>r.on('tabs',(e,s)=>f(s))});
