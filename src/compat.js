import {wireImageResize} from './image-actions.js';
import {parse as parseYaml,stringify as stringifyYaml} from 'yaml';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {icons,createElement} from 'lucide';
import {createColorControl} from './color-palette.js';
import {wireImageActions} from './image-actions.js';
import {noteLinkLabel} from './note-link-label.js';
import {MEDIA_MARKER} from './note-media-format.js';
import {normalizeHighlight} from './highlight-color.js';
import {parseWikipediaUrl} from './wikipedia.js';
export {parseYaml, marked, DOMPurify};
export const Platform={isMobile:false,isDesktopApp:true};
export const normalizePath=value=>{const parts=[];for(const p of String(value).replaceAll('\\','/').split('/')){if(!p||p==='.')continue;if(p==='..')parts.pop();else parts.push(p)}return parts.join('/')};
export function installDOM(){
 const p=Element.prototype;
 p.empty=function(){this.replaceChildren()};p.addClass=function(...c){this.classList.add(...c)};p.removeClass=function(...c){this.classList.remove(...c)};p.toggleClass=function(c,v){this.classList.toggle(c,v)};
 p.createEl=function(tag,options={}){if(typeof options==='string')options={cls:options};if(tag==='input'&&(options.type==='color'||options.attr?.type==='color'))return createColorControl(this,options);const el=document.createElement(tag);if(options.cls)el.className=Array.isArray(options.cls)?options.cls.join(' '):options.cls;if(options.text!==undefined)el.textContent=options.text;for(const key of ['type','value','placeholder','title'])if(options[key]!==undefined)el[key]=options[key];for(const [key,value]of Object.entries(options.attr||{}))el.setAttribute(key,String(value));this.append(el);return el};
 p.createDiv=function(options){return this.createEl('div',options)};p.createSpan=function(options){return this.createEl('span',options)};p.setText=function(text){this.textContent=text};
}
export function setIcon(el,name){
 if(name==='wikipedia'){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('fill','currentColor');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M14.7 3.5h5.8v.5c-.8.1-1.2.4-1.6 1.4L13.8 18h-.9l-3.3-8.6-2.9 8.6h-.9L1.3 5.4c-.4-1-.8-1.3-1.6-1.4v-.5h4.6v.5c-.8.1-1.1.4-1.1 1.1 0 .4.2 1 .5 1.9l2.4 6.7 2.4-7.1c.3-.8.4-1.3.4-1.6 0-.7-.4-1-1.2-1v-.5h4.2v.5c-.7.1-1 .4-1 1 0 .3.1.8.4 1.7l2.4 6.8 2.2-6.5c.3-1 .5-1.7.5-2 0-.6-.3-.9-1.1-1v-.5z');
  svg.appendChild(path);el.replaceChildren(svg);return;
 }
 const key=name.split('-').map(s=>s[0]?.toUpperCase()+s.slice(1)).join('');const data=icons[key];if(data)el.replaceChildren(createElement(data,{width:16,height:16,'aria-hidden':'true'}));else el.textContent='◇';
}
export class Notice{constructor(message){if(typeof document==='undefined')return;const host=document.getElementById('notices');if(!host)return;const item=host.createDiv({cls:'notice',text:String(message)});setTimeout(()=>item.remove(),6500)}}
export class Component{
 constructor(){this.disposers=[];this.children=new Set()}
 register(fn){this.disposers.push(fn);return fn}registerEvent(dispose){if(typeof dispose==='function')this.register(dispose)}
 registerDomEvent(target,type,callback,options){target.addEventListener(type,callback,options);this.register(()=>target.removeEventListener(type,callback,options))}
 registerInterval(id){this.register(()=>clearInterval(id));return id}
 addChild(child){this.children.add(child);child.load();return child}removeChild(child){child.unload();this.children.delete(child)}
 load(){if(this.loaded)return;this.loaded=true;return this.onload?.()}
 unload(){for(const child of this.children)child.unload();this.children.clear();for(const dispose of this.disposers.splice(0).reverse())try{dispose()}catch(e){console.error(e)}this.onunload?.();this.loaded=false}
}
const modalStack=[];
class Scope{constructor(){this.bindings=[]}register(modifiers,key,callback){this.bindings.push({modifiers,key,callback});return callback}}
if(typeof document!=='undefined'){
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented)return;
 const modal=modalStack.at(-1);if(!modal)return;
 const binding=modal.scope.bindings.find(b=>b.key.toLowerCase()===event.key.toLowerCase()&&b.modifiers.includes('Mod')===(event.ctrlKey||event.metaKey)&&b.modifiers.includes('Shift')===event.shiftKey&&b.modifiers.includes('Alt')===event.altKey);
 if(binding&&binding.callback(event)===false){event.preventDefault();event.stopImmediatePropagation();return}
 if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();modal.close()}
});
}
export class Modal{
 constructor(app){this.app=app;this.scope=new Scope();this.containerEl=document.createElement('div');this.containerEl.className='modal-container';this.containerEl.createDiv({cls:'modal-bg'}).onclick=()=>this.close();this.modalEl=this.containerEl.createDiv({cls:'modal'});this.titleEl=this.modalEl.createDiv({cls:'modal-title'});const close=this.modalEl.createEl('button',{cls:'modal-close-button',text:'×',attr:{'aria-label':'Fechar'}});close.onclick=()=>this.close();this.contentEl=this.modalEl.createDiv({cls:'modal-content'})}
 setTitle(text){this.titleEl.textContent=text}open(){this.beforeFocus=document.activeElement;modalStack.push(this);document.body.append(this.containerEl);Promise.resolve(this.onOpen?.()).catch(e=>{console.error(e);new Notice(e.message)});return this}
 mountIn(host){const i=modalStack.indexOf(this);if(i>=0)modalStack.splice(i,1);this.docked=true;this.containerEl.querySelector('.modal-bg')?.remove();this.containerEl.classList.add('atlas-docked-modal');host.append(this.containerEl);return this}
 close(){const i=modalStack.indexOf(this);if(i<0&&!this.docked)return;if(i>=0)modalStack.splice(i,1);this.docked=false;try{Promise.resolve(this.onClose?.()).catch(console.error)}finally{this.containerEl.remove();if(this.beforeFocus?.isConnected)this.beforeFocus.focus({preventScroll:true});window.dispatchEvent(new Event('atlas:modal-closed'))}}
}
export class SuggestModal extends Modal{
 setPlaceholder(text){this.placeholder=text}
 onOpen(){this.inputEl=this.contentEl.createEl('input',{attr:{placeholder:this.placeholder||'Buscar…','aria-label':this.placeholder||'Buscar'}});this.inputEl.className='suggest-input';this.results=this.contentEl.createDiv({cls:'suggest-results'});this.inputEl.oninput=()=>this.update();this.inputEl.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();this.results.querySelector('button')?.click()}};this.update();this.inputEl.focus()}
 update(){this.results.empty();for(const value of this.getSuggestions(this.inputEl.value)){const item=this.results.createEl('button',{cls:'suggest-item'});this.renderSuggestion(value,item);item.onclick=()=>{this.close();this.onChooseSuggestion(value)}}}
}
export class Menu{
 constructor(){this.el=document.createElement('div');this.el.className='context-menu'}
 addItem(fn){const button=this.el.createEl('button');const item={setTitle:text=>{button.textContent=text;return item},setIcon:()=>item,setDisabled:value=>{button.disabled=value;return item},setChecked:value=>{button.setAttribute('aria-checked',value);return item},onClick:callback=>{button.onclick=()=>{this.el.remove();callback()};return item}};fn(item);return this}
 addSeparator(){this.el.createEl('hr');return this}showAtMouseEvent(event){this.showAtPosition({x:event.clientX,y:event.clientY})}
 showAtPosition({x,y}){document.body.append(this.el);this.el.style.left=Math.min(x,innerWidth-280)+'px';this.el.style.top=Math.min(y,innerHeight-this.el.offsetHeight-10)+'px';setTimeout(()=>document.addEventListener('pointerdown',event=>{if(!this.el.contains(event.target))this.el.remove()},{once:true}),0)}
}
export class ItemView extends Component{
 constructor(leaf){super();this.leaf=leaf;this.app=leaf.app;this.containerEl=leaf.containerEl;this.contentEl=this.containerEl.createDiv({cls:'view-content'});this.scope=new Scope()}
 async setState(){}getState(){return{}}getViewType(){return'view'}
}
export class TextFileView extends ItemView{
 requestSave(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.save().catch(e=>new Notice('Falha ao salvar: '+e.message)),180)}
 async save(){clearTimeout(this.saveTimer);if(this.file&&this.getViewData)await this.app.vault.modify(this.file,this.getViewData())}
 async onClose(){await this.save()}
}
export class Plugin extends Component{
 constructor(app){super();this.app=app}
 loadData(){return window.atlasNative.call('settings:read')}saveData(data){return window.atlasNative.call('settings:write',data)}
 registerView(type,factory){this.app.factories.set(type,factory)}registerExtensions(extensions,type){for(const ext of extensions)this.app.extensions.set(ext,type)}
 registerHoverLinkSource(){}addRibbonIcon(icon,title,run){this.app.ribbon?.(icon,title,run)}addCommand(command){this.app.commands.push(command)}
}
marked.use({extensions:[{name:'wikilink',level:'inline',start:src=>src.search(/!?\[\[/),tokenizer(src){const m=/^(!?)\[\[([^\]\n]+)\]\]/.exec(src);if(m)return{type:'wikilink',raw:m[0],target:m[2],embed:!!m[1]}},renderer(token){const [target,label]=token.target.split('|');const safe=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const width=label&&/^\d+$/.test(label.trim())?parseInt(label.trim(),10):null;const styleAttr=width?` style="width:${width}px;max-width:100%"`:'';const widthAttr=width?` data-width="${width}"`:'';return token.embed?`<img data-atlas-resource="${safe(target)}" alt="${safe(label||target)}"${widthAttr}${styleAttr}>`:`<a class="internal-link" data-href="${safe(target)}" href="#">${safe(noteLinkLabel(target,label))}</a>`}},{name:'cloze',level:'inline',start:src=>src.search(/\{\{/),tokenizer(src){const m=/^\{\{((?:[^{}]|(?<=\\)[{}])+)\}\}/.exec(src);if(!m)return;const raw=m[0],inner=m[1].trim(),parts=inner.split('::');let cId='',answer=inner,label='',hint='';if(parts.length>1){if(/^c\d+$/i.test(parts[0].trim())){cId=parts[0].trim();answer=parts[1].trim();if(parts.length>=4){label=parts[2].trim();hint=parts.slice(3).join('::').trim()}else{hint=parts.slice(2).join('::').trim()}}else{answer=parts[0].trim();if(parts.length>=3){label=parts[1].trim();hint=parts.slice(2).join('::').trim()}else{hint=parts.slice(1).join('::').trim()}}}return{type:'cloze',raw,cId,answer,label,hint}},renderer(token){const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const hasTag=Boolean(token.label||token.hint);const tagLabel=token.label?safe(token.label):(token.hint?safe(token.hint):'');const topTag=hasTag?('<span class="romus-cloze-top-tag" role="button" tabindex="0" title="Cloze flashcard · Clique para editar" aria-label="Editar cloze '+safe(tagLabel)+'"><span class="romus-cloze-icon" aria-hidden="true">🎴</span><span class="romus-cloze-badge">'+safe(tagLabel)+'</span><span class="romus-cloze-edit-icon" aria-hidden="true">✏️</span></span>'):'';return '<span class="romus-cloze-pill" data-cloze="true" data-has-tag="'+(hasTag?'true':'false')+'" data-cloze-raw="'+safe(token.raw)+'" data-cloze-answer="'+safe(token.answer)+'" data-cloze-label="'+safe(token.label)+'" data-cloze-hint="'+safe(token.hint)+'" data-cloze-id="'+safe(token.cId)+'" tabindex="0">'+topTag+'<span class="romus-cloze-body" role="button" tabindex="0" title="Clique para editar este cloze">'+safe(token.answer)+'</span>'+'</span>';}}]});
export const MarkdownRenderer={async render(app,text,el,source,component,options={}){
 const clean=String(text).replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
 el.innerHTML=DOMPurify.sanitize(marked.parse(clean),{ADD_ATTR:['data-href','data-atlas-resource','style','data-atlas-highlight','data-atlas-original-color','data-cloze','data-cloze-raw','data-cloze-answer','data-cloze-label','data-cloze-hint','data-cloze-id','data-has-tag','data-width','role','tabindex','title','aria-label','aria-hidden'],FORBID_TAGS:['iframe','form','input','script','style']});
 for(const span of el.querySelectorAll('[style],mark')){const color=span.style.color,background=span.style.backgroundColor;span.removeAttribute('style');if(span.tagName==='SPAN'||span.tagName==='MARK'){if(color&&CSS.supports('color',color))span.style.color=color;if(background&&CSS.supports('background-color',background))span.style.backgroundColor=background;normalizeHighlight(span)}}
 const clozePills=el.querySelectorAll('.romus-cloze-pill');
 clozePills.forEach((p,idx)=>{p.dataset.clozeDocIndex=String(idx);});
 let imageIndex=0;for(const img of el.querySelectorAll('img')){const index=imageIndex++;const link=img.dataset.atlasResource||img.getAttribute('src');if(img.title===MEDIA_MARKER&&app.noteMedia){const figure=document.createElement('figure');img.replaceWith(figure);try{component?.register(app.noteMedia.mount(figure,link,{notePath:source,onRemove:options.onRemoveImage?()=>options.onRemoveImage(index):undefined}))}catch(error){figure.textContent=error.message}continue}if(link&&!/^https?:|^data:image\/|^atlas-data:\/\/library\//i.test(link)){const file=app.metadataCache.getFirstLinkpathDest(link,source);if(file)img.src=app.vault.getResourcePath(file);else img.removeAttribute('src')}const caption=document.createElement('figcaption'),figure=document.createElement('figure');figure.className='atlas-note-image';img.replaceWith(figure);figure.append(img,caption);const paint=()=>{caption.textContent=app.images?.forSource(img.src)?.caption||img.title||'';caption.hidden=!caption.textContent};paint();const off=app.vault.on('image-caption-changed',paint);component?.register(off);const w=img.getAttribute('data-width')||(img.style.width?parseInt(img.style.width,10):null);if(w){img.style.width=w+'px';figure.style.width=w+'px';}const actions=wireImageActions(app,figure,img,{notePath:source,caption:()=>img.title||'',onRemove:options.onRemoveImage?()=>options.onRemoveImage(index):undefined});component?.register(actions);const resizer=wireImageResize(figure,img,async newWidth=>{if(source){const file=app.vault?.getAbstractFileByPath?.(source)||(app.vault?.getFiles?.()||[]).find(f=>f.path===source);if(file){const text=await app.vault.read(file);const target=img.dataset.atlasResource||img.getAttribute('src');if(target){const clean=target.replace(/^atlas-data:\/\/library\//,'');const candidates=[clean,decodeURIComponent(clean),clean.split('/').pop()].filter(Boolean);let updated=text;for(const cand of candidates){const esc=cand.replace(/[.*+?^${}()|[\]\\]/g,ch=>'\\'+ch);const regexWiki=new RegExp(`!\\[\\[(${esc})(?:\\|[^\\]]*)?\\]\\]`,'g');if(regexWiki.test(updated)){updated=updated.replace(regexWiki,`![[$1|${newWidth}]]`);break;}const regexMd=new RegExp(`!\\[[^\\]]*\\]\\(<(${esc})>(\\s+\"[^\"]*\")?\\)|!\\[[^\\]]*\\]\\((${esc})(\\s+\"[^\"]*\")?\\)`,'g');if(regexMd.test(updated)){updated=updated.replace(regexMd,(m,a,b,c)=>a?`![${newWidth}](<${a}>${b||''})`:`![${newWidth}](${c}${b||''})`);break;}}if(updated!==text){await app.vault.modify(file,updated);const leaf=app.workspace?.getLeavesOfType?.('markdown')?.find(l=>l.view?.file?.path===source)||app.workspace?.activeLeaf;if(leaf?.view?.file?.path===source){const bodyOnly=updated.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/^(?:---\r?\n)+/,'');leaf.view.input.value=bodyOnly;if(leaf.view.originalBody)leaf.view.originalBody=bodyOnly;if(leaf.view.formatted)leaf.view.formatted.load(bodyOnly);}}}}}});component?.register(resizer);}
 for(const a of el.querySelectorAll('a:not(.internal-link)')){const href=a.getAttribute('href')||'',wiki=parseWikipediaUrl(href);if(wiki){a.classList.add('internal-link');a.dataset.href=wiki.title}else if(href.startsWith('atlas-note:')){a.classList.add('internal-link');try{a.dataset.href=decodeURIComponent(href.slice(11))}catch{a.dataset.href=href.slice(11)}}else if(href&&!/^[a-z]+:|^#/i.test(href)&&app.metadataCache.getFirstLinkpathDest(href,source)){a.classList.add('internal-link');a.dataset.href=href}}
 for(const codeEl of el.querySelectorAll('code.language-mindmap, code[class*="language-mindmap"]')){
  const pre=codeEl.closest('pre');
  if(!pre)continue;
  let rawText=codeEl.textContent;
  const container=document.createElement('div');
  container.className='romus-mindmap-block-wrapper';
  pre.replaceWith(container);
  import('./embedded-mindmap.js').then(({EmbeddedMindMap})=>{
   const mindmap=new EmbeddedMindMap(container,{
    data:rawText,
    app,
    onRemove:async ()=>{
     if(source){
      const file=app.vault?.getAbstractFileByPath?.(source)||(app.vault?.getFiles?.()||[]).find(f=>f.path===source);
      if(file){
       const content=await app.vault.read(file);
       let updated=content;
       const oldFence='```mindmap\n'+rawText.trim()+'\n```';
       if(content.includes(oldFence)){
        updated=content.replace(oldFence,'');
       }else if(content.includes(rawText.trim())){
        updated=content.replace(rawText.trim(),'');
       }else if(/```mindmap[\s\S]*?```/.test(content)){
        updated=content.replace(/```mindmap[\s\S]*?```/,'');
       }
       if(updated!==content){
        await app.vault.modify(file,updated);
        container.remove();
        const leaf=app.workspace?.getLeavesOfType?.('markdown')?.find(l=>l.view?.file?.path===source)||app.workspace?.activeLeaf;
        if(leaf?.view?.file?.path===source&&typeof leaf.view.refreshContent==='function'){
         const bodyOnly=updated.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/^(?:---\r?\n)+/,'');
         leaf.view.input.value=bodyOnly;
         if(leaf.view.formatted)leaf.view.formatted.load(bodyOnly);
        }
       }
      }
     }else{
      container.remove();
     }
    },
    onChange:async newJson=>{
     if(source){
      const file=app.vault?.getAbstractFileByPath?.(source)||(app.vault?.getFiles?.()||[]).find(f=>f.path===source);
      if(file){
       const content=await app.vault.read(file);
       let updated=content;
       const oldFence='```mindmap\n'+rawText.trim()+'\n```';
       const newFence='```mindmap\n'+newJson.trim()+'\n```';
       if(content.includes(oldFence)){
        updated=content.replace(oldFence,newFence);
       }else if(content.includes(rawText.trim())){
        updated=content.replace(rawText.trim(),newJson.trim());
       }else if(/```mindmap[\s\S]*?```/.test(content)){
        updated=content.replace(/```mindmap[\s\S]*?```/,newFence);
       }
       if(updated!==content){
        rawText=newJson;
        await app.vault.modify(file,updated);
        const leaf=app.workspace?.getLeavesOfType?.('markdown')?.find(l=>l.view?.file?.path===source)||app.workspace?.activeLeaf;
        if(leaf?.view?.file?.path===source&&typeof leaf.view.refreshContent==='function'){
         const bodyOnly=updated.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/^(?:---\r?\n)+/,'');
         leaf.view.input.value=bodyOnly;
         if(leaf.view.formatted)leaf.view.formatted.load(bodyOnly);
        }
       }
      }
     }
    }
   });
   component?.register(()=>mindmap.destroy());
  }).catch(console.error);
 }
 const click = event => { if (options.clozeStudy) { const img = event.target.closest('img'); if (img && app.images) { event.preventDefault(); app.images.open(img.src, { notePath: source, caption: img.title }).catch(error => new Notice(error.message)); } return; } const clozeEl = event.target.closest('.romus-cloze-top-tag, .romus-cloze-edit-icon, .romus-cloze-body, .romus-cloze-pill'); if (clozeEl) { if(event.ctrlKey||event.metaKey){const pill=clozeEl.closest('.romus-cloze-pill')||clozeEl;const answer=pill.dataset.clozeAnswer||pill.textContent.trim();const file=app.metadataCache?.getFirstLinkpathDest?.(answer,source);if(file){event.preventDefault();(app.openNoteLink?app.openNoteLink(file.path,source,event):app.workspace.openLinkText(file.path,source,true));return;}} event.preventDefault(); event.stopPropagation(); const pill = clozeEl.closest('.romus-cloze-pill') || clozeEl; if (pill && pill.dataset.clozeRaw) { import('./cloze-modal.js').then(({ openClozeEditModal }) => { openClozeEditModal(app, { raw: pill.dataset.clozeRaw, cId: pill.dataset.clozeId, answer: pill.dataset.clozeAnswer, label: pill.dataset.clozeLabel, hint: pill.dataset.clozeHint, notePath: source, onApply: async (newMarkup, newAnswer) => { if (options.onUpdateCloze) { await options.onUpdateCloze(pill.dataset.clozeRaw, newMarkup); return; } if (source) { const file = app.vault?.getAbstractFileByPath?.(source) || (app.vault?.getFiles?.() || []).find(f => f.path === source); if (file) { const content = await app.vault.read(file); if (content.includes(pill.dataset.clozeRaw)) { const updated = content.replace(pill.dataset.clozeRaw, newMarkup); await app.vault.modify(file, updated); new Notice('Flashcard Cloze atualizado!'); const leaf = app.workspace?.getLeavesOfType?.('markdown')?.find(l => l.view?.file?.path === source) || app.workspace?.activeLeaf; if (leaf?.view?.file?.path === source && typeof leaf.view.refreshContent === 'function') { leaf.view.input.value = updated; await leaf.view.refreshContent(); } app.vault.trigger?.('modify', file); return; } } } pill.dataset.clozeRaw = newMarkup; pill.dataset.clozeAnswer = newAnswer; const bodyEl = pill.querySelector('.romus-cloze-body'); if (bodyEl) bodyEl.textContent = newAnswer; }, onRemove: async (plainText) => { if (options.onRemoveCloze) { await options.onRemoveCloze(pill.dataset.clozeRaw, plainText); return; } if (source) { const file = app.vault?.getAbstractFileByPath?.(source) || (app.vault?.getFiles?.() || []).find(f => f.path === source); if (file) { const content = await app.vault.read(file); if (content.includes(pill.dataset.clozeRaw)) { const updated = content.replace(pill.dataset.clozeRaw, plainText); await app.vault.modify(file, updated); new Notice('Cloze removido com sucesso!'); const leaf = app.workspace?.getLeavesOfType?.('markdown')?.find(l => l.view?.file?.path === source) || app.workspace?.activeLeaf; if (leaf?.view?.file?.path === source && typeof leaf.view.refreshContent === 'function') { leaf.view.input.value = updated; await leaf.view.refreshContent(); } app.vault.trigger?.('modify', file); return; } } } pill.replaceWith(document.createTextNode(plainText)); } }); }).catch(err => new Notice('Erro ao abrir editor de cloze: ' + err.message)); } return; } const img = event.target.closest('img'); if (img && app.images) { event.preventDefault(); app.images.open(img.src, { notePath: source, caption: img.title }).catch(error => new Notice(error.message)); return; } const a = event.target.closest('a'); if (!a) return; const href = a.getAttribute('href') || '', wiki = parseWikipediaUrl(href); if (a.classList.contains('internal-link') || href.startsWith('atlas-note:') || wiki) { event.preventDefault(); let target = a.dataset.href || wiki?.title; if (!target && href.startsWith('atlas-note:')) { try { target = decodeURIComponent(href.slice(11)); } catch { target = href.slice(11); } } if (target) (app.openNoteLink ? app.openNoteLink(target, source, event) : app.workspace.openLinkText(target, source, event.ctrlKey || event.metaKey)).then(leaf => { if (wiki && leaf?.view?.notePage && !leaf.view.notePage.data?.wikipedia) { import('./wikipedia.js').then(({ fetchWikipediaArticle }) => fetchWikipediaArticle(wiki.title, wiki.lang, wiki.url)).then(art => leaf.view.notePage.setWikipedia(art)).catch(() => {}); } }).catch(e => new Notice(e.message)); } else if (/^https?:/.test(a.href)) { event.preventDefault(); window.atlasNative.call('external', a.href); } };
 const keydown=event=>{if(event.key==='Enter'||event.key===' '){const editTag=event.target.closest('.romus-cloze-top-tag');if(editTag){event.preventDefault();editTag.click();return}const body=event.target.closest('.romus-cloze-body');if(body){event.preventDefault();body.click();return}}};
 el.addEventListener('click',click);el.addEventListener('keydown',keydown);component?.register(()=>{el.removeEventListener('click',click);el.removeEventListener('keydown',keydown)});
}};
export function rewriteFrontmatter(text,fn){const match=/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);const fm=match?parseYaml(match[1])||{}:{};fn(fm);return'---\n'+stringifyYaml(fm,{lineWidth:0})+'---\n'+(match?text.slice(match[0].length):text)}
export class Events{constructor(){this.events=new Map()}on(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);return()=>this.events.get(type)?.delete(fn)}trigger(type,...args){for(const fn of this.events.get(type)||[])try{fn(...args)}catch(e){console.error(e)}}}
export function modalsOpen(){return modalStack.length>0}
