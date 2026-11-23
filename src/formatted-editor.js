import {Editor} from '@tiptap/core';
import {EditorState} from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import {Markdown} from '@tiptap/markdown';
import Link from '@tiptap/extension-link';
import {noteImage,relativeImage} from './note-image.js';
import {EmbeddedMindMap} from './embedded-mindmap.js';
import {TaskList,TaskItem} from '@tiptap/extension-list';
import {TableKit} from '@tiptap/extension-table';
import {noteLinkLabel} from './note-link-label.js';

import {splitNoteContent,mergeNoteContent,summaryText} from './note-content.js';
import {SelectionToolbar,TextPaint} from './selection-toolbar.js';
import {captureReadingPosition,restoreReadingPosition} from './editor-location.js';
import {Notice} from './compat.js';
import {parseWikipediaUrl,fetchWikipediaArticle} from './wikipedia.js';
export async function removeRenderedImage(owner,index,refresh){
 const position=captureReadingPosition(owner);owner.formatted||=new FormattedEditor(owner,owner.richHost);owner.formatted.load(owner.input.value);const editor=owner.formatted.editor,images=[];editor.state.doc.descendants((node,pos)=>{if(node.type.name==='image')images.push({pos,size:node.nodeSize})});const image=images[index];if(!image)throw Error('A imagem mudou. Abra a edição para conferir.');editor.commands.deleteRange({from:image.pos,to:image.pos+image.size});await owner.save();await refresh();owner.outline?.refresh();restoreReadingPosition(owner,position);owner.rendered.tabIndex=-1;owner.rendered.focus({preventScroll:true});
 if(!owner.previewImageUndoDispose){const key=event=>{if(owner.editorMode!=='preview'||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='z'||event.target.closest('input,textarea')||owner.previewImageUndoBusy)return;const action=event.shiftKey?'redo':'undo';if(!editor.can()[action]())return;event.preventDefault();event.stopPropagation();owner.previewImageUndoBusy=true;const position=captureReadingPosition(owner);editor.commands[action]();Promise.resolve().then(()=>owner.save()).then(refresh).then(()=>{owner.outline?.refresh();restoreReadingPosition(owner,position)}).catch(error=>new Notice(error.message)).finally(()=>{owner.previewImageUndoBusy=false})};owner.contentEl.addEventListener('keydown',key,true);owner.previewImageUndoDispose=()=>owner.contentEl.removeEventListener('keydown',key,true)}
}
export const editableDocument=splitNoteContent;
export const readableDocument=summaryText;
const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
// Link attributes must belong to the document renderer: selection/blur can
// recreate anchor elements without a content update or decoration frame.
const NoteLink=Link.extend({renderHTML(props){
 const spec=this.parent(props),attrs=spec[1];
 const href=attrs?.href||'';
 if(href.startsWith('atlas-cloze:')){
  let data={};
  try{data=JSON.parse(decodeURIComponent(href.slice(12)))}catch{}
  const hasTag=Boolean(data.label||data.hint);
  const tag=data.label||data.hint||'';
  attrs.class=[attrs.class,'romus-cloze-editor-pill'].filter(Boolean).join(' ');
  attrs['data-cloze']='true';
  attrs['data-has-tag']=hasTag?'true':'false';
  attrs['data-cloze-tag']=tag;
  attrs['data-cloze-id']=data.cId||'';
  attrs['data-cloze-label']=data.label||'';
  attrs['data-cloze-hint']=data.hint||'';
  attrs.title=hasTag?`Cloze · ${tag} (Clique para editar)`:'Cloze (Clique para editar)';
 }else{
  const wiki=parseWikipediaUrl(href);
  if(href.startsWith('atlas-note:')||wiki){
   attrs.class=[attrs.class,'internal-link'].filter(Boolean).join(' ');
   try{attrs['data-href']=wiki?wiki.title:decodeURIComponent(href.slice(11))}
   catch{attrs['data-href']=wiki?wiki.title:attrs.href.slice(11)}
  }
 }
 return spec;
}});
export function mindmapCodeBlock(owner){
 return CodeBlock.extend({
  addNodeView(){
   return ({node,editor,getPos})=>{
    if(node.attrs.language==='mindmap'){
     const wrapper=document.createElement('div');
     wrapper.className='romus-mindmap-block-wrapper';
     wrapper.contentEditable='false';
     let mindmap=null;
     wrapper.onpointerdown=(e)=>{
      if(!e.target.closest('input, textarea')){
       mindmap?.container?.focus({preventScroll:true});
      }
     };
     let currentText=node.textContent;
     const updateNodeText=(newJson)=>{
      currentText=newJson;
      const pos=getPos();
      if(typeof pos==='number'&&!editor.isDestroyed){
       const currentNode=editor.state.doc.nodeAt(pos);
       if(currentNode&&currentNode.type.name==='codeBlock'){
        const content=newJson?editor.schema.text(newJson):[];
        const tr=editor.state.tr.replaceWith(pos+1,pos+currentNode.nodeSize-1,content);
        editor.view.dispatch(tr);
        owner.dirty=true;
        owner.owner.status.textContent='Salvando…';
        owner.flushToOwner();
       }
      }
     };
     const removeBlock=()=>{
      const pos=getPos();
      if(typeof pos==='number'&&!editor.isDestroyed){
       const currentNode=editor.state.doc.nodeAt(pos);
       if(currentNode){
        const tr=editor.state.tr.delete(pos,pos+currentNode.nodeSize);
        editor.view.dispatch(tr);
        owner.dirty=true;
        owner.owner.status.textContent='Salvando…';
        owner.flushToOwner();
       }
      }
     };
     mindmap=new EmbeddedMindMap(wrapper,{
      data:currentText,
      app:owner.app,
      onChange:newJson=>updateNodeText(newJson),
      onRemove:()=>removeBlock()
     });
     return{
      dom:wrapper,
      stopEvent:()=>true,
      ignoreMutation:()=>true,
      update(next){
       if(next.type.name!=='codeBlock'||next.attrs.language!=='mindmap')return false;
       if(mindmap&&next.textContent!==currentText){
        currentText=next.textContent;
        mindmap.load(currentText);
       }
       return true;
      },
      destroy(){mindmap?.destroy()}
     };
    }
    const pre=document.createElement('pre'),code=document.createElement('code');
    if(node.attrs.language)code.className=`language-${node.attrs.language}`;
    pre.appendChild(code);
    return{dom:pre,contentDOM:code};
   };
  }
 });
}
export class FormattedEditor{
 constructor(owner,host){
  this.owner=owner;this.app=owner.app;this.host=host;this.managed=[];
  this.editor=new Editor({element:host,extensions:[StarterKit.configure({link:false,codeBlock:false}),mindmapCodeBlock(owner),NoteLink.configure({openOnClick:false,protocols:['atlas-note','atlas-cloze']}),Markdown,noteImage(owner),TaskList,TaskItem.configure({nested:true}),TableKit,TextPaint],content:'',contentType:'markdown',
   editorProps:{attributes:{'aria-label':'Texto formatado da nota',role:'textbox','aria-multiline':'true',spellcheck:'true'},handleKeyDown:(_,event)=>this.onKey(event)},
   onUpdate:()=>{if(this.loading||this.completeWikiLink())return;this.dirty=true;owner.status.textContent='Salvando…';clearTimeout(this.serializeTimer);this.serializeTimer=setTimeout(()=>this.flushToOwner(),280);this.scheduleLinks();this.updateSuggestions();owner.slash?.update();this.bubble?.schedule()},onSelectionUpdate:()=>{this.updateSuggestions();owner.slash?.update();this.bubble?.schedule()},onFocus:()=>this.bubble?.schedule(),onBlur:()=>requestAnimationFrame(()=>{if(!this.editor.isDestroyed)this.bubble?.schedule()})});
  this.bubble=new SelectionToolbar(this);
  host.addEventListener('click',this.click=async event=>{
   const clozeLink=event.target.closest('a[href^="atlas-cloze:"]');
   if(clozeLink){
    if(event.ctrlKey||event.metaKey){
     const answer=clozeLink.textContent.trim();
     const file=this.app.metadataCache.getFirstLinkpathDest(answer,owner.file?.path);
     if(file){
      event.preventDefault();
      this.app.openNoteLink(file.path,owner.file?.path,event);
      return;
     }
    }
    event.preventDefault();
    event.stopPropagation();
    let data={};
    try{data=JSON.parse(decodeURIComponent(clozeLink.getAttribute('href').slice(12)))}catch{}
    const answer=clozeLink.textContent.trim();
    const raw=data.raw||`{{${answer}${data.label?'::'+data.label:''}${data.hint?'::'+data.hint:''}}}`;
    const {openClozeEditModal}=await import('./cloze-modal.js');
    openClozeEditModal(this.app,{
     raw,
     cId:data.cId||'',
     answer,
     label:data.label||'',
     hint:data.hint||'',
     notePath:owner.file?.path,
     onApply:(newMarkup,newAnswer)=>{
      const pos=this.editor.view.posAtDOM(clozeLink,0);
      const from=pos,to=pos+clozeLink.textContent.length;
      const inner=newMarkup.slice(2,-2).trim();
      const parts=inner.split('::');
      let newCId='',newAns=inner,newLabel='',newHint='';
      if(parts.length>1){
       if(/^c\d+$/i.test(parts[0].trim())){
        newCId=parts[0].trim();newAns=parts[1].trim();
        if(parts.length>=4){newLabel=parts[2].trim();newHint=parts.slice(3).join('::').trim()}
        else{newHint=parts.slice(2).join('::').trim()}
       }else{
        newAns=parts[0].trim();
        if(parts.length>=3){newLabel=parts[1].trim();newHint=parts.slice(2).join('::').trim()}
        else{newHint=parts.slice(1).join('::').trim()}
       }
      }
      const encoded=encodeURIComponent(JSON.stringify({raw:newMarkup,cId:newCId,answer:newAns,label:newLabel,hint:newHint}));
      const href='atlas-cloze:'+encoded;
      this.editor.chain().focus().insertContentAt({from,to},{type:'text',text:newAns,marks:[{type:'link',attrs:{href}}]}).run();
      this.dirty=true;
      owner.status.textContent='Salvando…';
      this.flushToOwner();
      this.scheduleLinks();
     },
     onRemove:plainText=>{
      const pos=this.editor.view.posAtDOM(clozeLink,0);
      const from=pos,to=pos+clozeLink.textContent.length;
      this.editor.chain().focus().insertContentAt({from,to},{type:'text',text:plainText}).run();
      this.dirty=true;
      owner.status.textContent='Salvando…';
      this.flushToOwner();
     }
    });
    return;
   }
   const link=event.target.closest('a');
   if(!link)return;
   const href=link.getAttribute('href');
   if(!href)return;
   if(href.startsWith('atlas-note:')){
    event.preventDefault();
    const target=decodeURIComponent(href.slice(11));
    this.app.openNoteLink(target,owner.file.path,event);
    return;
   }
   const wiki=parseWikipediaUrl(href);
   if(wiki){
    event.preventDefault();
    const leaf=await this.app.openNoteLink(wiki.title,owner.file.path,event);
    if(leaf?.view?.notePage&&!leaf.view.notePage.data?.wikipedia){
     fetchWikipediaArticle(wiki.title,wiki.lang,wiki.url).then(art=>leaf.view.notePage.setWikipedia(art)).catch(()=>{});
    }
    return;
   }
   if(/^https?:\/\//i.test(href)){
    event.preventDefault();
    window.atlasNative?.call('external',href);
   }
  });
 }
 load(body){
  if(this.loadedBody===body&&!this.dirty)return false;
  this.loadedBody=body;this.loadCount=(this.loadCount||0)+1;
  clearTimeout(this.serializeTimer);this.dirty=false;
  this.closeSuggestions();this.loading=true;const {text,managed}=this.owner.plainDocument?{text:body,managed:[]}:editableDocument(body);this.managed=managed;
  const markdown=text.replace(/!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(\s+"(?:\\.|[^"])*")?\)/g,(raw,alt,angle,path,title)=>{const file=this.app.metadataCache.getFirstLinkpathDest(angle||path,this.owner.file.path);return file?`![${alt}](${this.app.vault.getResourcePath(file)}${title||''})`:raw}).replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,target,size)=>{const file=this.app.metadataCache.getFirstLinkpathDest(target,this.owner.file.path);const width=size&&/^\d+/.test(size.trim())?size.trim().match(/^\d+/)[0]:'';const alt=width||(size?size.trim():'');return file?`![${alt}](${this.app.vault.getResourcePath(file)})`:_}).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,label)=>`[${noteLinkLabel(target,label).replace(/[\[\]]/g,'')}](atlas-note:${encodeURIComponent(target)})`).replace(/\{\{((?:[^{}]|(?<=\\)[{}])+)\}\}/g,(raw,inner)=>{const parts=inner.split('::');let cId='',answer=inner,label='',hint='';if(parts.length>1){if(/^c\d+$/i.test(parts[0].trim())){cId=parts[0].trim();answer=parts[1].trim();if(parts.length>=4){label=parts[2].trim();hint=parts.slice(3).join('::').trim()}else{hint=parts.slice(2).join('::').trim()}}else{answer=parts[0].trim();if(parts.length>=3){label=parts[1].trim();hint=parts.slice(2).join('::').trim()}else{hint=parts.slice(1).join('::').trim()}}}const encoded=encodeURIComponent(JSON.stringify({raw,cId,answer,label,hint}));return `[${answer}](atlas-cloze:${encoded})`});
  try{this.editor.chain().setMeta('addToHistory',false).setContent(markdown,{contentType:'markdown',emitUpdate:false}).run();this.resetHistory();this.decorateLinks()}finally{this.loading=false}
 }
 resetHistory(){const state=this.editor.state;this.editor.view.updateState(EditorState.create({schema:state.schema,doc:state.doc,selection:state.selection,plugins:state.plugins}))}
 serialize(){
  let text=this.editor.getMarkdown().replace(/\[([^\]]+)\]\(atlas-note:([^\s)]+)\)/g,(_,label,path)=>{const target=decodeURIComponent(path),base=noteLinkLabel(target);return`[[${target}${label===base?'':'|'+label}]]`});
  text=text.replace(/!\[([^\]]*)\]\(atlas-data:\/\/library\/([^\s)]+)(\s+"(?:\\.|[^"])*")?\)/g,(_,alt,path,title)=>{const decoded=decodeURIComponent(path);const width=alt&&/^\d+/.test(alt.trim())?alt.trim().match(/^\d+/)[0]:'';const sizePart=width?`|${width}`:(alt&&!/^\s*$/.test(alt)?`|${alt}`:'');return title?`![${alt}](<${relativeImage(this.owner.file.path,decoded)}>${title})`:`![[${decoded}${sizePart}]]`;});
   text=text.replace(/\[([^\]]+)\]\(atlas-cloze:([^\s)]+)\)/g,(_,val,encoded)=>{let data={};try{data=JSON.parse(decodeURIComponent(encoded))}catch{}if(data.cId){if(data.label&&data.hint)return `{{${data.cId}::${val}::${data.label}::${data.hint}}}`;if(data.label)return `{{${data.cId}::${val}::${data.label}}}`;if(data.hint)return `{{${data.cId}::${val}::${data.hint}}}`;return `{{${data.cId}::${val}}}`}else{if(data.label&&data.hint)return `{{${val}::${data.label}::${data.hint}}}`;if(data.label)return `{{${val}::${data.label}}}`;if(data.hint)return `{{${val}::${data.hint}}}`;return `{{${val}}}`}});
  return this.owner.plainDocument?text:mergeNoteContent(text,this.managed);
 }
 flushToOwner(notify=true){clearTimeout(this.serializeTimer);if(!this.dirty||this.editor.isDestroyed)return;this.owner.input.value=this.serialize();this.loadedBody=this.owner.input.value;this.dirty=false;if(notify)this.owner.queueSave()}
 scheduleLinks(){if(!this.linkFrame)this.linkFrame=requestAnimationFrame(()=>{this.linkFrame=null;if(!this.editor.isDestroyed)this.decorateLinks()})}
 decorateLinks(){
  for(const anchor of this.host.querySelectorAll('a[href^="atlas-note:"]:not([data-href])')){anchor.classList.add('internal-link');anchor.dataset.href=decodeURIComponent(anchor.getAttribute('href').slice(11))}
  for(const anchor of this.host.querySelectorAll('a[href^="atlas-cloze:"]')){
   let data={};
   try{data=JSON.parse(decodeURIComponent(anchor.getAttribute('href').slice(12)))}catch{}
   const hasTag=Boolean(data.label||data.hint);
   const tag=data.label||data.hint||'';
   anchor.classList.add('romus-cloze-editor-pill');
   anchor.dataset.cloze='true';
   anchor.dataset.hasTag=hasTag?'true':'false';
   anchor.dataset.clozeTag=tag;
   anchor.dataset.clozeId=data.cId||'';
   anchor.dataset.clozeLabel=data.label||'';
   anchor.dataset.clozeHint=data.hint||'';
   anchor.title=hasTag?`Cloze · ${tag} (Clique para editar)`:'Cloze (Clique para editar)';
  }
 }
 completeWikiLink(){
  const {state}=this.editor,{selection,schema}=state;if(!selection.empty||selection.$from.parent.type.spec.code||selection.$from.marks().some(mark=>mark.type.name==='code'))return false;
  const before=selection.$from.parent.textBetween(0,selection.$from.parentOffset),match=before.match(/(^|[^!])\[\[([^\[\]\n]+)\]\]$/);if(!match)return false;
  const [target,label]=match[2].split('|'),file=this.app.metadataCache.getFirstLinkpathDest(target.trim(),this.owner.file.path);if(file&&file.extension!=='md')return false;
  const raw='[['+match[2]+']]',from=selection.from-raw.length,fragment=target.includes('#')?target.slice(target.indexOf('#')):'',href='atlas-note:'+encodeURIComponent((file?file.path.replace(/\.md$/i,''):target.trim())+fragment),marks=selection.$from.marks().filter(mark=>mark.type!==schema.marks.link);
  this.editor.view.dispatch(state.tr.replaceWith(from,selection.from,schema.text(noteLinkLabel(target.trim(),label),[...marks,schema.marks.link.create({href})])).setStoredMarks(marks));return true;
 }
 closeSuggestions(){this.menu?.remove();this.menu=null;this.match=null}
 updateSuggestions(){
  if(this.loading||!this.editor.isFocused)return;
  const {selection}=this.editor.state;if(!selection.empty)return this.closeSuggestions();
  const before=selection.$from.parent.textBetween(0,selection.$from.parentOffset),found=before.match(/\[\[([^\[\]\n|]*)$/);if(!found)return this.closeSuggestions();
  const query=found[1].trim(),tokens=fold(query).split(/\s+/).filter(Boolean),items=(this.app.getLinkableNotes?.()||this.app.getMainNotes()).filter(file=>tokens.every(token=>fold(file.basename+' '+file.path).includes(token))).sort((a,b)=>a.basename.localeCompare(b.basename)).slice(0,9).map(file=>({file,title:file.basename}));
  if(query&&!items.some(item=>fold(item.title)===fold(query)))items.push({title:query});
  this.closeSuggestions();if(!items.length)return;this.items=items;this.index=0;this.match={from:selection.from-found[0].length,to:selection.from,raw:found[0]};
  const menu=this.menu=document.body.createDiv({cls:'atlas-note-link-menu',attr:{role:'listbox','aria-label':'Vincular nota'}}),point=this.editor.view.coordsAtPos(selection.from);
  Object.assign(menu.style,{position:'fixed',width:Math.min(410,innerWidth-24)+'px',left:Math.max(12,Math.min(point.left,innerWidth-422))+'px',top:Math.max(12,Math.min(point.bottom+6,innerHeight-310))+'px'});
  items.forEach((item,index)=>{const button=menu.createEl('button',{attr:{role:'option','aria-selected':String(index===0)}});button.createEl('strong',{text:item.file?item.title:'Criar nota: '+item.title});if(item.file)button.createEl('small',{text:this.app.displayNoteFolder(item.file)||'Nota'});button.onpointerdown=event=>{event.preventDefault();this.choose(index)}});
 }
 onKey(event){
  if(!this.menu)return false;
  if(event.key==='Escape'){this.closeSuggestions();return true}
  if(['ArrowDown','ArrowUp'].includes(event.key)){this.index=(this.index+(event.key==='ArrowDown'?1:-1)+this.items.length)%this.items.length;[...this.menu.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===this.index)));return true}
  if(event.key==='Enter'||event.key==='Tab'){this.choose(this.index);return true}return false;
 }
 async choose(index){
  const item=this.items[index],match=this.match;this.closeSuggestions();if(!item||!match)return;
  try{let file=item.file;if(!file){const title=item.title.replace(/[\\/:*?"<>|#\[\]\r\n]/g,' ').trim();if(!title)return;const folder=this.app.preferences.notesFolder||'Notas';file=await this.app.vault.create(folder+'/'+title+'.md','# '+title+'\n\n')}
   if(this.editor.isDestroyed||this.editor.state.doc.textBetween(match.from,match.to)!==match.raw)return;
   const end=this.editor.state.doc.textBetween(match.to,Math.min(match.to+2,this.editor.state.doc.content.size))===']]'?match.to+2:match.to;
   this.editor.chain().focus().insertContentAt({from:match.from,to:end},{type:'text',text:file.basename,marks:[{type:'link',attrs:{href:'atlas-note:'+encodeURIComponent(file.path.replace(/\.md$/i,''))}}]}).command(({tr,state})=>{tr.removeStoredMark(state.schema.marks.link);return true}).run();this.decorateLinks();
  }catch(error){this.owner.status.textContent=error.message}
 }
 destroy(){clearTimeout(this.serializeTimer);cancelAnimationFrame(this.linkFrame);this.bubble.destroy();this.closeSuggestions();this.host.removeEventListener('click',this.click);this.editor.destroy()}
}
