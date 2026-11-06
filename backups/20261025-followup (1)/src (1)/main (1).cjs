const {app,BrowserWindow,ipcMain,dialog,protocol,net,shell,session}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url'),{Library}=require('./storage.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'atlas-data',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,library,config={},closing=false;
if(!app.isPackaged&&process.env.IMAGE_ATLAS_TEST_HOME)app.setPath('userData',process.env.IMAGE_ATLAS_TEST_HOME);
const configPath=()=>path.join(app.getPath('userData'),'application.json');
const saveConfig=()=>fs.writeFile(configPath(),JSON.stringify(config,null,2));
async function launch(){
 try{config=JSON.parse(await fs.readFile(configPath(),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 library=new Library(config.library||path.join(app.getPath('userData'),'libraries/default'));await library.list();
 protocol.handle('atlas-data',async request=>{try{const url=new URL(request.url);if(url.hostname!=='library')return new Response('',{status:403});const file=await library.resolve(decodeURIComponent(url.pathname.slice(1)));return net.fetch(pathToFileURL(file).href)}catch{return new Response('',{status:404})}});
 win=new BrowserWindow({width:1450,height:940,minWidth:800,minHeight:600,backgroundColor:'#17191f',title:'Image Atlas',icon:path.join(__dirname,'../resources/icon.ico'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true}});
 win.removeMenu();win.once('ready-to-show',()=>{if(!process.env.IMAGE_ATLAS_TEST_HOME)win.show()});
 if(process.env.IMAGE_ATLAS_DEV==='1')win.show();
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return{action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url)}});
 win.webContents.on('will-attach-webview',(event,prefs,params)=>{if(!/^https?:\/\//.test(params.src)){event.preventDefault();return}delete prefs.preload;prefs.nodeIntegration=false;prefs.contextIsolation=true;prefs.sandbox=true});
 app.on('web-contents-created',(_,contents)=>{if(contents.getType()==='webview'){contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',(event,url)=>{if(!/^https?:\/\//.test(url))event.preventDefault()})}});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win.webContents&&['clipboard-sanitized-write','clipboard-read'].includes(permission)));
 win.on('close',event=>{if(!closing){event.preventDefault();win.webContents.send('atlas:closing')}});
 ipcMain.on('atlas:ready-close',event=>{if(event.sender===win.webContents){closing=true;win.close()}});
 if(!app.isPackaged&&process.env.IMAGE_ATLAS_DEV==='1'){
  process.on('message',message=>{
   if(message==='atlas:renderer-update')win.webContents.send('atlas:development-update','renderer');
   if(message==='atlas:styles-update')win.webContents.send('atlas:development-update','styles');
   if(message==='atlas:backend-update')win.webContents.send('atlas:development-update','backend');
  });
  ipcMain.on('atlas:restart-ready',event=>{if(event.sender===win.webContents){process.send?.({restart:true});win.webContents.send('atlas:closing')}});
 }
 ipcMain.handle('atlas:call',async(event,op,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Origem não autorizada.');
  if(op==='list')return library.list();
  if(op==='read')return library.read(args[0],Boolean(args[1]));
  if(op==='write')return library.write(args[0],args[1],Boolean(args[2]),Boolean(args[3]));
  if(op==='mkdir')return fs.mkdir(await library.resolve(args[0]),{recursive:true});
  if(op==='rename')return library.rename(args[0],args[1]);
  if(op==='settings:read'){try{return JSON.parse(await fs.readFile(path.join(library.root,'.atlas-settings.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return{demoOpened:true};throw e}}
  if(op==='settings:write'){await library.write('.atlas-settings.json',JSON.stringify(args[0],null,2));return}
  if(op==='info')return{version:app.getVersion(),library:library.root};
  if(op==='property-types:read'){try{return JSON.parse(await fs.readFile(path.join(library.root,'.atlas-property-types.json'),'utf8'))}catch(error){if(error.code==='ENOENT')return{};throw error}}
  if(op==='property-types:write'){if(!args[0]||typeof args[0]!=='object'||Array.isArray(args[0]))throw Error('Tipos de propriedades inválidos.');return library.write('.atlas-property-types.json',JSON.stringify(args[0],null,2))}
  if(op==='external'){if(!/^https?:\/\//.test(args[0]))throw Error('Endereço inválido.');return shell.openExternal(args[0])}
  if(op==='import'){
   const picked=await dialog.showOpenDialog(win,{title:'Importar uma cópia da biblioteca ou cofre Obsidian',properties:['openDirectory']});if(picked.canceled)return false;
   const target=path.join(app.getPath('userData'),'libraries','import-'+Date.now()),next=new Library(target);
   await next.importFrom(picked.filePaths[0]);config.library=target;await saveConfig();library=next;return true;
  }
  if(op==='export'){
   const picked=await dialog.showOpenDialog(win,{title:'Escolher pasta para exportar uma cópia',properties:['openDirectory','createDirectory']});if(picked.canceled)return false;
   const target=path.join(picked.filePaths[0],'Image-Atlas-export-'+Date.now());if(target.startsWith(library.root+path.sep))throw Error('Escolha uma pasta fora da biblioteca.');await fs.cp(library.root,target,{recursive:true,errorOnExist:true,force:false});return target;
  }
  throw Error('Operação não suportada.');
 });
 await win.loadFile(path.join(__dirname,'../dist/index.html'));
}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{if(win){win.show();win.focus()}});app.whenReady().then(launch).catch(error=>{dialog.showErrorBox('Image Atlas',error.message);app.quit()});app.on('window-all-closed',()=>app.quit())}
