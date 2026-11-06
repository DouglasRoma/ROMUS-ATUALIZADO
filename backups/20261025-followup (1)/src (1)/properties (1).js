import {Modal,Notice} from './compat.js';
import {PROPERTY_TYPES,reserved,publicProperties,propertyDocument,inferType,patchProperties} from './property-data.js';
export {PROPERTY_TYPES,publicProperties,propertyDocument,inferType,patchProperties,valueMatches} from './property-data.js';

export class PropertiesModal extends Modal{
  constructor(app,file,afterSave){super(app);this.file=file;this.afterSave=afterSave;this.rows=[];this.alive=true}
  async onOpen(){
    this.modalEl.addClass('atlas-properties-modal');this.setTitle('Propriedades · '+this.file.basename);
    try{
      this.original=propertyDocument(await this.app.vault.read(this.file)).props;
      this.contentEl.createEl('p',{cls:'ia-muted',text:'Organize esta nota com campos que também podem ser usados nos filtros da biblioteca.'});
      this.namesId='atlas-property-names-'+Date.now();const names=this.contentEl.createEl('datalist',{attr:{id:this.namesId}});for(const name of Object.keys(this.app.propertyTypes||{}))names.createEl('option',{attr:{value:name}});
      this.host=this.contentEl.createDiv({cls:'atlas-property-rows'});
      for(const [key,value] of Object.entries(publicProperties(this.original)))this.addRow(key,value);
      if(!this.rows.length)this.addRow('','');
      const add=this.contentEl.createEl('button',{text:'+ Adicionar propriedade'});add.onclick=()=>this.addRow('','');
      this.status=this.contentEl.createDiv({cls:'atlas-form-status',attr:{role:'status','aria-live':'polite'}});
      const actions=this.contentEl.createDiv({cls:'ia-modal-actions'});
      const cancel=actions.createEl('button',{text:'Cancelar'});cancel.onclick=()=>this.close();
      this.saveButton=actions.createEl('button',{cls:'mod-cta',text:'Salvar propriedades'});this.saveButton.onclick=()=>this.saveProperties();
    }catch(error){this.contentEl.createEl('p',{text:error.message})}
  }
  addRow(key,value){
    const row={key,value,original:value,dirty:false,el:this.host.createDiv({cls:'atlas-property-row'})};
    row.name=row.el.createEl('input',{value:key,attr:{placeholder:'Nome, por exemplo: tema','aria-label':'Nome da propriedade',list:this.namesId}});
    row.type=row.el.createEl('select',{attr:{'aria-label':'Tipo da propriedade'}});
    for(const [id,label] of PROPERTY_TYPES)row.type.createEl('option',{text:label,attr:{value:id}});
    row.type.value=inferType(key,value,this.app.propertyTypes);row.valueHost=row.el.createDiv({cls:'atlas-property-value'});
    const remove=row.el.createEl('button',{text:'×',attr:{'aria-label':'Remover propriedade'}});remove.onclick=()=>{this.rows.splice(this.rows.indexOf(row),1);row.el.remove()};
    row.type.onchange=()=>{row.typeTouched=true;row.value=row.input.type==='checkbox'?row.input.checked:row.input.value;row.dirty=true;this.renderValue(row)};
    row.name.oninput=()=>{const known=this.app.propertyTypes?.[row.name.value.trim()],type=known==='multitext'?'list':known;if(type&&!row.typeTouched&&row.type.value!==type){row.type.value=type;this.renderValue(row)}};
    this.rows.push(row);this.renderValue(row);if(!key)row.name.focus();return row;
  }
  renderValue(row){
    const type=row.type.value;row.valueHost.empty();const inputType={number:'number',checkbox:'checkbox',date:'date',datetime:'datetime-local'}[type]||'text';
    row.input=row.valueHost.createEl('input',{attr:{type:inputType,'aria-label':'Valor da propriedade'}});
    if(type==='checkbox')row.input.checked=row.value===true;
    else if(type==='structured'){row.input.value=JSON.stringify(row.value);row.input.readOnly=true}
    else if(type==='list'||type==='tags'){row.input.value=Array.isArray(row.value)?row.value.join(', '):String(row.value??'');row.input.placeholder='Separe os valores com vírgulas'}
    else{row.input.value=String(row.value??'');if(type==='number')row.input.step='any'}
    row.input.oninput=()=>{row.dirty=true};
  }
  async saveProperties(){
    if(this.busy)return;this.busy=true;this.saveButton.disabled=true;
    try{
      const values={},types={...this.app.propertyTypes};
      for(const row of this.rows){
        const key=row.name.value.trim(),type=row.type.value;if(!key)continue;
        if(reserved(key))throw Error('Esse nome é reservado para os dados internos do aplicativo.');
        if(Object.hasOwn(values,key))throw Error(`A propriedade “${key}” aparece duas vezes.`);
        let value=row.original;
        if(row.dirty||!row.key){
          if(type==='structured')value=row.original;
          else if(type==='checkbox')value=row.input.checked;
          else if(type==='list'||type==='tags')value=[...new Set(row.input.value.split(',').map(s=>s.trim().replace(type==='tags'?/^#/:/$^/,'')).filter(Boolean))];
          else if(type==='number'){if(!row.input.value.trim()||!Number.isFinite(Number(row.input.value)))throw Error(`Informe um número válido para “${key}”.`);value=Number(row.input.value)}
          else value=row.input.value;
        }
        values[key]=value;types[key]=type;
      }
      await this.app.vault.process(this.file,text=>patchProperties(text,this.original,values));
      await window.atlasNative.call('property-types:write',types);this.app.propertyTypes=types;
      await this.afterSave?.();this.close();
    }catch(error){if(this.alive)this.status.textContent=error.message}
    finally{this.busy=false;if(this.alive)this.saveButton.disabled=false}
  }
  onClose(){this.alive=false;this.contentEl.empty()}
}
