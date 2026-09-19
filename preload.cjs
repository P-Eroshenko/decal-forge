const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  importPNG:()=>ipcRenderer.invoke('import-png'),
  exportFiles:files=>ipcRenderer.invoke('export-files',files),
  showFolder:folder=>ipcRenderer.invoke('show-folder',folder)
});
