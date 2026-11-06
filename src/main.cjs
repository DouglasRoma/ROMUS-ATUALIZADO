const {app,BrowserWindow,ipcMain,dialog,protocol,net,shell,session,webContents}=require('electron');
const {startPlayerServer}=require('./media-player-server.cjs');
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url'),{Library}=require('./storage.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'atlas-data',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,library,players,config={},closing=false;const boardGuests=new Set();
if(!app.isPackaged&&process.env.IMAGE_ATLAS_TEST_HOME)app.setPath('userData',process.env.IMAGE_ATLAS_TEST_HOME);
// A new product name must keep the existing library, settings and browser storage.
else if(!app.commandLine.getSwitchValue('user-data-dir'))app.setPath('userData',path.join(app.getPath('appData'),'Image Atlas'));
app.setName('ROMUS');
const configPath=()=>path.join(app.getPath('userData'),'application.json');
const saveConfig=()=>fs.writeFile(configPath(),JSON.stringify(config,null,2));
async function launch(){
 players=await startPlayerServer();app.once('will-quit',()=>players.close());
 try{config=JSON.parse(await fs.readFile(configPath(),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 library=new Library(config.library||path.join(app.getPath('userData'),'libraries/default'));await library.list();
 protocol.handle('atlas-data',async request=>{try{const url=new URL(request.url);if(url.hostname!=='library')return new Response('',{status:403});const file=await library.resolve(decodeURIComponent(url.pathname.slice(1)));return net.fetch(pathToFileURL(file).href)}catch{return new Response('',{status:404})}});
 win=new BrowserWindow({width:1450,height:940,minWidth:800,minHeight:600,backgroundColor:'#0d0d0d',title:'ROMUS',titleBarStyle:'hidden',titleBarOverlay:{color:'#0d0d0d',symbolColor:'#a1a9b5',height:47},icon:path.join(__dirname,'../resources/icon.ico'),show:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true}});
 // Keep interface rasterization at native scale; embedded readers own their zoom.
 win.webContents.setZoomMode('isolated');
 win.webContents.on('did-finish-load',()=>win.webContents.setZoomFactor(1));
 win.removeMenu();
 win.webContents.on('console-message',(e,level,msg)=>console.log('[RENDERER]',msg));
 win.webContents.on('did-fail-load',(e,code,desc)=>console.error('[FAIL LOAD]',code,desc));
 if(!process.env.IMAGE_ATLAS_TEST_HOME){win.show();win.focus();}
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return{action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL()){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url)}});
 win.webContents.on('will-attach-webview',(event,prefs,params)=>{if(!/^https?:\/\//.test(params.src)){event.preventDefault();return}delete prefs.preload;prefs.nodeIntegration=false;prefs.contextIsolation=true;prefs.sandbox=true});
 app.on('web-contents-created',(_,contents)=>{if(contents.getType()==='webview'){
  let resend=0;const guestId=contents.id;
  contents.once('destroyed',()=>boardGuests.delete(guestId));
  contents.on('before-input-event',(event,input)=>{
   if(['Control','Meta'].includes(input.key)&&boardGuests.has(contents.id)&&!input.isAutoRepeat){if(!win.isDestroyed())win.webContents.send('atlas:media-preview',contents.id,input.type==='keyDown');return}
   if(input.type!=='keyDown'||input.key!=='Tab'||input.control||input.meta||input.alt||!boardGuests.has(contents.id))return;
   if(resend){resend--;return}event.preventDefault();if(input.isAutoRepeat)return;
   contents.executeJavaScript("!!document.activeElement?.closest('input,textarea,select,[contenteditable=true]')").then(editing=>{if(contents.isDestroyed())return;if(editing){resend++;contents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:input.shift?['shift']:[]})}else if(!win.isDestroyed())win.webContents.send('atlas:media-tab',contents.id,!!input.shift)}).catch(()=>{});
  });
  contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',(event,url)=>{if(!/^https?:\/\//.test(url))event.preventDefault()})}});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win.webContents&&['clipboard-sanitized-write','clipboard-read','fullscreen'].includes(permission)));
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
  if(op==='window:theme'){const light=args[0]==='light';win.setTitleBarOverlay({color:light?'#f5f7fa':'#0d0d0d',symbolColor:light?'#57667a':'#a1a9b5',height:47});return}
  if(op==='attachment:import'){
   const images=args[0]==='cover',picked=await dialog.showOpenDialog(win,{title:images?'Escolher capa da nota':'Adicionar arquivos à nota',properties:images?['openFile']:['openFile','multiSelections'],...(images?{filters:[{name:'Imagens',extensions:['png','jpg','jpeg','webp','gif','avif','svg']}]}:{})});if(picked.canceled)return[];const added=[];
   for(const source of picked.filePaths){const stat=await fs.stat(source);if(!stat.isFile())continue;const name=path.basename(source).replace(/[<>:"|?*\x00-\x1f]/g,'_'),relative='Anexos/'+require('node:crypto').randomUUID()+'/'+name,target=await library.resolve(relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target,1);added.push({path:relative,stat:{ctime:stat.birthtimeMs,mtime:stat.mtimeMs,size:stat.size}})}return added;
  }
  if(op==='attachment:reveal'){const target=await library.resolve(args[0]);if(!(await fs.stat(target)).isFile())throw Error('Arquivo não encontrado.');shell.showItemInFolder(target);return}
  if(op==='list')return library.list();
  if(op==='catalog')return library.catalog();
  if(op==='board-order:read'){try{return JSON.parse(await library.read('.atlas-board-order.json'))}catch(error){if(error.code==='ENOENT')return{};throw error}}
  if(op==='trash')return library.trash(args[0],args[1]);
  if(op==='trash:list')return library.trashList();
  if(op==='trash:restore')return library.restore(args[0]);
  if(op==='trash:purge')return library.purge(args[0]);
  if(op==='read')return library.read(args[0],Boolean(args[1]));
  if(op==='write')return library.write(args[0],args[1],Boolean(args[2]),Boolean(args[3]));
  if(op==='mkdir')return fs.mkdir(await library.resolve(args[0]),{recursive:true});
  if(op==='rename')return library.rename(args[0],args[1]);
  if(op==='settings:read'){try{return JSON.parse(await fs.readFile(path.join(library.root,'.atlas-settings.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return{demoOpened:true};throw e}}
  if(op==='settings:write'){await library.write('.atlas-settings.json',JSON.stringify(args[0],null,2));return}
  if(op==='info')return{version:app.getVersion(),library:library.root,playerOrigin:players.origin};
  if(op==='media:register-guest'){const guest=webContents.fromId(Number(args[0]));if(!guest||guest.hostWebContents!==win.webContents)throw Error('Leitor não autorizado.');boardGuests.add(guest.id);return true;}
  if(op==='media:pdf-data'){
   const source=args[0];if(typeof source!=='string')throw Error('PDF inválido.');let data;
   if(args[1]){if(!/\.pdf$/i.test(source))throw Error('Escolha um arquivo PDF.');const file=await library.resolve(source);if((await fs.stat(file)).size>268435456)throw Error('Este PDF é muito grande para o leitor integrado.');data=await fs.readFile(file)}
   else{const url=new URL(source);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Endereço do PDF inválido.');const response=await net.fetch(url.href,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('O servidor não disponibilizou o PDF.');if(Number(response.headers.get('content-length'))>268435456)throw Error('Este PDF é muito grande para o leitor integrado.');data=new Uint8Array(await response.arrayBuffer());if(data.length>268435456)throw Error('Este PDF é muito grande para o leitor integrado.')}
   return new Uint8Array(data);
  }
  if(op==='media:metadata'){const url=new URL(args[0]);let endpoint;if(['www.youtube.com','youtube.com','youtu.be','m.youtube.com','music.youtube.com'].includes(url.hostname))endpoint='https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url.href);else if(url.hostname==='open.spotify.com')endpoint='https://open.spotify.com/oembed?url='+encodeURIComponent(url.href);else throw Error('Provedor de mídia não suportado.');const response=await net.fetch(endpoint,{signal:AbortSignal.timeout(5000)});if(!response.ok)return null;const text=await response.text();if(text.length>262144)return null;const data=JSON.parse(text);return{title:typeof data.title==='string'?data.title.slice(0,400):'',thumbnail:typeof data.thumbnail_url==='string'&&/^https:\/\//.test(data.thumbnail_url)?data.thumbnail_url.slice(0,2048):''};}
  if(op==='property-types:read'){try{return JSON.parse(await fs.readFile(path.join(library.root,'.atlas-property-types.json'),'utf8'))}catch(error){if(error.code==='ENOENT')return{};throw error}}
  if(op==='property-types:write'){if(!args[0]||typeof args[0]!=='object'||Array.isArray(args[0]))throw Error('Tipos de propriedades inválidos.');return library.write('.atlas-property-types.json',JSON.stringify(args[0],null,2))}
  if(op==='external'){if(!/^https?:\/\//.test(args[0]))throw Error('Endereço inválido.');return shell.openExternal(args[0])}
  if(op==='wikipedia:search'){
   const {query,lang='es'}=args[0]||{};
   if(!query)return[];
   try{
     const u=new URL(query.trim());
     const m=u.hostname.match(/^([a-z-]+)\.wikipedia\.org$/i);
     const pathMatch=u.pathname.match(/^\/wiki\/(.+)$/);
     if(m&&pathMatch){
       return[{title:decodeURIComponent(pathMatch[1].replace(/_/g,' ')),description:'Link direto da Wikipedia',url:u.href,lang:m[1].toLowerCase()}];
     }
   }catch{}
   const target=`https://${encodeURIComponent(lang)}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`;
   const res=await net.fetch(target,{headers:{'User-Agent':'ROMUS/0.3.7 (Atlas Desktop)'},signal:AbortSignal.timeout(10000)});
   if(!res.ok)return[];
   const [,titles,descriptions,urls]=await res.json();
   return(titles||[]).map((title,i)=>({title,description:descriptions?.[i]||'',url:urls?.[i]||'',lang}));
  }
  if(op==='wikipedia:fetch'){
   let {title,lang='es',url}=args[0]||{};
   if(!title)throw Error('Título inválido.');
   let summary={};
   try{
     const sRes=await net.fetch(`https://${encodeURIComponent(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g,'_'))}`,{headers:{'User-Agent':'ROMUS/0.3.7 (Atlas Desktop)'},signal:AbortSignal.timeout(10000)});
     if(sRes.ok)summary=await sRes.json();
   }catch{}
   let fullContent='';
   try{
     const fRes=await net.fetch(`https://${encodeURIComponent(lang)}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json`,{headers:{'User-Agent':'ROMUS/0.3.7 (Atlas Desktop)'},signal:AbortSignal.timeout(12000)});
     if(fRes.ok){
       const data=await fRes.json();
       const page=Object.values(data.query?.pages||{})[0];
       fullContent=page?.extract||'';
     }
   }catch{}
   return{
     title:summary.title||title,
     lang,
     url:url||summary.content_urls?.desktop?.page||`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g,'_'))}`,
     description:summary.description||'',
     thumbnail:summary.thumbnail?.source||'',
     summary:summary.extract||'',
     content:fullContent||summary.extract||'',
     updatedAt:Date.now()
   };
  }
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
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus()}});app.whenReady().then(launch).catch(error=>{dialog.showErrorBox('ROMUS',error.message);app.quit()});app.on('window-all-closed',()=>app.quit())}
