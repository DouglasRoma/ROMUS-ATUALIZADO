import {TextFileView,Component,Notice,MarkdownRenderer} from './compat.js';
import {attachWikiLinks} from './wiki-links.js';
import {PropertiesModal,propertyDocument,publicProperties} from './properties.js';

export class NoteEditor extends TextFileView{
  async onOpen(){
    this.contentEl.addClass('note-editor');
    const header=this.contentEl.createDiv({cls:'atlas-note-header'});
    this.path=header.createDiv({cls:'atlas-note-breadcrumb'});
    this.toolbar=header.createDiv({cls:'note-tools'});
    this.name=this.toolbar.createEl('button',{text:'Nota',cls:'atlas-note-title',attr:{title:'Renomear nota'}});this.name.onclick=()=>this.app.renameNote(this.file);
    const actions=this.toolbar.createDiv({cls:'atlas-note-actions'});
    this.app.uiButton(actions,'Propriedades','sliders-horizontal',()=>this.openProperties());
    this.app.uiButton(actions,'Flashcards','layers',()=>this.app.editNoteFlashcards());
    this.app.uiButton(actions,'Estudar','play',()=>this.app.plugin.openNoteFlashcardReview(this.file));
    this.app.uiButton(actions,'Escrever / Prévia','eye',()=>this.preview());
    this.propertyPreview=header.createDiv({cls:'atlas-note-properties-preview'});
    this.status=header.createSpan({cls:'atlas-note-save-status',text:'Salvo'});
    const writing=this.contentEl.createDiv({cls:'atlas-writing-area'});
    this.input=writing.createEl('textarea',{cls:'note-input',attr:{'aria-label':'Texto da nota',spellcheck:'true',placeholder:'Comece uma ideia. Digite [[ para conectar uma nota…'}});
    this.rendered=writing.createDiv({cls:'markdown-preview'});this.rendered.hidden=true;
    this.input.oninput=()=>{clearTimeout(this.timer);this.status.textContent='Salvando…';this.timer=setTimeout(()=>this.save().catch(error=>{this.status.textContent=error.message;new Notice(error.message)}),400)};
    this.wiki=attachWikiLinks(this);this.register(()=>this.wiki.dispose());
    this.registerEvent(this.app.vault.on('rename',file=>{if(file===this.file){this.name.textContent=file.basename;this.path.textContent=file.path.split('/').slice(0,-1).join(' / ')||'Biblioteca'}}));
    this.registerEvent(this.app.vault.on('modify',async file=>{
      if(file!==this.file||this.input.value!==this.originalBody)return;
      const before=this.originalBody,text=await this.app.vault.read(file);
      if(this.input.value===before){this.originalBody=propertyDocument(text).body;this.input.value=this.originalBody;this.showProperties(text)}
    }));
  }
  getViewType(){return'markdown'}
  async readFile(file){
    this.file=file;const text=await this.app.vault.read(file);
    // Keep editing possible when imported YAML is malformed, without rewriting it.
    this.originalBody=text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
    this.input.value=this.originalBody;this.name.textContent=file.basename;this.path.textContent=file.path.split('/').slice(0,-1).join(' / ')||'Biblioteca';this.status.textContent='Salvo';this.showProperties(text);
  }
  showProperties(text){
    this.propertyPreview.empty();
    try{for(const [key,value]of Object.entries(publicProperties(propertyDocument(text).props)).slice(0,5)){
      const shown=Array.isArray(value)?value.join(', '):typeof value==='object'?'{…}':String(value??'');
      const chip=this.propertyPreview.createEl('button',{text:`${key} · ${shown}`,attr:{title:'Editar propriedade '+key}});chip.onclick=()=>this.openProperties();
    }}catch{this.propertyPreview.createSpan({text:'Confira o cabeçalho YAML desta nota.'})}
    this.propertyPreview.hidden=!this.propertyPreview.childElementCount;
  }
  async save(){
    clearTimeout(this.timer);
    const run=async()=>{
      if(!this.file||this.input.value===this.originalBody)return;
      const body=this.input.value,before=this.originalBody;
      await this.app.vault.process(this.file,text=>{
        const prefix=text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0]||'';
        if(text.slice(prefix.length)!==before)throw Error('A nota mudou em outra tela. Seu rascunho foi mantido; reabra a nota para conferir.');return prefix+body;
      });
      this.originalBody=body;this.status.textContent=this.input.value===body?'Salvo':'Alterações pendentes';
    };
    this.saving=(this.saving||Promise.resolve()).catch(()=>{}).then(run);return this.saving;
  }
  async openProperties(){await this.save();this.wiki.close();new PropertiesModal(this.app,this.file,async()=>this.showProperties(await this.app.vault.read(this.file))).open()}
  async preview(){
    await this.save();this.wiki.close();this.rendered.hidden=!this.rendered.hidden;this.input.hidden=!this.rendered.hidden;
    if(!this.rendered.hidden){this.previewComponent?.unload();this.previewComponent=new Component();await MarkdownRenderer.render(this.app,this.input.value,this.rendered,this.file.path,this.previewComponent)}
  }
  async onClose(){await this.save();this.wiki.dispose();this.previewComponent?.unload()}
}
