

import {Modal,Notice} from './compat.js';

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function renameImage(app, item, rawName) {
  if (!rawName) return null;
  let cleanName = rawName.trim().replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanName) return null;
  const currentExt = (item.source?.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.png').toLowerCase();
  if (!/\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(cleanName)) {
    cleanName += currentExt;
  }
  await app.flushAll();

  if (item.local) {
    const oldFile = app.vault.getFileByPath(item.source);
    if (oldFile) {
      const folder = oldFile.path.split('/').slice(0, -1).join('/');
      let targetPath = (folder ? folder + '/' : '') + cleanName;
      const existing = app.vault.getFileByPath(targetPath);
      if (existing && existing.path !== oldFile.path) {
        targetPath = app.plugin.unique(targetPath);
      }
      const finalName = targetPath.split('/').pop();
      const oldName = oldFile.name;
      const oldBase = oldFile.basename;

      if (targetPath !== oldFile.path) {
        await app.vault.rename(oldFile, targetPath);
      }

      app.media.byKey?.delete(item.key);
      item.source = targetPath;
      item.key = 'image:' + targetPath;
      item.title = finalName;
      item.customTitle = true;
      app.media.byKey?.set(item.key, item);
      if (item.thumbnail) item.thumbnail = app.vault.getResourcePath(oldFile);

      if (item.notePath) {
        const note = app.vault.getFileByPath(item.notePath);
        if (note) {
          await app.media.rename(item, finalName);
        }
      }

      const notes = app.vault.getMarkdownFiles?.() || app.vault.getFiles?.().filter(f => f.extension === 'md') || [];
      for (const note of notes) {
        try {
          const raw = await app.vault.read(note);
          if (raw.includes(oldName) || raw.includes(oldBase) || raw.includes(oldFile.path)) {
            const reOldName = new RegExp('(!?\\[\\[)' + escapeRegex(oldName) + '([\\|\\]])', 'g');
            const reOldBase = new RegExp('(!?\\[\\[)' + escapeRegex(oldBase) + '([\\|\\]])', 'g');
            const rePath1 = new RegExp('<' + escapeRegex(oldFile.path) + '>', 'g');
            const rePath2 = new RegExp('\\(' + escapeRegex(oldFile.path) + '\\)', 'g');
            const updated = raw.replace(reOldName, '$1' + finalName + '$2')
                               .replace(reOldBase, '$1' + finalName + '$2')
                               .replace(rePath1, '<' + targetPath + '>')
                               .replace(rePath2, '(' + targetPath + ')');
            if (updated !== raw) {
              await app.vault.process(note, () => updated);
            }
          }
        } catch {}
      }

      for (const boardFile of app.vault.getFiles().filter(f => f.extension === 'imageboard')) {
        try {
          const raw = await app.vault.read(boardFile);
          if (raw.includes(oldName) || raw.includes(oldFile.path)) {
            const updated = raw.replaceAll(oldFile.path, targetPath).replaceAll(oldName, finalName);
            await app.vault.process(boardFile, () => updated);
            const live = app.workspace.getLeavesOfType?.('image-atlas-board').find(l => l.view?.file?.path === boardFile.path)?.view;
            if (live) live.setViewData(updated, true);
          }
        } catch {}
      }

      app.media.touch();
      await app.media.flush();
      app.vault.trigger('media-changed', item);
      app.vault.trigger('image-caption-changed', item);
      app.refreshMediaBoards?.(item.id);
      new Notice('Imagem renomeada: ' + finalName);
      return finalName;
    }
  }

  item.title = cleanName;
  item.customTitle = true;
  app.media.touch();
  await app.media.flush();
  app.vault.trigger('media-changed', item);
  new Notice('Imagem renomeada: ' + cleanName);
  return cleanName;
}


export class ImagePane{
 constructor(app,host,item,onCaption){this.app=app;this.item=item;this.onCaption=onCaption;this.saved=item.caption||'';this.root=host.createDiv({cls:'atlas-image-pane'});const stage=this.root.createDiv({cls:'atlas-image-stage'});stage.createEl('img',{attr:{src:app.images.sourceURL(item),alt:item.title}});const footer=this.root.createDiv({cls:'atlas-image-caption-editor'});this.input=footer.createEl('textarea',{attr:{'aria-label':'Legenda da imagem',placeholder:'Adicione uma legenda…',rows:'2'}});this.input.value=this.saved;this.status=footer.createSpan({cls:'atlas-note-save-status',text:'Legenda salva na mídia'});this.input.oninput=()=>{clearTimeout(this.timer);this.status.textContent='Salvando legenda…';this.timer=setTimeout(()=>this.save().catch(error=>{this.status.textContent=error.message;new Notice(error.message)}),400)};(app.embeddedEditors||=new Set()).add(this)}
 async save(){clearTimeout(this.timer);const value=this.input.value.trim();this.writing=(this.writing||Promise.resolve()).catch(()=>{}).then(async()=>{if(value===this.saved)return;await this.app.images.setCaption(this.item,value);await this.onCaption?.(value);this.saved=value;this.status.textContent='Legenda salva na mídia'});await this.writing}
 async dispose(){await this.save();this.app.embeddedEditors.delete(this);this.root.remove()}
}
class ImageViewer extends Modal{
 constructor(app,item,options={}){super(app);this.item=item;this.options=options}
 onOpen(){
    (this.app.imageViewers||=new Set()).add(this);
    this.setTitle(this.item.title);
    if(this.titleEl){
      this.titleEl.style.cursor='pointer';
      this.titleEl.setAttribute('title','Clique para renomear esta imagem');
      this.titleEl.onclick=()=>this.promptRename();
    }
    this.modalEl.addClass('atlas-image-viewer');
    if(this.options.fullscreen)this.modalEl.addClass('is-fullscreen');
    const tools=this.contentEl.createDiv({cls:'atlas-image-viewer-tools'});
    this.app.uiButton(tools,'Renomear imagem','edit-3',()=>this.promptRename());
    this.app.uiButton(tools,'Tela cheia','maximize',()=>this.modalEl.classList.toggle('is-fullscreen'));
    this.app.uiButton(tools,'Biblioteca de mídia','images',async()=>{await this.pane.save();await this.app.openMediaLibrary();await this.close()});
    this.pane=new ImagePane(this.app,this.contentEl,this.item,this.options.onCaption);
  }
  async promptRename(){
    const modal=new Modal(this.app);
    modal.setTitle('Renomear imagem');
    modal.contentEl.createEl('p',{cls:'ia-muted',text:'Digite o novo nome da imagem. A extensão .png será mantida automaticamente.'});
    const input=modal.contentEl.createEl('input',{value:this.item.title||'',attr:{'aria-label':'Nome da imagem',placeholder:'ex: pediculosis-ciliaris.png'}});
    input.style.width='100%';input.style.marginBottom='14px';
    const actions=modal.contentEl.createDiv({cls:'ia-modal-actions'});
    this.app.uiButton(actions,'Cancelar','x',()=>modal.close());
    const saveBtn=this.app.uiButton(actions,'Salvar','check',async()=>{
      saveBtn.disabled=true;
      try{
        const newTitle=await renameImage(this.app,this.item,input.value);
        if(newTitle)this.setTitle(newTitle);
        modal.close();
      }catch(err){new Notice(err.message)}finally{saveBtn.disabled=false}
    });
    saveBtn.addClass('mod-cta');
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveBtn.click()}};
    modal.open();input.focus();input.select();
  }
 async close(){if(this.closing)return;this.closing=true;try{await this.pane?.save();super.close()}catch(error){new Notice(error.message)}finally{this.closing=false}}
 async onClose(){this.app.imageViewers?.delete(this);await this.pane?.dispose()}
}
export function installImages(app){
 const fileFrom=src=>{if(src.startsWith('atlas-data://library/')){const url=new URL(src);return app.vault.getFileByPath(decodeURIComponent(url.pathname.slice(1)))}return app.metadataCache.getFirstLinkpathDest(src)};
 const resolveItem=(src,options={})=>{if(app.media.readOnly)throw Error('A biblioteca de mídia precisa ser reparada antes de alterar imagens.');const file=fileFrom(src);if(file)return app.images.register(file,options.notePath);const url=new URL(src);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Imagem não encontrada na biblioteca.');const key='image:'+url.href;let item=app.media.byKey.get(key);if(!item){item={id:crypto.randomUUID(),key,source:url.href,type:'image',local:false,title:decodeURIComponent(url.pathname.split('/').pop()||'Imagem'),thumbnail:url.href,refs:[],addedAt:Date.now(),notePath:''};app.media.items.set(item.id,item);app.media.byKey.set(key,item);app.media.touch()}return item};
 app.images={
  sourceURL(item){return item.local?app.vault.getResourcePath(app.vault.getFileByPath(item.source)||{path:item.source}):item.source},
  async trash(src,options={}){await app.flushAll();const item=resolveItem(src,options);return app.mediaUI.remove(item)},
  forSource(src){const file=fileFrom(src);return file?app.media.byKey.get('image:'+file.path):app.media.byKey.get('image:'+src)},
  register(file,notePath){const item=app.media.get(file.path,file.name,true);if(item.type!=='image')throw Error('Arquivo de imagem não reconhecido.');let changed=false;if(!item.thumbnail){item.thumbnail=app.vault.getResourcePath(file);changed=true}if(notePath&&!(item.sourceNotes||[]).includes(notePath)){(item.sourceNotes||=[]).push(notePath);changed=true}if(changed)app.media.touch();return item},
  async rename(item,name){return renameImage(app,item,name);},
  async open(src,options={}){await app.flushAll();const file=fileFrom(src);let item;if(file)item=app.images.register(file,options.notePath);else{const url=new URL(src);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Imagem não encontrada na biblioteca.');const key='image:'+url.href;item=app.media.byKey.get(key);if(!item){item={id:crypto.randomUUID(),key,source:url.href,type:'image',local:false,title:decodeURIComponent(url.pathname.split('/').pop()||'Imagem'),thumbnail:url.href,refs:[],addedAt:Date.now(),notePath:''};app.media.items.set(item.id,item);app.media.byKey.set(key,item);app.media.touch()}}if(item.caption===undefined&&options.caption){item.caption=options.caption;app.media.touch()}return new ImageViewer(app,item,options).open()},
  async openItem(item,options={}){await app.flushAll();return new ImageViewer(app,item,options).open()},
  mount(host,item){const pane=new ImagePane(app,host,item);return()=>pane.dispose()},
  async setCaption(item,caption){const note=app.vault.getFileByPath(item.notePath)||await app.media.ensureNote(item),start='<!-- image-atlas-caption:start -->',end='<!-- image-atlas-caption:end -->';await app.vault.process(note,text=>{const block=start+'\n'+(caption?'## Legenda\n\n'+caption+'\n':'')+end;return text.includes(start)?text.replace(/<!-- image-atlas-caption:start -->[\s\S]*?<!-- image-atlas-caption:end -->/,()=>block):text.trimEnd()+'\n\n'+block+'\n'});item.caption=caption;app.media.touch();await app.media.flush();app.vault.trigger('image-caption-changed',item)},
 };
 const openLink=app.workspace.openLinkText.bind(app.workspace);app.workspace.openLinkText=(text,source,placement)=>{const file=app.metadataCache.getFirstLinkpathDest(text,source);return file&&/^(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(file.extension)?app.images.open(app.vault.getResourcePath(file),{notePath:source}):openLink(text,source,placement)};
}
