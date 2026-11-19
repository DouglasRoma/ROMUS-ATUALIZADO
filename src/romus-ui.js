import {ClozeNoteStudy} from './cloze-note-study.js';

/** One-time presentation of the existing review controls and Cloze Note contextual study mode. */
export function installRomusUI(app){
 app.romusUI={
  review(view){
   if(view.host.dataset.romusReview)return;
   view.host.dataset.romusReview='true';
   const filters=view.host.querySelector('.ia-fsrs-filters');
   let bar=view.host.querySelector('.romus-review-switcher');
   if(filters&&view.counters&&!bar){
     bar=view.host.createDiv({cls:'romus-review-switcher'});
     view.host.insertBefore(bar,view.counters);
     bar.append(filters,view.counters);
   }
   for(const control of view.actions?.querySelectorAll('button')||[]){
     control.title=control.getAttribute('aria-label')||control.textContent.trim();
     control.classList.add('romus-review-action');
   }

   // Initialize Cloze Note Study component
   view.clozeStudy=new ClozeNoteStudy(view);
   const hasClozes=()=>(view.entries||[]).some(e=>e.isCloze||e.cardType==='cloze'||/\{\{/.test(e.question||e.answer||''));
   const hasStandard=()=>(view.entries||[]).some(e=>e.cardType!=='cloze'&&!e.isCloze);

   // Mode buttons: Flashcards vs Cloze na Nota
   view.studyMode=view.spec?.studyMode||(hasClozes()&&!hasStandard()?'cloze-note':'flashcards');

   if(bar){
     const modeGroup=bar.createDiv({cls:'romus-study-mode-group'});
     const cardBtn=modeGroup.createEl('button',{
       cls:'romus-study-mode-btn',
       text:'🎴 Flashcards',
       attr:{type:'button',title:'Modo Flashcards Convencionais'}
     });
     const clozeBtn=modeGroup.createEl('button',{
       cls:'romus-study-mode-btn',
       text:'📝 Cloze na Nota',
       attr:{type:'button',title:'Modo Cloze contextual na Nota (RemNote)'}
     });

     const updateModeUI=()=>{
       cardBtn.classList.toggle('is-active',view.studyMode!=='cloze-note');
       clozeBtn.classList.toggle('is-active',view.studyMode==='cloze-note');
       cardBtn.setAttribute('aria-pressed',String(view.studyMode!=='cloze-note'));
       clozeBtn.setAttribute('aria-pressed',String(view.studyMode==='cloze-note'));
     };
     updateModeUI();

     cardBtn.onclick=()=>{
       if(view.studyMode!=='flashcards'){
         view.studyMode='flashcards';
         updateModeUI();
         view.start(view.mode||'due');
         view.show();
       }
     };

     clozeBtn.onclick=()=>{
       if(view.studyMode!=='cloze-note'){
         view.studyMode='cloze-note';
         updateModeUI();
         view.start(view.mode||'due');
         view.show();
       }
     };
   }

   // Hook view.show to render ClozeNoteStudy when mode is cloze-note
   const origShow=view.show.bind(view);
   view.show=async function(){
     if(view.studyMode==='cloze-note'){
       view.contentEl.ownerDocument.defaultView.clearTimeout(view.dueTimer);
       if(view.mode==='due'&&view.position===view.queue.length){
         const last=new Map(view.queue.map(item=>[item.entry.id,item]));
         const pool=view.scopeEntries();
         for(const entry of pool){
           if(entry.record.schedule?.reps&&new Date(entry.record.schedule.due).getTime()<=Date.now()&&(!last.has(entry.id)||last.get(entry.id).event)){
             view.queue.push({entry,revealed:false,event:null,draft:'',expected:entry.record.revision});
           }
         }
       }
       const token=++view.renderToken,item=view.current();
       view.updateStats();
       view.previous.disabled=view.position<=0;
       view.next.disabled=view.position>=view.queue.length;
       view.progress.style.width=`${view.queue.length?view.position/view.queue.length*100:100}%`;
       view.number.textContent=view.queue.length?`${Math.min(view.position+1,view.queue.length)} de ${view.queue.length}`:'Nenhum cloze nesta fila';
       if(view.gradeHost)view.gradeHost.hidden=true;

       if(!item){
         view.mount.empty();
         const end=view.mount.createDiv({cls:'ia-fsrs-finished'});
         end.createEl('h2',{text:view.queue.length?'Sessão concluída':'Todos os clozes revisados'});
         const failures=view.scopeEntries().filter(e=>e.record.needsReview).length;
         end.createEl('p',{text:`${failures} clozes marcados para rever. O agendamento FSRS foi salvo.`});
         if(failures){
           view.button(end,'Revisar os que errei','rotate-ccw',()=>view.start('errors'));
         }
         view.button(end,'Estudar todos os clozes','layers',()=>view.start('all'));
         return;
       }

       const el=await view.clozeStudy.render(item);
       if(!view.alive||token!==view.renderToken)return;
       view.mount.replaceChildren(el);
       return;
     }
     if(view.gradeHost)view.gradeHost.hidden=false;
     return origShow();
   };
  }
 };
}
