import {Menu,Notice,setIcon} from './compat.js';
export function wireImageActions(app,figure,img,{notePath='',caption=()=>img.title||'',onCaption,onRemove}={}){
 const open=fullscreen=>app.images.open(img.src,{notePath,caption:caption(),onCaption,fullscreen}).catch(error=>new Notice(error.message));
 const menu=event=>{event.preventDefault();event.stopPropagation();const actions=new Menu();actions.addItem(item=>item.setTitle('Visualizar imagem').setIcon('image').onClick(()=>open(false)));actions.addItem(item=>item.setTitle('Tela cheia').setIcon('maximize').onClick(()=>open(true)));actions.addItem(item=>item.setTitle('Editar legenda').setIcon('text-cursor-input').onClick(()=>open(false)));if(onRemove){actions.addSeparator();actions.addItem(item=>item.setTitle('Remover imagem do texto').setIcon('trash-2').onClick(()=>{if(img.isConnected)Promise.resolve().then(onRemove).catch(error=>new Notice(error.message))}))}actions.addSeparator();actions.addItem(item=>item.setTitle('Excluir imagem de todo o aplicativo').setIcon('trash-2').onClick(()=>app.images.trash(img.src,{notePath,caption:caption()}).catch(error=>new Notice(error.message))));actions.el.lastElementChild.classList.add('mod-warning');actions.showAtMouseEvent(event)};
 figure.addEventListener('contextmenu',menu);const button=document.createElement('button');button.type='button';button.className='atlas-image-actions';button.title='Opções da imagem · botão direito';button.setAttribute('aria-label','Opções da imagem');setIcon(button,'ellipsis');button.onpointerdown=event=>{event.preventDefault();event.stopPropagation()};button.onclick=menu;figure.append(button);
 const key=event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){const rect=img.getBoundingClientRect();event.preventDefault();event.stopPropagation();menu(new MouseEvent('contextmenu',{clientX:rect.left+20,clientY:rect.top+20}))}else if(onRemove&&['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopPropagation();Promise.resolve().then(onRemove).catch(error=>new Notice(error.message))}};img.addEventListener('keydown',key);
 return()=>{figure.removeEventListener('contextmenu',menu);img.removeEventListener('keydown',key);button.remove()};
}

export function wireImageResize(figure,img,onResized){
 const handle=document.createElement('div');
 handle.className='atlas-image-resizer';
 handle.title='Arrastar para redimensionar imagem';
 handle.setAttribute('role','separator');
 handle.setAttribute('aria-label','Redimensionar tamanho da imagem');
 figure.append(handle);

 let startX=0,startW=0,dragging=false;

 const onPointerMove=e=>{
  if(!dragging)return;
  const dx=e.clientX-startX;
  const parentW=figure.parentElement?.clientWidth||window.innerWidth||800;
  const newW=Math.round(Math.max(120,Math.min(parentW-10,startW+dx)));
  img.style.width=newW+'px';
  figure.style.width=newW+'px';
 };

 const onPointerUp=e=>{
  if(!dragging)return;
  dragging=false;
  handle.classList.remove('is-dragging');
  try{handle.releasePointerCapture(e.pointerId)}catch{}
  window.removeEventListener('pointermove',onPointerMove);
  window.removeEventListener('pointerup',onPointerUp);
  const finalW=parseInt(img.style.width,10);
  if(finalW&&Number.isFinite(finalW)){
   onResized?.(finalW);
  }
 };

 handle.onpointerdown=e=>{
  e.preventDefault();
  e.stopPropagation();
  startX=e.clientX;
  startW=img.offsetWidth||300;
  dragging=true;
  handle.classList.add('is-dragging');
  try{handle.setPointerCapture(e.pointerId)}catch{}
  window.addEventListener('pointermove',onPointerMove);
  window.addEventListener('pointerup',onPointerUp);
 };

 return()=>{
  window.removeEventListener('pointermove',onPointerMove);
  window.removeEventListener('pointerup',onPointerUp);
  handle.remove();
 };
}
