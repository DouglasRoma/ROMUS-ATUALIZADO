import {NoteEditor} from './note-editor.js';
import {PropertiesModal} from './properties.js';
import {NotesLibrary} from './notes-library.js';
import {installBoardAppearance} from './appearance.js';
import {installDOM,Events,Component,TextFileView,Modal,SuggestModal,Menu,Notice,MarkdownRenderer,setIcon,normalizePath,rewriteFrontmatter,modalsOpen} from './compat.js';
import ImageAtlasPlugin from './engine.cjs';
installDOM();document.documentElement.dataset.theme=localStorage.getItem('atlas:theme')||'dark';
const native=window.atlasNative;
const fileObject=({path,stat})=>{const name=path.split('/').pop(),extension=name.includes('.')?name.split('.').pop().toLowerCase():'';return{path,name,extension,basename:extension?name.slice(0,-extension.length-1):name,stat}};
class Vault extends Events{
 constructor(){super();this.files=new Map();this.folders=new Set();this.locks=new Map();this.adapter={exists:async path=>!!this.getAbstractFileByPath(path),read:path=>native.call('read',path),write:(path,text)=>this.write(path,text),list:async path=>{const prefix=normalizePath(path)+'/';return{files:[...this.files.keys()].filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')),folders:[...this.folders].filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/'))}}}}
 async init(){for(const value of await native.call('list'))this.upsert(value);return this}
 upsert(value){const old=this.files.get(value.path),f=old?Object.assign(old,fileObject(value)):fileObject(value);this.files.set(f.path,f);const parts=f.path.split('/');parts.pop();while(parts.length){this.folders.add(parts.join('/'));parts.pop()}return f}
 getFiles(){return[...this.files.values()].filter(f=>!f.name.endsWith('.atlas-backup'))}getMarkdownFiles(){return this.getFiles().filter(f=>f.extension==='md')}getFileByPath(path){return this.files.get(normalizePath(path||''))||null}
 getAbstractFileByPath(path){path=normalizePath(path);return this.getFileByPath(path)||(this.folders.has(path)?{path,children:this.getFiles().filter(f=>f.path.startsWith(path+'/'))}:null)}
 read(file){return native.call('read',file.path)}cachedRead(file){return this.read(file)}
 getResourcePath(file){return'atlas-data://library/'+file.path.split('/').map(encodeURIComponent).join('/')}
 async createFolder(path){await native.call('mkdir',path);this.folders.add(path)}
 async write(path,text,binary=false,create=false){await native.call('write',path,text,binary,create);const file=this.upsert({path,stat:{ctime:this.files.get(path)?.stat.ctime||Date.now(),mtime:Date.now(),size:binary?text.length*.75:new TextEncoder().encode(text).length}});this.trigger(create?'create':'modify',file);return file}
 create(path,text){return this.write(path,text,false,true)}modify(file,text){return this.write(file.path,text)}createBinary(path,buffer){let s='';for(const value of new Uint8Array(buffer))s+=String.fromCharCode(value);return this.write(path,btoa(s),true,true)}
 async process(file,fn){const operation=(this.locks.get(file.path)||Promise.resolve()).catch(()=>{}).then(async()=>{const before=await this.read(file),after=fn(before);if(typeof after!=='string')throw Error('O conteúdo da nota precisa ser texto.');if(after!==before)await this.modify(file,after)});this.locks.set(file.path,operation);try{await operation}finally{if(this.locks.get(file.path)===operation)this.locks.delete(file.path)}}
 async rename(file,path){const old=file.path;await native.call('rename',old,path);this.files.delete(old);Object.assign(file,fileObject({path,stat:{...file.stat,mtime:Date.now()}}));this.files.set(path,file);this.trigger('rename',file,old)}
}
const app={vault:await new Vault().init(),factories:new Map(),extensions:new Map(),commands:[]};
window.atlasApp=app;
app.propertyTypes=await native.call('property-types:read');app.info=await native.call('info');
app.uiButton=button;app.renameNote=renameNote;app.createNote=newNote;app.editNoteFlashcards=()=>runCommand('edit-note-flashcards');
app.metadataCache={getFirstLinkpathDest(link,source=''){
 const clean=decodeURIComponent(String(link)).replace(/^!?(?:\[\[)?/,'').replace(/\]\]$/,'').split('|')[0].split('#')[0];
 const dir=source.split('/').slice(0,-1).join('/');
 for(const path of [clean,clean+'.md',normalizePath(dir+'/'+clean),normalizePath(dir+'/'+clean+'.md')]){const file=app.vault.getFileByPath(path);if(file)return file}
 return app.vault.getFiles().find(f=>f.path.toLowerCase()===clean.toLowerCase()||f.basename.toLowerCase()===clean.toLowerCase()||f.name.toLowerCase()===clean.toLowerCase())||null;
},fileToLinktext:(file)=>file.path.replace(/\.md$/i,'')};
app.fileManager={generateMarkdownLink:(file,source,subpath='',alias='')=>`[[${file.path.replace(/\.md$/i,'')}${subpath}${alias?'|'+alias:''}]]`,renameFile:(file,path)=>app.vault.rename(file,path),processFrontMatter:(file,fn)=>app.vault.process(file,text=>rewriteFrontmatter(text,fn))};
class Leaf{
 constructor(split=false){document.querySelector('.welcome')?.remove();this.app=app;this.containerEl=document.getElementById('workspaces').createDiv({cls:'workspace-leaf'});this.split=split;this.tab=document.getElementById('tabs').createDiv({cls:'tab'});this.label=this.tab.createEl('button',{text:'Nova aba'});this.label.onclick=()=>app.workspace.revealLeaf(this);const close=this.tab.createEl('button',{text:'×',attr:{'aria-label':'Fechar aba'}});close.onclick=()=>this.close().catch(e=>new Notice(e.message));app.workspace.leaves.push(this)}
 async setViewState(spec){await this.disposeView();const factory=app.factories.get(spec.type);if(!factory)throw Error('Tela não disponível: '+spec.type);this.view=factory(this);Component.prototype.load.call(this.view);await this.view.onOpen?.();await this.view.setState?.(spec.state||{},{});this.label.textContent=this.view.getDisplayText();await app.workspace.revealLeaf(this)}
 async openFile(file){const existing=app.workspace.leaves.find(leaf=>leaf!==this&&leaf.view?.file?.path===file.path&&(file.extension==='imageboard'||!this.split));if(existing){if(!this.view)await this.close();await app.workspace.revealLeaf(existing);return}await this.disposeView();this.file=file;const factory=app.factories.get(app.extensions.get(file.extension));this.view=factory?factory(this):new NoteEditor(this);this.view.file=file;Component.prototype.load.call(this.view);await this.view.onOpen?.();if(factory)this.view.setViewData(await app.vault.read(file),true);else if(file.extension==='md')await this.view.readFile(file);else{this.view.contentEl.empty();const img=this.view.contentEl.createEl('img',{cls:'resource-preview'});img.src=app.vault.getResourcePath(file)}this.label.textContent=file.basename;await app.workspace.revealLeaf(this);renderFiles()}
 async disposeView(){if(this.view){await this.view.onClose?.();this.view.unload();this.view=null}this.containerEl.empty()}
 async close(){await this.disposeView();this.containerEl.remove();this.tab.remove();app.workspace.leaves.splice(app.workspace.leaves.indexOf(this),1);if(app.workspace.activeLeaf===this){app.workspace.activeLeaf=null;const last=app.workspace.leaves.at(-1);if(last)await app.workspace.revealLeaf(last);else showWelcome()}}
}
app.workspace=Object.assign(new Events(),{leaves:[],activeLeaf:null,getActiveFile(){return this.activeLeaf?.view?.file||null},getLeavesOfType(type){return this.leaves.filter(leaf=>leaf.view?.getViewType()===type).sort((a,b)=>Number(b===this.activeLeaf)-Number(a===this.activeLeaf))},getLeaf(mode){return mode==='tab'||mode==='split'||mode===true||!this.activeLeaf?new Leaf(mode==='split'):this.activeLeaf},async revealLeaf(leaf){for(const other of this.leaves){const visible=other===leaf||leaf.split&&other===this.activeLeaf;other.containerEl.hidden=!visible;other.tab.classList.toggle('active',other===leaf)}this.activeLeaf=leaf;renderFiles();document.getElementById('workspaces').classList.toggle('is-split',leaf.split);this.trigger('active-leaf-change',leaf)},async openLinkText(text,source,newLeaf){const file=app.metadataCache.getFirstLinkpathDest(text,source);if(!file){new Notice('Nota não encontrada: '+text);return}await this.getLeaf(newLeaf?'tab':false).openFile(file)},onLayoutReady(fn){queueMicrotask(fn)}});
let hoverPreview,hoverComponent,hoverToken=0;
function closeHover(){hoverToken++;hoverPreview?.remove();hoverPreview=null;hoverComponent?.unload();hoverComponent=null}
app.workspace.on('hover-link',async({event,targetEl,linktext,sourcePath})=>{
 if(!event.ctrlKey&&!event.metaKey)return;const file=app.metadataCache.getFirstLinkpathDest(linktext,sourcePath);if(file?.extension!=='md')return;
 closeHover();const token=hoverToken;hoverPreview=document.body.createDiv({cls:'ia-review-note-preview'});const width=Math.min(440,innerWidth-24);Object.assign(hoverPreview.style,{left:Math.max(12,Math.min(event.clientX+14,innerWidth-width-12))+'px',top:Math.max(12,Math.min(event.clientY+14,innerHeight-360))+'px',width:width+'px',maxHeight:'340px'});hoverPreview.createDiv({cls:'ia-review-note-preview-title',text:file.basename});const body=hoverPreview.createDiv({cls:'ia-review-note-preview-body',text:'Carregando…'});hoverComponent=new Component();
 try{const raw=await app.vault.read(file);if(token!==hoverToken)return;const text=raw.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/<!-- image-atlas-visual:start -->[\s\S]*?<!-- image-atlas-visual:end -->/g,'');await MarkdownRenderer.render(app,text.slice(0,24000),body,file.path,hoverComponent)}catch(error){if(token===hoverToken)body.textContent=error.message}
});
document.addEventListener('pointerover',event=>{const link=event.target.closest('a.internal-link');if(link&&!link.closest('.ia-fsrs-view'))app.workspace.trigger('hover-link',{event,targetEl:link,linktext:link.dataset.href,sourcePath:app.workspace.getActiveFile()?.path||''})});
window.addEventListener('keyup',event=>{if(['Control','Meta'].includes(event.key))closeHover()});window.addEventListener('blur',closeHover);
function button(host,label,icon,action){const el=host.createEl('button',{attr:{type:'button',title:label}});const glyph=el.createSpan();setIcon(glyph,icon);el.createSpan({text:label});el.onclick=()=>Promise.resolve().then(action).catch(e=>{console.error(e);new Notice(e.message)});return el}
function runCommand(id){const command=app.commands.find(c=>c.id===id);if(!command)return;if(command.checkCallback){if(command.checkCallback(true))command.checkCallback(false);else new Notice('Abra uma nota para usar esta ação.')}else return command.callback()}
class Picker extends SuggestModal{constructor(title,items,choose){super(app);this.items=items;this.choose=choose;this.setPlaceholder(title)}getSuggestions(query){const q=query.toLocaleLowerCase();return this.items.filter(item=>item.title.toLocaleLowerCase().includes(q)).slice(0,100)}renderSuggestion(item,el){el.textContent=item.title}onChooseSuggestion(item){this.choose(item)}}
function commandPalette(){new Picker('O que deseja fazer?',app.commands.filter(c=>!c.checkCallback||c.checkCallback(true)).map(c=>({title:c.name,id:c.id})),c=>runCommand(c.id)).open()}
function filePalette(){new Picker('Buscar nota ou whiteboard…',app.vault.getFiles().filter(f=>['md','imageboard'].includes(f.extension)).map(f=>({title:f.path,file:f})),item=>app.workspace.getLeaf('tab').openFile(item.file)).open()}
function promptText(title,initial,save){const modal=new Modal(app);modal.setTitle(title);const input=modal.contentEl.createEl('input',{attr:{'aria-label':title},value:initial});button(modal.contentEl,'Salvar','check',async()=>{if(!input.value.trim())return;await save(input.value.trim());modal.close()});input.onkeydown=event=>{if(event.key==='Enter')modal.contentEl.querySelector('button').click()};modal.open();input.focus();input.select()}
function renameNote(file){if(!file)return;promptText('Renomear nota',file.basename,async name=>{const folder=file.path.split('/').slice(0,-1).join('/');await app.fileManager.renameFile(file,normalizePath(folder+'/'+name.replace(/[\\/:*?"<>|]/g,' ')+'.md'));renderFiles()})}
function newNote(){promptText('Criar nota','Nova nota',async name=>{const file=await app.vault.create('Notas/'+name.replace(/[\\/:*?"<>|]/g,' ')+'.md','# '+name+'\n\n');await app.workspace.getLeaf('tab').openFile(file)})}
function renderFiles(){
 const host=document.getElementById('files'),scroll=host.scrollTop,query=document.getElementById('file-search').value.toLocaleLowerCase();
 const open=new Map([...host.querySelectorAll('details')].map(el=>[el.dataset.kind,el.open]));host.empty();
 const active=app.workspace.getActiveFile()?.path,all=app.vault.getFiles().filter(f=>['imageboard','md'].includes(f.extension)&&!f.path.includes('/Notas visuais/Dados/'));
 for(const [kind,label,limit]of [['imageboard','Quadros',60],['md','Notas',140]]){
  const files=all.filter(file=>file.extension===kind&&file.path.toLocaleLowerCase().includes(query)).sort((a,b)=>a.path.localeCompare(b.path));if(!files.length)continue;
  const section=host.createEl('details',{cls:'atlas-file-section'});section.dataset.kind=kind;section.open=!!query||(open.get(kind)??true);const summary=section.createEl('summary');summary.createSpan({text:label});summary.createSpan({text:String(files.length)});const group=section.createDiv({cls:'atlas-file-group'});
  for(const file of files.slice(0,limit)){
   const el=group.createEl('button',{cls:'library-file',attr:{title:file.path,'aria-current':String(file.path===active?'page':'false')}});el.dataset.path=file.path;const icon=el.createSpan();setIcon(icon,file.extension==='imageboard'?'panels-top-left':'file-text');el.createSpan({text:file.basename});el.onclick=()=>app.workspace.getLeaf('tab').openFile(file).catch(e=>new Notice(e.message));
   el.oncontextmenu=event=>{event.preventDefault();const menu=new Menu();if(file.extension==='md'){menu.addItem(i=>i.setTitle('Renomear nota').onClick(()=>renameNote(file)));menu.addItem(i=>i.setTitle('Propriedades').onClick(()=>new PropertiesModal(app,file).open()));app.workspace.trigger('file-menu',menu,file)}else menu.addItem(i=>i.setTitle('Abrir whiteboard').onClick(()=>app.workspace.getLeaf('tab').openFile(file)));menu.showAtMouseEvent(event)};
  }
  if(files.length>limit){const more=group.createEl('button',{cls:'library-file',text:kind==='md'?'Ver todas as notas…':'Buscar mais quadros…'});more.onclick=kind==='md'?openNotesLibrary:filePalette}
 }
 host.scrollTop=scroll;const overview=document.querySelector('.atlas-library-overview');if(overview)overview.textContent=`${all.filter(f=>f.extension==='md').length} notas · ${all.filter(f=>f.extension==='imageboard').length} quadros`;
 for(const el of document.querySelectorAll('#primary-actions button'))if(el.textContent==='Biblioteca de notas')el.setAttribute('aria-current',app.workspace.activeLeaf?.view?.getViewType()==='atlas-notes-library'?'page':'false');
}
function showWelcome(){const host=document.getElementById('workspaces');if(app.workspace.leaves.length)return;host.querySelector('.welcome')?.remove();const welcome=host.createDiv({cls:'welcome'});welcome.createDiv({cls:'welcome-symbol',text:'◈'});welcome.createEl('h1',{text:'Conhecimento que ganha conexões.'});welcome.createEl('p',{text:'Organize ideias em mapas visuais, conecte suas notas e transforme o que aprendeu em memória.'});const actions=welcome.createDiv({cls:'welcome-actions'});button(actions,'Criar meu primeiro whiteboard','plus',()=>plugin.newBoard());button(actions,'Importar biblioteca do Obsidian','folder-open',importLibrary);button(actions,'Explorar exemplo','sparkles',()=>createDemo());welcome.createEl('small',{text:'Seus arquivos ficam neste computador. Sem conta, sem envio automático para a nuvem.'})}
async function flush(){for(const leaf of app.workspace.leaves){leaf.view?.flushCameraFrame?.();await leaf.view?.save?.()}await Promise.all([...(plugin.visualWrites?.values()||[]),...(plugin.indexWrites?.values()||[])]);await plugin.noteRenameWrite;await plugin.reviewStore?.flush();await Promise.all([...app.vault.locks.values()])}
async function importLibrary(){await flush();if(await native.call('import'))location.reload()}
const actions=document.getElementById('primary-actions');button(actions,'Novo whiteboard','plus',()=>plugin.newBoard());button(actions,'Nova nota','file-plus',newNote);button(actions,'Biblioteca de notas','library',openNotesLibrary);button(actions,'Revisões de hoje','layers',()=>runCommand('review-today-fsrs'));button(actions,'Buscar nos mapas','search',()=>runCommand('search-whiteboards'));
const footer=document.getElementById('library-footer');button(footer,'Importar biblioteca','folder-open',importLibrary);button(footer,'Exportar cópia','download',async()=>{await flush();const target=await native.call('export');if(target)new Notice('Cópia exportada para '+target)});button(footer,'Comandos · Ctrl+P','command',commandPalette);footer.createEl('small',{cls:'atlas-library-overview'});button(footer,'Alternar tema','sun-moon',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';localStorage.setItem('atlas:theme',document.documentElement.dataset.theme)});
const plugin=new ImageAtlasPlugin(app);window.atlasPlugin=plugin;app.plugin=plugin;await plugin.load();installBoardAppearance(app);app.factories.set('atlas-notes-library',leaf=>new NotesLibrary(leaf));
app.vault.on('create',renderFiles);app.vault.on('rename',renderFiles);document.getElementById('file-search').oninput=renderFiles;
document.addEventListener('keydown',event=>{if(modalsOpen()||event.defaultPrevented||!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase();if(key==='p'){event.preventDefault();commandPalette()}else if(key==='o'){event.preventDefault();if(event.shiftKey)runCommand('search-whiteboards');else filePalette()}else if(key==='s'){event.preventDefault();flush().then(()=>new Notice('Alterações salvas.')).catch(e=>new Notice(e.message))}});
window.addEventListener('unhandledrejection',event=>{console.error(event.reason);new Notice(event.reason?.message||String(event.reason))});
native.onClosing(async()=>{try{await flush();rememberWorkspace();plugin.unload();native.readyToClose()}catch(error){new Notice('O aplicativo permaneceu aberto para proteger alterações pendentes: '+error.message)}});
renderFiles();await restoreWorkspace();showWelcome();

async function createDemo(){
 const path='Image Atlas/Boas-vindas.imageboard';let file=app.vault.getFileByPath(path);
 if(!file){
  const notePath='Image Atlas/Exemplo/Estudo conectado.md';if(!app.vault.getFileByPath(notePath))await app.vault.create(notePath,'# Estudo conectado\n\nUma nota reúne seu resumo e seus flashcards. Ela pode aparecer em vários quadros com o mesmo histórico.\n\nComo estudar apenas as notas de um quadro? == Use **Estudar todos os flashcards** e escolha um tema.\nComo preservar uma cópia da biblioteca? == Use **Exportar cópia** na barra lateral.\n');
  const node=(id,title,x,y,parentId='',body='')=>({id,type:'mind',title,body,x,y,w:260,h:150,mapId:'atlas-intro',parentId,color:'#a78bfa',flashcards:[]});
  const board={version:1,title:'Boas-vindas ao Image Atlas',indexPath:'',camera:{x:55,y:80,z:.8},edges:[],nodes:[node('atlas-intro','Conhecimento conectado',20,160,'','Seu espaço de estudo visual.'),node('ideas','Mapeie suas ideias',410,35,'atlas-intro','Tab cria um filho. Renomeie, mova e recolha os ramos.'),node('review','Estude com o FSRS',410,300,'atlas-intro','Cada nota tem seu próprio histórico. O quadro reúne os temas para revisar.'),{id:'summary',type:'note',title:'Estudo conectado',path:notePath,x:810,y:100,w:360,h:280}]};
  file=await app.vault.create(path,JSON.stringify(board,null,2));
 }
 await app.workspace.getLeaf('tab').openFile(file);
}

async function openNotesLibrary(){
 const current=app.workspace.getLeavesOfType('atlas-notes-library')[0];if(current)return app.workspace.revealLeaf(current);
 await app.workspace.getLeaf('tab').setViewState({type:'atlas-notes-library',state:{},active:true});
}

function rememberWorkspace(){
 const tabs=app.workspace.leaves.map(leaf=>({path:leaf.view?.file?.path,type:leaf.view?.getViewType(),state:leaf.view?.getState?.(),review:leaf.view?.sessionSnapshot?.(),cursor:leaf.view?.input?.selectionStart,end:leaf.view?.input?.selectionEnd,scroll:leaf.view?.input?.scrollTop,focused:leaf.view?.input===document.activeElement}));
 localStorage.setItem('atlas:workspace:'+app.info.library,JSON.stringify({tabs,active:app.workspace.leaves.indexOf(app.workspace.activeLeaf)}));
}
async function restoreWorkspace(){
 let saved;try{saved=JSON.parse(localStorage.getItem('atlas:workspace:'+app.info.library)||'null')}catch{return}
 if(!saved?.tabs?.length)return;const restored=[];
 for(const entry of saved.tabs){
  try{
   let leaf;
   if(entry.path){const file=app.vault.getFileByPath(entry.path);if(!file)continue;leaf=app.workspace.getLeaf('tab');await leaf.openFile(file)}
   else if(entry.type==='atlas-notes-library'){leaf=app.workspace.getLeaf('tab');await leaf.setViewState({type:entry.type,state:entry.state||{}})}
   else if(entry.type==='image-atlas-flashcards'){leaf=await plugin.openReviewTab(entry.state,entry.review)}
   if(!leaf)continue;
   if(leaf.view.input&&typeof entry.cursor==='number'){leaf.view.input.setSelectionRange(entry.cursor,entry.end??entry.cursor);leaf.view.input.scrollTop=entry.scroll||0}
   restored.push({leaf,entry});
  }catch(error){new Notice('Não foi possível reabrir uma aba: '+error.message)}
 }
 const current=restored[Math.min(saved.active,restored.length-1)];if(current){await app.workspace.revealLeaf(current.leaf);if(current.entry.focused&&current.leaf.view.input){current.leaf.view.input.focus({preventScroll:true});current.leaf.view.input.dispatchEvent(new Event('click'))}}
}
let updatePending,updateTimer,lastTyping=0;
window.addEventListener('input',()=>{lastTyping=Date.now()},true);
async function applyDevelopmentUpdate(){
 clearTimeout(updateTimer);if(!updatePending)return;
 if(modalsOpen())return;
 if(Date.now()-lastTyping<1000){updateTimer=setTimeout(applyDevelopmentUpdate,1000);return}
 try{await flush();rememberWorkspace();const kind=updatePending;updatePending=null;if(kind==='backend')native.restartDevelopment();else location.reload()}
 catch(error){new Notice('Atualização aguardando salvar: '+error.message)}
}
native.onUpdate?.((_,kind)=>{if(kind==='styles'){for(const link of document.querySelectorAll('link[rel=stylesheet]')){const url=new URL(link.href);url.searchParams.set('v',Date.now());link.href=url.href}return}updatePending=kind==='backend'?'backend':updatePending||'renderer';if(modalsOpen())new Notice('Atualização pronta. Será aplicada quando você fechar esta janela de edição.');else updateTimer=setTimeout(applyDevelopmentUpdate,350)});
window.addEventListener('atlas:modal-closed',()=>{if(updatePending)updateTimer=setTimeout(applyDevelopmentUpdate,350)});
