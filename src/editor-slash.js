import {setIcon} from './compat.js';
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const commands=[['Imagem','image','Cole com Ctrl+V ou escolha um arquivo','image'],['Link / vídeo','link','Incorporar YouTube, página, áudio ou PDF','media'],['Mapa mental','git-fork','Criar mapa mental interativo neste ponto','mindmap',['mindmap','mapa','mapamental','mental']],['Título 1','heading-1','Título principal','h1'],['Título 2','heading-2','Seção','h2'],['Título 3','heading-3','Subseção','h3'],['Lista','list','Marcadores','bullet'],['Lista numerada','list-ordered','Passos em ordem','ordered'],['Tarefas','list-checks','Lista de verificação','task'],['Citação','quote','Destacar uma passagem','quote'],['Código','code','Bloco de código','code'],['Divisória','minus','Separar seções','rule']];
export class EditorSlashMenu{
 constructor(owner){this.owner=owner;this.key=event=>{if(!this.menu)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close()}else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();this.index=(this.index+(event.key==='ArrowDown'?1:-1)+this.items.length)%this.items.length;this.paint()}else if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();this.choose(this.index)}};owner.contentEl.addEventListener('keydown',this.key,true);this.outside=event=>{if(!this.menu?.contains(event.target)&&!owner.contentEl.contains(event.target))this.close()};document.addEventListener('pointerdown',this.outside)}
 update(){
  const owner=this.owner;let before,from,to,point;
  if(owner.editorMode==='formatted'){const rich=owner.formatted?.editor;if(!rich?.isFocused||!rich.state.selection.empty)return this.close();const {selection}=rich.state;before=selection.$from.parent.textBetween(0,selection.$from.parentOffset);to=selection.from;point=()=>rich.view.coordsAtPos(to)}
  else if(owner.editorMode==='source'){const input=owner.sourceInput;if(document.activeElement!==input||input.selectionStart!==input.selectionEnd)return this.close();to=input.selectionStart;before=input.value.slice(0,to).split('\n').pop();point=()=>input.getBoundingClientRect()}
  else return this.close();
  const match=before.match(/(?:^|\s)\/([^/\n]{0,28})$/);if(!match)return this.close();from=to-match[1].length-1;const query=fold(match[1].trim()),items=commands.filter(item=>fold(item[0]).includes(query)||(item[3]&&fold(item[3]).includes(query))||(item[4]&&item[4].some(a=>fold(a).includes(query))));if(!items.length)return this.close();
  this.close();this.range={from,to,mode:owner.editorMode};this.items=items;this.index=0;const box=point(),menu=this.menu=document.body.createDiv({cls:'atlas-editor-slash',attr:{role:'listbox','aria-label':'Inserir no texto'}});Object.assign(menu.style,{left:Math.max(12,Math.min(box.left,innerWidth-300))+'px',top:Math.max(12,Math.min(owner.editorMode==='source'?box.top+40:box.bottom+6,innerHeight-370))+'px'});menu.createDiv({cls:'atlas-slash-caption',text:'INSERIR NO TEXTO'});for(let i=0;i<items.length;i++){const button=menu.createEl('button',{attr:{role:'option'}}),icon=button.createSpan();setIcon(icon,items[i][1]);const label=button.createSpan();label.createEl('strong',{text:items[i][0]});label.createEl('small',{text:items[i][2]});button.onpointerdown=event=>{event.preventDefault();this.choose(i)}}this.paint();
 }
 paint(){[...this.menu.querySelectorAll('button')].forEach((button,index)=>button.setAttribute('aria-selected',String(index===this.index)));this.menu.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'})}
 choose(index){const id=this.items[index]?.[3],range=this.range,owner=this.owner;this.close();if(!id||range.mode!==owner.editorMode)return;
  if(id==='mindmap'){
   const defaultJson = JSON.stringify({
     root: '1',
     height: 400,
     nodes: [
       { id: '1', title: 'Tópico Central', color: '#38bdf8' },
       { id: '2', parentId: '1', title: 'Subtópico 1', color: '#34d399' },
       { id: '3', parentId: '1', title: 'Subtópico 2', color: '#f59e0b' }
     ]
   }, null, 2);
   if(range.mode==='formatted'){
    const editor=owner.formatted.editor;
    const schema=editor.schema;
    const codeBlockType=schema.nodes.codeBlock;
    if(codeBlockType){
     const textNode=schema.text(defaultJson);
     const mindmapNode=codeBlockType.create({language:'mindmap'},textNode);
     const {state}=editor;
     const $from=state.doc.resolve(Math.min(range.from,state.doc.content.size));
     const parent=$from.parent;
     const matchText=parent.textBetween(0,parent.content.size);
     const slashText=state.doc.textBetween(range.from,range.to);
     if(parent.isTextblock&&matchText.trim()===slashText.trim()){
      const from=$from.before();
      const to=$from.after();
      editor.chain().focus().deleteRange({from,to}).insertContentAt(from,mindmapNode).run();
     }else{
      editor.chain().focus().deleteRange({from:range.from,to:range.to}).insertContentAt(range.from,mindmapNode).run();
     }
     owner.formatted.dirty=true;
     owner.formatted.flushToOwner();
    }
   }else{
    const defaultMap='```mindmap\n'+defaultJson+'\n```\n';
    owner.sourceInput.setRangeText(defaultMap,range.from,range.to,'end');
    owner.sourceInput.dispatchEvent(new Event('input',{bubbles:true}));
    owner.sourceInput.focus();
   }
   return;
  }
  if(range.mode==='formatted'){const chain=owner.formatted.editor.chain().focus().deleteRange({from:range.from,to:range.to});if(/^h[123]$/.test(id))chain.setHeading({level:Number(id[1])});else if(id==='bullet')chain.toggleBulletList();else if(id==='ordered')chain.toggleOrderedList();else if(id==='task')chain.toggleTaskList();else if(id==='quote')chain.toggleBlockquote();else if(id==='code')chain.toggleCodeBlock();else if(id==='rule')chain.setHorizontalRule();chain.run()}else{const text={h1:'# ',h2:'## ',h3:'### ',bullet:'- ',ordered:'1. ',task:'- [ ] ',quote:'> ',code:'```\n\n```',rule:'\n---\n',image:'',media:''}[id];owner.sourceInput.setRangeText(text,range.from,range.to,'end');owner.sourceInput.dispatchEvent(new Event('input',{bubbles:true}));owner.sourceInput.focus()}if(id==='image')owner.images.pick();if(id==='media')owner.media.pick()}
 close(){this.menu?.remove();this.menu=null}
 dispose(){this.close();this.owner.contentEl.removeEventListener('keydown',this.key,true);document.removeEventListener('pointerdown',this.outside)}
}
