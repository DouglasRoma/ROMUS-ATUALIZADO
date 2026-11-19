import {TextFileView,Component,Notice,MarkdownRenderer,setIcon,Menu} from './compat.js';
import {attachWikiLinks} from './wiki-links.js';
import {PropertiesModal,propertyDocument,publicProperties} from './properties.js';
import {FormattedEditor,readableDocument,removeRenderedImage} from './formatted-editor.js';
import {splitNoteContent,mergeNoteContent,noteFlashcardBlock,writeNoteFlashcardBlock,normalizeFlashcardsToBullets} from './note-content.js';
import {colorChip} from './property-colors.js';
import {installEditorImages} from './editor-images.js';
import {installEditorMedia} from './editor-media.js';
import {EditorSlashMenu} from './editor-slash.js';
import {NoteOutline} from './note-outline.js';
import {captureReadingPosition,restoreReadingPosition} from './editor-location.js';
import {NotePage} from './note-page.js';
import {installNoteFind} from './note-find.js';
import {openWikipediaModal} from './wikipedia.js';

export class NoteEditor extends TextFileView{
  async onOpen(){
    this.contentEl.addClass('note-editor');
    const header=this.contentEl.createDiv({cls:'atlas-note-header'});
    this.path=header.createDiv({cls:'atlas-note-breadcrumb'});
    this.toolbar=header.createDiv({cls:'note-tools'});
    this.name=this.toolbar.createEl('button',{text:'Nota',cls:'atlas-note-title',attr:{title:'Renomear nota'}});this.name.onclick=()=>this.app.renameNote(this.file);
    const actions=this.toolbar.createDiv({cls:'atlas-note-actions'});
    this.app.uiButton(actions,'Propriedades','sliders-horizontal',()=>this.openProperties());
    this.app.uiButton(actions,'Flashcards','layers',async()=>{await this.save();return this.app.plugin.editMediaFlashcards(this.file)});
    this.studyButton=this.app.uiButton(actions,'Estudar','play',()=>this.openStudyAction(this.studyButton));
    this.modeSelect=actions.createEl('select',{attr:{'aria-label':'Modo da nota'}});
    for(const [value,label]of [['formatted','Editor formatado'],['source','Markdown'],['preview','Prévia']])this.modeSelect.createEl('option',{text:label,attr:{value}});
    this.modeSelect.onchange=()=>this.setEditorMode(this.modeSelect.value);
    this.studyToggle=this.app.uiButton(actions,'Flashcards e mapa','eye',()=>this.toggleStudyContent());
    this.studyToggle.setAttribute('aria-pressed','false');
    this.studyToggle.title='Mostrar / ocultar flashcards e mapa · Ctrl+Alt+F (ou Ctrl+Shift+C)';
    this.findButton=this.app.uiButton(actions,'Buscar','search',()=>this.openNoteFind());
    this.findButton.title='Buscar na nota e flashcards · Ctrl+F';
    const more=actions.createEl('button',{cls:'atlas-note-more',attr:{title:'Mais ações da nota','aria-label':'Mais ações da nota'}});setIcon(more,'ellipsis');more.onclick=event=>this.app.showNoteMenu(this.file,event);
    header.insertBefore(actions,this.path);
    this.propertyPreview=header.createDiv({cls:'atlas-note-properties-preview'});
    this.status=header.createSpan({cls:'atlas-note-save-status',text:'Salvo'});
    const writing=this.writingArea=this.contentEl.createDiv({cls:'atlas-writing-area'});this.documentHost=writing.createDiv({cls:'atlas-note-document'});this.documentHost.hidden=true;
    this.input=writing.createEl('textarea',{cls:'note-input',attr:{'aria-label':'Texto da nota',spellcheck:'true',placeholder:'Comece uma ideia. Digite [[ para conectar uma nota…'}});
    this.rendered=writing.createDiv({cls:'markdown-preview'});this.rendered.hidden=true;
    this.richHost=writing.createDiv({cls:'atlas-rich-editor'});this.richHost.hidden=true;
    this.studyPanel=writing.createDiv({cls:'atlas-note-study-panel'});this.studyPanel.hidden=true;
    this.sourceInput=writing.createEl('textarea',{cls:'note-input atlas-source-input',attr:{'aria-label':'Texto da nota',spellcheck:'true'}});this.sourceInput.hidden=true;
    this.sourceInput.oninput=()=>{this.input.value=this.showStudy?this.sourceInput.value:mergeNoteContent(this.sourceInput.value,this.sourceManaged||[]);this.queueSave();this.slash?.update()};
    this.images=installEditorImages(this);this.media=installEditorMedia(this);this.slash=new EditorSlashMenu(this);
    this.app.uiButton(actions,'Mídia','link',()=>this.media.pick());
    this.notePage=new NotePage(this,header,actions);
    this.pageScrollElement=this.contentEl.createDiv({cls:'romus-page-scroll'});this.pageScrollElement.append(header,writing,this.notePage.hub);
    this.outline=new NoteOutline(this);
    this.noteFind=installNoteFind(this);
    this.input.oninput=()=>this.queueSave();
    const owner=this;this.wiki=attachWikiLinks({input:this.sourceInput,app:this.app,get file(){return owner.file},get status(){return owner.status}});this.register(()=>this.wiki.dispose());
    this.registerEvent(this.app.vault.on('rename',file=>{if(file===this.file){this.name.textContent=file.basename;this.updateLocation()}}));
    this.registerEvent(this.app.vault.on('modify',async file=>{
      if(file!==this.file||this.formatted?.dirty||this.input.value!==this.originalBody)return;
      const before=this.originalBody,text=await this.app.vault.read(file);
      if(!this.formatted?.dirty&&this.input.value===before){const next=text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');this.showProperties(text);if(next===before)return;const position=captureReadingPosition(this);this.originalBody=next;this.input.value=this.originalBody;await this.refreshContent();restoreReadingPosition(this,position)}
    }));
  }
  getViewType(){return'markdown'}
  async readFile(file){
    this.file=file;const text=await this.app.vault.read(file);
    // Keep editing possible when imported YAML is malformed, without rewriting it.
    this.originalBody=text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
    this.input.value=this.originalBody;this.name.textContent=file.basename;this.updateLocation();this.status.textContent='Salvo';this.showProperties(text);this.loadAttachedDocument();await this.setEditorMode(this.app.preferences.noteMode||'formatted');
  }
  updateLocation(){const folder=this.file.path.split('/').slice(0,-1).join('/'),shown=this.app.noteCatalog.sidebarFolder(folder);this.path.textContent=shown.split('/').join(' / ');this.path.hidden=!shown}
  loadAttachedDocument(){const media=this.app.media?.byNote(this.file),item=!this.embeddedSummary&&media?.type==='pdf'?media:null;this.documentDispose?.();this.documentHost.empty();this.documentHost.hidden=!item;if(item)this.documentDispose=this.app.mediaUI.inline(this.documentHost,item);if(media){this.name.textContent=media.title;this.path.textContent='Resumo da mídia';this.path.hidden=false}}
  showProperties(text,force=false){
    if(this.notePage){try{this.notePage.load(text,force)}catch(error){this.propertyPreview.empty();this.propertyPreview.hidden=false;this.propertyPreview.createSpan({text:error.message})}return}
    this.propertyPreview.empty();
    try{for(const [key,value]of Object.entries(publicProperties(propertyDocument(text).props)).slice(0,5)){
      const shown=Array.isArray(value)?value.join(', '):typeof value==='object'?'{…}':String(value??'');
      const chip=this.propertyPreview.createEl('button',{text:`${key} · ${shown}`,attr:{title:'Editar propriedade '+key}});colorChip(this.app,chip,key,value);chip.onclick=()=>this.openProperties();
    }}catch{this.propertyPreview.createSpan({text:'Confira o cabeçalho YAML desta nota.'})}
    this.propertyPreview.hidden=!this.propertyPreview.childElementCount;
  }
  queueSave(){clearTimeout(this.timer);this.status.textContent='Salvando…';this.timer=setTimeout(()=>this.save().catch(error=>{this.status.textContent=error.message;new Notice(error.message)}),400)}
  async save(){
    this.formatted?.flushToOwner(false);
    if(this.notePage?.wikiEditor){
      this.notePage.wikiEditor.flushToOwner(false);
      await this.notePage.saveWiki?.();
    }
    if(this.flushStudySave){
      await this.flushStudySave();
    }
    await Promise.all(this.imageJobs||[]);
    this.formatted?.flushToOwner(false);
    clearTimeout(this.timer);
    const run=async()=>{
      if(!this.file||this.input.value===this.originalBody)return;
      let body=this.input.value;
      const before=this.originalBody;
      await this.app.vault.process(this.file,text=>{
        const prefix=text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0]||'';
        const diskBody=text.slice(prefix.length);
        if(diskBody!==before){
          const markers=diskBody.match(/<!--\s*image-atlas-[^>]*-->/g)||[];
          for(const marker of markers){
            if(!body.includes(marker))body=body.trimEnd()+'\n\n'+marker+'\n';
          }
        }
        const cleanBody = body.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^(?:---\r?\n)+/, '');
        return prefix+cleanBody;
      });
      const cleanInput = body.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^(?:---\r?\n)+/, '');
      this.input.value=cleanInput;
      this.originalBody=cleanInput;
      this.status.textContent='Salvo';
      for(const editor of new Set([...(this.app.embeddedEditors||[]),...this.app.workspace.leaves.map(l=>l.view)])){
        if(editor!==this&&editor?.file?.path===this.file.path&&editor.input){
          editor.originalBody=body;
        }
      }
    };
    this.saving=(this.saving||Promise.resolve()).catch(()=>{}).then(run);return this.saving;
  }
  async openStudyAction(triggerEl){
    await this.save();
    const text=this.input.value;
    const tools=this.app.plugin.reviewSourceTools();
    const parsed=tools.parseNoteFlashcards(text,this.file.path);
    const hasCloze=parsed.cards.some(c=>c.cardType==='cloze'||c.isCloze);
    const hasStandard=parsed.cards.some(c=>c.cardType!=='cloze'&&!c.isCloze);
    if(hasCloze&&hasStandard){
      const menu=new Menu();
      menu.addItem(item=>item.setTitle('📝 Cloze na Nota (RemNote)').setIcon('pencil').onClick(async()=>{
        await this.app.plugin.openNoteFlashcardReview(this.file,undefined,{studyMode:'cloze-note'});
      }));
      menu.addItem(item=>item.setTitle('🎴 Flashcards Convencionais').setIcon('layers').onClick(async()=>{
        await this.app.plugin.openNoteFlashcardReview(this.file,undefined,{studyMode:'flashcards'});
      }));
      if(triggerEl){
        const r=triggerEl.getBoundingClientRect();
        menu.showAtPosition({x:r.left,y:r.bottom+4});
      }else{
        await this.app.plugin.openNoteFlashcardReview(this.file,undefined,{studyMode:'cloze-note'});
      }
      return;
    }
    if(hasCloze){
      return this.app.plugin.openNoteFlashcardReview(this.file,undefined,{studyMode:'cloze-note'});
    }
    return this.app.plugin.openNoteFlashcardReview(this.file,undefined,{studyMode:'flashcards'});
  }
  async openProperties(){await this.save();this.wiki.close();new PropertiesModal(this.app,this.file,async()=>this.showProperties(await this.app.vault.read(this.file))).open()}
  getState(){return{mode:this.editorMode,showStudy:!!this.showStudy}}
  async toggleStudyContent(){await this.save();this.showStudy=!this.showStudy;this.studyToggle.setAttribute('aria-pressed',String(this.showStudy));this.studyToggle.title=this.showStudy?'Ocultar flashcards e mapa mental':'Mostrar flashcards e mapa mental';await this.refreshContent()}
  async setEditorMode(mode){if(mode===this.editorMode)return;const position=captureReadingPosition(this);await this.save();this.wiki.close();this.slash?.close();this.formatted?.closeSuggestions();this.formatted?.bubble.hide();this.editorMode=mode;this.modeSelect.value=mode;this.input.hidden=true;this.sourceInput.hidden=mode!=='source';this.richHost.hidden=mode!=='formatted';this.rendered.hidden=mode!=='preview';await this.refreshContent();restoreReadingPosition(this,position,{focus:!!position&&mode!=='preview'})}
  async refreshContent(){
    const {text,managed}=splitNoteContent(this.input.value);this.sourceManaged=managed;const source=this.showStudy?this.input.value:text;if(this.sourceInput.value!==source)this.sourceInput.value=source;
    if(this.editorMode==='formatted'){this.formatted||=new FormattedEditor(this,this.richHost);this.formatted.load(this.input.value)}
    if(this.editorMode==='preview'&&this.previewText!==text){this.previewText=text;this.previewComponent?.unload();this.previewComponent=new Component();this.rendered.empty();await MarkdownRenderer.render(this.app,text,this.rendered,this.file.path,this.previewComponent,{onRemoveImage:index=>removeRenderedImage(this,index,()=>this.refreshContent())})}
    this.studyPanel.hidden=!this.showStudy;
    this.studyComponent?.unload();this.studyPanel.empty();
    if(!this.studyPanel.hidden){
      this.studyComponent=new Component();
      this.studyComponent.load();
      await this.renderStudyPanel(managed);
    }
    this.outline.refresh();
  }
  async renderStudyPanel(managed){
    const tools=this.app.plugin.reviewSourceTools();
    const block=noteFlashcardBlock(this.input.value);
    let source=block.source;
    if(!source){
      const loose=tools.parseNoteFlashcards(this.input.value,this.file.path).cards.filter(c=>c.cardType!=='cloze'&&!c.isCloze);
      if(loose.length)source=tools.serializeFlashcardRows(loose);
    }
    const bulletSource=normalizeFlashcardsToBullets(source);

    const head=this.studyPanel.createDiv({cls:'atlas-flashcards-header'});
    const titleRow=head.createDiv({cls:'atlas-flashcards-title-row'});
    const titleGroup=titleRow.createDiv({cls:'atlas-flashcards-title-group'});
    titleGroup.createSpan({cls:'atlas-flashcards-kind',text:'FLASHCARDS · REMNOTE'});
    titleGroup.createEl('h2',{cls:'atlas-flashcards-title',text:'Flashcards da nota'});

    const countBadge=titleRow.createSpan({cls:'atlas-flashcards-badge'});
    const updateCount=val=>{
      const parsed=tools.parseNoteFlashcards(val,this.file.path);
      const count=parsed.cards.length;
      countBadge.textContent=`${count} ${count===1?'cartão ativo':'cartões ativos'}`;
      countBadge.classList.toggle('has-cards',count>0);
    };
    updateCount(bulletSource);

    const toolbar=head.createDiv({cls:'atlas-flashcards-toolbar'});
    const modes=toolbar.createDiv({cls:'atlas-flashcards-modes'});
    const mdBtn=this.app.uiButton(modes,'Escrever no Markdown','edit-3',()=>setMode('markdown'));
    const prevBtn=this.app.uiButton(modes,'Prévia RemNote','eye',()=>setMode('preview'));

    const formats=toolbar.createDiv({cls:'atlas-flashcards-formatting'});
    const boldBtn=this.app.uiButton(formats,'Negrito','bold',()=>wrapSelection('**','**','negrito'));
    boldBtn.title='Negrito · Ctrl+B';
    const italicBtn=this.app.uiButton(formats,'Itálico','italic',()=>wrapSelection('*','*','itálico'));
    italicBtn.title='Itálico · Ctrl+I';
    const linkBtn=this.app.uiButton(formats,'Nota [[ ]]','link',()=>insertNoteLink());
    linkBtn.title='Vincular nota · [[ ou Ctrl+K';
    const wikiBtn=this.app.uiButton(formats,'Wikipedia','wikipedia',()=>openWiki());
    wikiBtn.title='Vincular à Wikipedia';

    const inserts=toolbar.createDiv({cls:'atlas-flashcards-quick-inserts'});
    this.app.uiButton(inserts,'>> Básico','arrow-right',()=>insertFormat('>>'));
    this.app.uiButton(inserts,':: Conceito','book-open',()=>insertFormat('::'));
    this.app.uiButton(inserts,'::: 2 Vias','repeat',()=>insertFormat(':::'));
    this.app.uiButton(inserts,'{{ }} Omissão','scissors',()=>insertCloze());

    const actions=toolbar.createDiv({cls:'atlas-flashcards-actions'});
    const studyBtn=this.app.uiButton(actions,'Estudar no FSRS','play',async()=>{
      try{
        if(this.flushStudySave)await this.flushStudySave();
        await this.save();
        await this.startReview(studyBtn.buttonEl || studyBtn);
      }catch(err){
        new Notice(err.message);
      }
    });
    studyBtn.addClass('mod-cta');

    const editorWrap=this.studyPanel.createDiv({cls:'atlas-flashcards-editor-container'});
    const textarea=editorWrap.createEl('textarea',{
      cls:'note-input atlas-flashcards-markdown-editor',
      attr:{
        rows:'8',
        spellcheck:'true',
        'aria-label':'Flashcards da nota em formato RemNote',
        placeholder:'- Pergunta >> Resposta\n- Conceito :: Definição\n- Termo ::: Definição bidirecional (2 vias)\n- O ACV isquêmico representa {{80-85%}} dos casos.\n- Pergunta == Resposta'
      }
    });
    textarea.value=bulletSource;
    this.studyTextarea=textarea;

    const owner=this;
    this.studyWikiLinks?.dispose();
    this.studyWikiLinks=attachWikiLinks({
      input:textarea,
      app:this.app,
      get file(){return owner.file},
      get status(){return status}
    });

    const wrapSelection=(before,after=before,defaultText='texto')=>{
      textarea.focus();
      const start=textarea.selectionStart,end=textarea.selectionEnd;
      const sel=textarea.value.slice(start,end);
      if(sel){
        if(sel.startsWith(before)&&sel.endsWith(after)&&sel.length>=before.length+after.length){
          textarea.setRangeText(sel.slice(before.length,sel.length-after.length),start,end,'select');
        }else{
          textarea.setRangeText(before+sel+after,start,end,'select');
        }
      }else{
        textarea.setRangeText(before+defaultText+after,start,end,'select');
        textarea.setSelectionRange(start+before.length,start+before.length+defaultText.length);
      }
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    };

    const insertNoteLink=()=>{
      textarea.focus();
      const start=textarea.selectionStart,end=textarea.selectionEnd;
      const sel=textarea.value.slice(start,end).trim();
      if(sel){
        textarea.setRangeText(`[[${sel}]]`,start,end,'end');
      }else{
        textarea.setRangeText('[[',start,end,'end');
      }
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    };

    const openWiki=()=>{
      textarea.focus();
      const start=textarea.selectionStart,end=textarea.selectionEnd;
      const sel=textarea.value.slice(start,end).trim();
      openWikipediaModal(this.app,{
        term:sel||this.file.basename,
        onLink:async article=>{
          textarea.focus();
          const linkText=`[[${article.title}]]`;
          if(start!==end){
            textarea.setRangeText(linkText,start,end,'end');
          }else{
            textarea.setRangeText(linkText,textarea.selectionStart,textarea.selectionEnd,'end');
          }
          textarea.dispatchEvent(new Event('input',{bubbles:true}));
        }
      });
    };

    const footer=editorWrap.createDiv({cls:'atlas-flashcards-editor-footer'});
    footer.createSpan({
      cls:'atlas-flashcards-help-text',
      text:'Escreva em bullets (-) no formato RemNote: >> (básico), :: (conceito), ::: (bidirecional), {{omissão}} ou == (cartão). Enter continua o bullet. Tab indenta.'
    });
    const status=footer.createSpan({cls:'atlas-flashcards-save-status',text:'Salvo'});

    let saveTimer=null;
    const flushSave=async()=>{
      clearTimeout(saveTimer);
      const text=this.input.value;
      const curBlock=noteFlashcardBlock(text);
      const newSource=textarea.value.trim();
      if(!curBlock.original&&!newSource)return;
      const updated=writeNoteFlashcardBlock(text,curBlock.original,newSource);
      if(updated!==text){
        this.input.value=updated;
        if(this.formatted){
          const {managed}=splitNoteContent(updated);
          this.formatted.managed=managed;
        }
        this.queueSave();
      }
      updateCount(textarea.value);
      status.textContent='Salvo';
    };
    this.flushStudySave=flushSave;

    textarea.oninput=()=>{
      status.textContent='Salvando…';
      updateCount(textarea.value);
      clearTimeout(saveTimer);
      saveTimer=setTimeout(flushSave,350);
    };

    textarea.onkeydown=event=>{
      if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey){
        const k=event.key.toLowerCase();
        if(k==='b'){
          event.preventDefault();
          wrapSelection('**','**','negrito');
          return;
        }
        if(k==='i'){
          event.preventDefault();
          wrapSelection('*','*','itálico');
          return;
        }
        if(k==='k'){
          event.preventDefault();
          insertNoteLink();
          return;
        }
      }
      if(event.key==='Tab'){
        event.preventDefault();
        const start=textarea.selectionStart,end=textarea.selectionEnd;
        if(event.shiftKey){
          const before=textarea.value.slice(0,start),lineStart=before.lastIndexOf('\n')+1;
          if(textarea.value.slice(lineStart,lineStart+2)==='  '){
            textarea.setRangeText('',lineStart,lineStart+2,'end');
          }
        }else{
          textarea.setRangeText('  ',start,end,'end');
        }
        textarea.dispatchEvent(new Event('input'));
        return;
      }
      if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){
        const start=textarea.selectionStart;
        const lineStart=textarea.value.lastIndexOf('\n',start-1)+1;
        const currentLine=textarea.value.slice(lineStart,start);
        const bulletMatch=currentLine.match(/^(\s*)([-*+]|\d+[.)])\s+/);
        if(bulletMatch){
          if(currentLine.trim()===bulletMatch[2]){
            event.preventDefault();
            textarea.setRangeText('',lineStart,start,'end');
            textarea.dispatchEvent(new Event('input'));
            return;
          }
          event.preventDefault();
          const prefix='\n'+bulletMatch[1]+'- ';
          textarea.setRangeText(prefix,start,start,'end');
          textarea.dispatchEvent(new Event('input'));
          return;
        }
      }
      if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){
        event.preventDefault();
        flushSave();
      }
    };

    const insertFormat=sep=>{
      textarea.focus();
      const start=textarea.selectionStart,end=textarea.selectionEnd;
      const selected=textarea.value.slice(start,end).trim();
      if(selected){
        textarea.setRangeText(`- ${selected} ${sep} `,start,end,'end');
      }else{
        const before=textarea.value.slice(0,start);
        const needNewline=before.length>0&&!before.endsWith('\n');
        const snippet=(needNewline?'\n':'')+`- Pergunta ${sep} Resposta`;
        textarea.setRangeText(snippet,start,start,'end');
      }
      textarea.dispatchEvent(new Event('input'));
    };

    const insertCloze=()=>{
      textarea.focus();
      const start=textarea.selectionStart,end=textarea.selectionEnd;
      const selected=textarea.value.slice(start,end).trim();
      if(selected){
        textarea.setRangeText(`{{${selected}}}`,start,end,'end');
      }else{
        textarea.setRangeText('{{palavra ocultada}}',start,end,'end');
      }
      textarea.dispatchEvent(new Event('input'));
    };

    const previewWrap=this.studyPanel.createDiv({cls:'atlas-flashcards-preview-container'});
    previewWrap.hidden=true;

    const renderPreview=async()=>{
      previewWrap.empty();
      const parsed=tools.parseNoteFlashcards(textarea.value,this.file.path);
      if(!parsed.cards.length){
        previewWrap.createEl('p',{
          cls:'ia-muted',
          text:'Nenhum flashcard válido encontrado. Alterne para "Escrever no Markdown" para criar cartões em bullet.'
        });
        return;
      }
      const list=previewWrap.createEl('ul',{cls:'atlas-remnote-list'});
      for(const card of parsed.cards){
        const item=list.createEl('li',{cls:`atlas-remnote-item card-type-${card.cardType||'basic'}`});
        item.createSpan({cls:'atlas-remnote-bullet'});
        
        let pillText='→ BÁSICO',pillClass='badge-basic';
        if(card.cardType==='concept'){pillText=':: CONCEITO';pillClass='badge-concept';}
        else if(card.cardType==='two-way'){pillText=card.direction==='reverse'?'⇄ 2 VIAS (VERSO)':'⇄ 2 VIAS (FRENTE)';pillClass='badge-twoway';}
        else if(card.cardType==='cloze'){pillText='[...] OMISSÃO';pillClass='badge-cloze';}
        else if(card.cardType==='descriptor'){pillText=';; DESCRITOR';pillClass='badge-descriptor';}
        item.createSpan({cls:`atlas-remnote-badge ${pillClass}`,text:pillText});

        const body=item.createDiv({cls:'atlas-remnote-body'});
        if(card.parentPrompt||card.contextBreadcrumb){
          const callout=body.createDiv({cls:'atlas-remnote-context-callout'});
          callout.createSpan({cls:'atlas-remnote-context-pin',text:'↳'});
          callout.createSpan({cls:'atlas-remnote-context-text',text:card.contextBreadcrumb||card.parentPrompt});
        }
        const qEl=body.createDiv({cls:'atlas-remnote-front'});
        await MarkdownRenderer.render(this.app,card.question,qEl,this.file.path,this.studyComponent);
        
        body.createSpan({cls:'atlas-remnote-arrow',text:card.cardType==='two-way'?'⇄':'→'});
        
        const aEl=body.createDiv({cls:'atlas-remnote-back is-occluded'});
        aEl.setAttribute('role','button');
        aEl.setAttribute('tabindex','0');
        aEl.setAttribute('title','Clique para revelar / ocultar resposta');
        const occludedBadge=aEl.createSpan({cls:'atlas-remnote-occluded-badge',text:'[...] Ocultado · Clique para ver'});
        const answerWrap=aEl.createDiv({cls:'atlas-remnote-answer-text'});
        answerWrap.hidden=true;
        await MarkdownRenderer.render(this.app,card.answer,answerWrap,this.file.path,this.studyComponent);
        const toggleAnswer=()=>{
          const isRevealed=!answerWrap.hidden;
          answerWrap.hidden=isRevealed;
          occludedBadge.hidden=!isRevealed;
          aEl.classList.toggle('is-occluded',isRevealed);
          aEl.classList.toggle('is-revealed',!isRevealed);
        };
        aEl.onclick=e=>{if(e.target.closest('a,button'))return;toggleAnswer()};
        aEl.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleAnswer()}};

        const actionsEl=item.createDiv({cls:'atlas-remnote-item-actions'});
        const editBtn=this.app.uiButton(actionsEl,'Editar','pencil',async()=>{
          if(card.cardType==='cloze'){
            const {openClozeEditModal}=await import('./cloze-modal.js');
            const raw=card.raw||(`{{${card.answer}${card.label?'::'+card.label:''}${card.hint?'::'+card.hint:''}}}`);
            openClozeEditModal(this.app,{
              raw,
              cId:card.cId||'',
              answer:card.answer,
              label:card.label||'',
              hint:card.hint||'',
              notePath:this.file.path,
              onApply:async(newMarkup,newAns)=>{
                if(textarea.value.includes(raw)){
                  textarea.value=textarea.value.replace(raw,newMarkup);
                  await flushSave();
                }else if(this.input.value.includes(raw)){
                  this.input.value=this.input.value.replace(raw,newMarkup);
                  this.queueSave();
                }
                new Notice('Cloze atualizado!');
                await renderPreview();
              },
              onRemove:async plainText=>{
                if(textarea.value.includes(raw)){
                  textarea.value=textarea.value.replace(raw,plainText);
                  await flushSave();
                }else if(this.input.value.includes(raw)){
                  this.input.value=this.input.value.replace(raw,plainText);
                  this.queueSave();
                }
                new Notice('Cloze removido!');
                await renderPreview();
              }
            });
          }else{
            setMode('markdown');
            const idx=textarea.value.indexOf(card.question);
            if(idx>=0){textarea.focus();textarea.setSelectionRange(idx,idx+card.question.length);}
          }
        });
        editBtn.title='Editar flashcard / cloze';
        const delBtn=this.app.uiButton(actionsEl,'Remover','trash-2',async()=>{
          if(card.cardType==='cloze'){
            const raw=card.raw||(`{{${card.answer}${card.label?'::'+card.label:''}${card.hint?'::'+card.hint:''}}}`);
            if(textarea.value.includes(raw)){
              textarea.value=textarea.value.replace(raw,card.answer);
              await flushSave();
            }else if(this.input.value.includes(raw)){
              this.input.value=this.input.value.replace(raw,card.answer);
              this.queueSave();
            }
            new Notice('Cloze removido da nota!');
            await renderPreview();
          }else{
            const lines=textarea.value.split('\n');
            const filtered=lines.filter(l=>!l.includes(card.question)||!l.includes(card.answer));
            textarea.value=filtered.join('\n');
            await flushSave();
            new Notice('Flashcard removido!');
            await renderPreview();
          }
        });
        delBtn.title='Remover flashcard / cloze';
      }
    };

    const setMode=mode=>{
      const isMd=mode==='markdown';
      editorWrap.hidden=!isMd;
      previewWrap.hidden=isMd;
      mdBtn.setAttribute('aria-pressed',String(isMd));
      prevBtn.setAttribute('aria-pressed',String(!isMd));
      if(!isMd)renderPreview();
    };
    setMode('markdown');

    const visualManaged=managed.filter(block=>!block.includes('image-atlas-fsrs-deck:')&&!block.includes('image-atlas-flashcards:start')).join('\n\n').replace(/<!--[^]*?-->/g,'').replace(/^Imagem, marcações, mapas e flashcards são carregados[^\n]*$/gm,'').trim();
    if(visualManaged){
      const mapDetails=this.studyPanel.createEl('details',{cls:'atlas-visual-map-details'});
      mapDetails.createEl('summary',{text:'Mapa mental e anotações visuais deste quadro'});
      const mapBody=mapDetails.createDiv({cls:'markdown-preview'});
      await MarkdownRenderer.render(this.app,visualManaged,mapBody,this.file.path,this.studyComponent);
    }
  }
  async preview(){return this.setEditorMode(this.editorMode==='preview'?'formatted':'preview')}
  async onClose(){await this.save();this.studyWikiLinks?.dispose();this.noteFind?.dispose();this.notePage?.dispose();this.previewImageUndoDispose?.();this.outline?.dispose();this.images?.dispose();this.media?.dispose();this.slash?.dispose();this.documentDispose?.();this.wiki.dispose();this.formatted?.destroy();this.previewComponent?.unload();this.studyComponent?.unload()}
}
