const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({show:process.env.DECAL_TEST!=='1',width:1450,height:950,minWidth:1080,minHeight:720,backgroundColor:'#11151c',title:'Decal Forge',autoHideMenuBar:true,webPreferences:{offscreen:process.env.DECAL_TEST==='1',preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
ipcMain.handle('import-png', async () => {
  const {canceled,filePaths} = await dialog.showOpenDialog(win,{filters:[{name:'PNG images',extensions:['png']}],properties:['openFile']});
  if(canceled)return null;
  const bytes=await fs.readFile(filePaths[0]);
  if(bytes.length>100*1024*1024)throw new Error('Размер файла превышает 100 МБ.');
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Это не PNG-файл.');
  return {name:path.basename(filePaths[0],path.extname(filePaths[0])),url:`data:image/png;base64,${bytes.toString('base64')}`};
});
ipcMain.handle('export-files',async (_,files)=>{
  if(!Array.isArray(files)||!files.length||files.length>500)throw new Error('Некорректный список файлов.');
  for(const f of files)if(typeof f.name!=='string'||typeof f.data!=='string'||!['svg','png'].includes(f.type))throw new Error('Некорректный файл.');
  const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'Выберите папку для экспорта',properties:['openDirectory','createDirectory']});
  if(canceled)return null;
  const folder=filePaths[0];let saved=[];
  for(const f of files){
    const base=(f.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'decal').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i,'_$1');
    const data=f.type==='png'?Buffer.from(f.data.replace(/^data:image\/png;base64,/,''),'base64'):f.data;
    for(let n=0;n<10000;n++){
      const name=`${base}${n?`_${n+1}`:''}.${f.type}`;
      try{await fs.writeFile(path.join(folder,name),data,{flag:'wx'});saved.push(name);break;}catch(e){if(e.code!=='EEXIST')throw e;}
    }
  }
  return {folder,saved};
});
ipcMain.handle('show-folder',(_,folder)=>shell.openPath(folder));
