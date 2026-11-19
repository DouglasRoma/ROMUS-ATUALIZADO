import {Notice,marked,DOMPurify} from './compat.js';
import {propertyDocument} from './property-data.js';
import {splitNoteContent} from './note-content.js';

function escapeHtml(text){
  return String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderMd(text){
  if(!text||!text.trim())return '';
  const clean=String(text).replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
  const parsed=marked.parse(clean);
  if(typeof DOMPurify?.sanitize==='function'){
    return DOMPurify.sanitize(parsed);
  }
  return parsed;
}

export function collectBoardNotes(board,app){
  const paths=[];
  const add=p=>{
    if(typeof p==='string'&&p.endsWith('.md')&&!paths.includes(p))paths.push(p);
  };
  const tools=app?.plugin?.reviewSourceTools?.();
  if(tools?.whiteboardFlashcardNotes&&Array.isArray(board?.nodes)){
    try{
      for(const p of tools.whiteboardFlashcardNotes(board.nodes,true))add(p);
    }catch{}
  }
  for(const node of board?.nodes||[]){
    add(node.path);
    add(node.visualNote);
    add(node.mediaNote);
    add(node.visualSource);
    if(Array.isArray(node.pins)){
      for(const pin of node.pins)add(pin?.notePath);
    }
  }
  return paths;
}

export function buildBoardPdfHtml({boardTitle,boardSummary,notes}){
  const totalCards=notes.reduce((sum,n)=>sum+(n.cards?.length||0),0);
  const now=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});

  let html=`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(boardTitle)} - Resumos e Flashcards</title>
<style>
@page {
  size: A4;
  margin: 18mm 16mm 18mm 16mm;
}
@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
* {
  box-sizing: border-box;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1e293b;
  background: #ffffff;
  line-height: 1.6;
  font-size: 13.5px;
  margin: 0;
  padding: 0;
}
h1, h2, h3, h4, h5, h6 {
  color: #0f172a;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.2em;
  margin-bottom: 0.5em;
  break-after: avoid;
  page-break-after: avoid;
}
h1 { font-size: 24px; }
h2 { font-size: 17px; }
h3 { font-size: 14.5px; }
p { margin: 0.6em 0; }
ul, ol { margin: 0.6em 0; padding-left: 24px; }
li { margin-bottom: 3px; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 4px;
}
pre {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 14px;
  overflow-x: auto;
}
blockquote {
  border-left: 3.5px solid #cbd5e1;
  margin: 10px 0;
  padding-left: 14px;
  color: #475569;
  font-style: italic;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}
th, td {
  border: 1px solid #e2e8f0;
  padding: 6px 10px;
  text-align: left;
}
th {
  background: #f1f5f9;
  font-weight: 600;
}

/* Capa / Cabeçalho do Whiteboard */
.pdf-cover {
  break-after: page;
  page-break-after: always;
  padding-bottom: 20px;
}
.pdf-cover-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4f46e5;
  margin-bottom: 6px;
}
.pdf-cover-title {
  font-size: 32px;
  font-weight: 800;
  margin: 0 0 14px 0;
  color: #0f172a;
  border-bottom: 3px solid #4f46e5;
  padding-bottom: 12px;
}
.pdf-cover-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 24px;
}
.pdf-meta-badge {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  color: #334155;
}
.pdf-board-summary-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #4f46e5;
  border-radius: 8px;
  padding: 16px 20px;
  margin: 20px 0;
}
.pdf-box-kicker {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  margin-bottom: 8px;
}
.pdf-toc {
  margin-top: 24px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px 20px;
}
.pdf-toc-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  color: #334155;
  margin-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
}
.pdf-toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pdf-toc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #1e293b;
  border-bottom: 1px dotted #e2e8f0;
  padding-bottom: 4px;
}
.pdf-toc-num {
  font-weight: 700;
  color: #4f46e5;
  margin-right: 8px;
}

/* Seção de cada Nota */
.pdf-note-section {
  break-after: page;
  page-break-after: always;
  padding-top: 10px;
}
.pdf-note-section:last-child {
  break-after: auto;
  page-break-after: auto;
}
.pdf-note-header {
  border-bottom: 2px solid #0f172a;
  padding-bottom: 12px;
  margin-bottom: 20px;
}
.pdf-note-kicker {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #ffffff;
  background: #0f172a;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}
.pdf-note-title {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  margin: 4px 0 0 0;
}

/* Títulos de Subseção */
.pdf-section-title {
  font-size: 13.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  border-bottom: 1.5px solid #e2e8f0;
  padding-bottom: 6px;
  margin-top: 24px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pdf-note-summary {
  font-size: 13.5px;
  line-height: 1.65;
  color: #1e293b;
  margin-bottom: 20px;
}

/* Card Wikipedia */
.pdf-wiki-card {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #334155;
  border-radius: 8px;
  padding: 14px 18px;
  margin: 14px 0 24px 0;
}
.pdf-wiki-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pdf-wiki-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  background: #e2e8f0;
  color: #1e293b;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
.pdf-wiki-art-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.pdf-wiki-desc {
  font-size: 12px;
  color: #64748b;
  font-style: italic;
  margin-bottom: 10px;
}
.pdf-wiki-body {
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}

/* Flashcards */
.pdf-flashcards-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}
.pdf-flashcard-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  break-inside: avoid;
  page-break-inside: avoid;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.pdf-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.pdf-card-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.pdf-badge-basic { background: #e0e7ff; color: #4338ca; }
.pdf-badge-concept { background: #f3e8ff; color: #7e22ce; }
.pdf-badge-twoway { background: #dcfce7; color: #15803d; }
.pdf-badge-cloze { background: #ffedd5; color: #c2410c; }
.pdf-badge-descriptor { background: #e0f2fe; color: #0369a1; }

.pdf-card-num {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}
.pdf-card-context {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  margin-bottom: 8px;
  background: #f1f5f9;
  border-left: 3px solid #6366f1;
  border-radius: 4px;
  font-size: 11.5px;
  color: #475569;
}
.pdf-pin {
  color: #6366f1;
  font-weight: 700;
}
.pdf-card-question {
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 6px;
}
.pdf-card-question p { margin: 0; display: inline; }
.pdf-card-divider {
  border-top: 1px dashed #e2e8f0;
  margin: 8px 0;
}
.pdf-card-answer {
  font-size: 13.5px;
  color: #334155;
}
.pdf-card-answer p { margin: 0; display: inline; }
.pdf-empty-text {
  font-size: 12.5px;
  font-style: italic;
  color: #94a3b8;
  margin: 8px 0;
}
</style>
</head>
<body>

<div class="pdf-cover">
  <div class="pdf-cover-kicker">Whiteboard · Caderno de Resumos e Flashcards</div>
  <h1 class="pdf-cover-title">${escapeHtml(boardTitle)}</h1>
  <div class="pdf-cover-meta">
    <span class="pdf-meta-badge">${notes.length} ${notes.length===1?'nota incorporada':'notas incorporadas'}</span>
    <span class="pdf-meta-badge">${totalCards} ${totalCards===1?'flashcard':'flashcards'}</span>
    <span class="pdf-meta-badge">${now}</span>
    <span class="pdf-meta-badge">ROMUS</span>
  </div>

  ${boardSummary?`
  <div class="pdf-board-summary-box">
    <div class="pdf-box-kicker">Resumo do Whiteboard</div>
    <div class="pdf-board-summary-body">${renderMd(boardSummary)}</div>
  </div>
  `:''}

  <div class="pdf-toc">
    <div class="pdf-toc-title">Índice das Notas do Quadro</div>
    <ul class="pdf-toc-list">
      ${notes.map((n,i)=>`
        <li class="pdf-toc-item">
          <span><span class="pdf-toc-num">${i+1}.</span> <strong>${escapeHtml(n.title)}</strong></span>
          <span style="color:#64748b;font-size:12px;">${n.cards?.length||0} cartões</span>
        </li>
      `).join('')}
    </ul>
  </div>
</div>
`;

  for(let i=0;i<notes.length;i++){
    const note=notes[i];
    html+=`
<div class="pdf-note-section">
  <header class="pdf-note-header">
    <span class="pdf-note-kicker">NOTA ${i+1} DE ${notes.length}</span>
    <h1 class="pdf-note-title">${escapeHtml(note.title)}</h1>
  </header>
`;

    // Resumo Normal (se tiver)
    if(note.summary&&note.summary.trim()){
      html+=`
  <section class="pdf-note-summary-section">
    <h2 class="pdf-section-title">Resumo</h2>
    <div class="pdf-note-summary">${renderMd(note.summary)}</div>
  </section>
`;
    }

    // Resumo da Wikipedia (se tiver)
    if(note.wikipedia){
      html+=`
  <section class="pdf-wiki-summary-section">
    <h2 class="pdf-section-title">Resumo Wikipedia</h2>
    <div class="pdf-wiki-card">
      <div class="pdf-wiki-header">
        <span class="pdf-wiki-badge">WIKIPEDIA (${escapeHtml(note.wikipedia.lang||'ES').toUpperCase()})</span>
        <span class="pdf-wiki-art-title">${escapeHtml(note.wikipedia.title||note.title)}</span>
      </div>
      ${note.wikipedia.description?`<div class="pdf-wiki-desc">${escapeHtml(note.wikipedia.description)}</div>`:''}
      <div class="pdf-wiki-body">${renderMd(note.wikipedia.content||note.wikipedia.summary||'')}</div>
    </div>
  </section>
`;
    }

    // Flashcards (se tiver)
    const cards=note.cards||[];
    html+=`
  <section class="pdf-flashcards-section">
    <h2 class="pdf-section-title">Flashcards (${cards.length} ${cards.length===1?'cartão':'cartões'})</h2>
`;
    if(!cards.length){
      html+=`<p class="pdf-empty-text">Esta nota não possui flashcards.</p>`;
    }else{
      html+=`<div class="pdf-flashcards-list">`;
      for(let j=0;j<cards.length;j++){
        const c=cards[j];
        let pillText='→ BÁSICO',pillClass='pdf-badge-basic';
        if(c.cardType==='concept'){pillText=':: CONCEITO';pillClass='pdf-badge-concept';}
        else if(c.cardType==='two-way'){pillText='⇄ 2 VIAS';pillClass='pdf-badge-twoway';}
        else if(c.cardType==='cloze'){pillText='[...] OMISSÃO';pillClass='pdf-badge-cloze';}
        else if(c.cardType==='descriptor'){pillText=';; DESCRITOR';pillClass='pdf-badge-descriptor';}

        html+=`
      <div class="pdf-flashcard-card">
        <div class="pdf-card-top">
          <span class="pdf-card-badge ${pillClass}">${pillText}</span>
          <span class="pdf-card-num">#${j+1}</span>
        </div>
        ${c.contextBreadcrumb||c.parentPrompt?`
        <div class="pdf-card-context">
          <span class="pdf-pin">↳</span>
          <span>${escapeHtml(c.contextBreadcrumb||c.parentPrompt)}</span>
        </div>`:''}
        <div class="pdf-card-question"><strong>Pergunta:</strong> ${renderMd(c.question)}</div>
        <div class="pdf-card-divider"></div>
        <div class="pdf-card-answer"><strong>Resposta:</strong> ${renderMd(c.answer)}</div>
      </div>
`;
      }
      html+=`</div>`;
    }
    html+=`</section></div>`;
  }

  html+=`
</body>
</html>`;
  return html;
}

export async function exportBoardToPdf(view){
  if(!view?.board){
    new Notice('Nenhum whiteboard ativo encontrado para exportar.');
    return;
  }
  const app=view.app;
  const board=view.board;
  const boardTitle=board.title||view.file?.basename||'Whiteboard';

  const notePaths=collectBoardNotes(board,app);
  if(!notePaths.length){
    new Notice('Este whiteboard ainda não possui notas incorporadas para exportar.');
    return;
  }

  const notice=new Notice(`Preparando exportação de ${notePaths.length} notas em PDF…`);
  const tools=app.plugin?.reviewSourceTools?.();

  const notes=[];
  for(const path of notePaths){
    const file=app.vault.getFileByPath(path);
    if(!file)continue;
    try{
      const raw=await app.vault.read(file);
      let props={},body=raw;
      try{
        const doc=propertyDocument(raw);
        props=doc.props||{};
        body=doc.body||raw;
      }catch{
        body=raw.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
      }

      const {text}=splitNoteContent(body);
      const parsed=tools?.parseNoteFlashcards?tools.parseNoteFlashcards(raw,file.path):{cards:[]};

      notes.push({
        title:file.basename,
        path:file.path,
        summary:text.trim(),
        wikipedia:props.wikipedia||null,
        cards:parsed.cards||[]
      });
    }catch(err){
      console.warn('Erro ao ler nota para PDF:',path,err);
    }
  }

  if(!notes.length){
    new Notice('Nenhuma nota pôde ser lida para o PDF.');
    return;
  }

  const html=buildBoardPdfHtml({
    boardTitle,
    boardSummary:board.summary||'',
    notes
  });

  if(window.atlasNative?.call){
    try{
      const savedPath=await window.atlasNative.call('pdf:export',{
        html,
        title:`${boardTitle} - Resumos e Flashcards`
      });
      if(savedPath){
        const filename=savedPath.split(/[/\\]/).pop();
        new Notice(`PDF exportado com sucesso: ${filename}`);
      }
    }catch(error){
      new Notice(`Erro ao exportar PDF: ${error.message}`);
    }
  }else{
    // Fallback para navegador ou ambiente de desenvolvimento
    const printWin=window.open('','_blank');
    if(printWin){
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(()=>printWin.print(),500);
    }else{
      new Notice('A exportação em PDF requer a janela nativa do ROMUS.');
    }
  }
}
