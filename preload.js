const {contextBridge,ipcRenderer:r}=require('electron');
contextBridge.exposeInMainWorld('api',{list:()=>r.invoke('list'),pickConf:()=>r.invoke('pickConf'),add:d=>r.invoke('add',d),
 launch:i=>r.invoke('launch',i),stop:i=>r.invoke('stop',i),remove:i=>r.invoke('remove',i),onState:f=>r.on('state',(e,s)=>f(s))});
