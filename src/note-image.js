import Image from '@tiptap/extension-image';
import {Notice} from './compat.js';
import {wireImageActions,wireImageResize} from './image-actions.js';
import {MEDIA_MARKER} from './note-media-format.js';
export const relativeImage=(note,path)=>{const from=note.split('/').slice(0,-1),to=path.split('/');while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift()}return'../'.repeat(from.length)+to.join('/')};
export function noteImage(owner){return Image.extend({
 addAttributes(){
  return{
   ...this.parent?.(),
   width:{
    default:null,
    parseHTML:el=>el.getAttribute('data-width')||(el.style.width?parseInt(el.style.width,10):null),
    renderHTML:attrs=>attrs.width?{'data-width':attrs.width,style:`width:${attrs.width}px;max-width:100%`}:{}
   }
  };
 },
 addNodeView(){return({node,editor,getPos})=>{let current=node;
  if(node.attrs.title===MEDIA_MARKER){const figure=document.createElement('figure');const remove=async()=>{const pos=getPos();if(typeof pos==='number'&&!editor.isDestroyed){editor.commands.deleteRange({from:pos,to:pos+current.nodeSize});await owner.save?.()}};let dispose=owner.app.noteMedia.mount(figure,node.attrs.src,{notePath:owner.file.path,onRemove:remove});return{dom:figure,stopEvent:()=>true,ignoreMutation:()=>true,update(next){if(next.type!==current.type||next.attrs.title!==MEDIA_MARKER)return false;if(next.attrs.src!==current.attrs.src){dispose();dispose=owner.app.noteMedia.mount(figure,next.attrs.src,{notePath:owner.file.path,onRemove:remove})}current=next;return true},destroy(){dispose()}}}
  const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');figure.className='atlas-note-image';figure.append(img,caption);img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Visualizar imagem');
  const paint=()=>{
   img.src=current.attrs.src;
   img.alt=current.attrs.alt||'';
   const w=current.attrs.width||(current.attrs.alt&&/^\d+$/.test(current.attrs.alt.trim())?parseInt(current.attrs.alt.trim(),10):null);
   if(w){img.style.width=w+'px';figure.style.width=w+'px';}else{img.style.width='';figure.style.width='';}
   caption.textContent=owner.app.images?.forSource(current.attrs.src)?.caption??current.attrs.title??'';caption.hidden=!caption.textContent;
  };paint();
  const open=()=>owner.app.images.open(current.attrs.src,{notePath:owner.file.path,caption:current.attrs.title,onCaption:async value=>{const pos=getPos();if(typeof pos!=='number'||editor.isDestroyed)return;editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,title:value||null}));await owner.save?.()}}).catch(error=>new Notice(error.message));
  const remove=async()=>{const pos=getPos();if(typeof pos!=='number'||editor.isDestroyed||editor.state.doc.nodeAt(pos)?.type.name!=='image')return;editor.commands.deleteRange({from:pos,to:pos+current.nodeSize});editor.view.dom.focus({preventScroll:true});await owner.save?.()};
  const actions=wireImageActions(owner.app,figure,img,{notePath:owner.file.path,caption:()=>current.attrs.title,onCaption:async value=>{const pos=getPos();if(typeof pos==='number'&&!editor.isDestroyed){editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,title:value||null}));await owner.save?.()}},onRemove:remove});
  const resize=wireImageResize(figure,img,async newWidth=>{
   const pos=getPos();
   if(typeof pos==='number'&&!editor.isDestroyed){
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,width:newWidth,alt:String(newWidth)}));
    current={...current,attrs:{...current.attrs,width:newWidth,alt:String(newWidth)}};
    owner.dirty=true;
    owner.owner.status.textContent='Salvando…';
    owner.flushToOwner();
   }
  });
  img.onclick=event=>{event.preventDefault();event.stopPropagation();open()};img.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();open()}};const off=owner.app.vault.on('image-caption-changed',paint);
  return{dom:figure,stopEvent:event=>event.target.closest('button,.atlas-image-resizer')!==null,update(next){if(next.type.name!=='image')return false;current=next;paint();return true},destroy(){actions();off();resize();}};
 }},
 renderMarkdown({attrs}){
  const altNum=attrs.width||(/^\d+$/.test(String(attrs.alt||'').trim())?attrs.alt.trim():'');
  const alt=altNum||String(attrs.alt||'').replace(/[\[\]]/g,'');
  const title=String(attrs.title||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const source=attrs.title===MEDIA_MARKER?'<'+attrs.src+'>':attrs.src;
  return`![${alt}](${source}${title?' "'+title+'"':''})`;
 }
})}
