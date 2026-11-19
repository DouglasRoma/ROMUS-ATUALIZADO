const test = require('node:test');
const assert = require('node:assert/strict');
const AtlasPlugin = require('../src/engine.cjs');
const {
  noteFlashcardBlock,
  writeNoteFlashcardBlock,
  normalizeFlashcardsToBullets,
  NOTE_CARDS_START,
  NOTE_CARDS_END
} = require('../src/note-content.js');

test('RemNote: parseNoteFlashcards suporta cartões básicos (>> e setas)', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
- Pergunta um >> Resposta um
- Pergunta dois -> Resposta dois
- Pergunta três --> Resposta três
- Pergunta quatro ==> Resposta quatro
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 4);
  assert.equal(res.cards[0].question, 'Pergunta um');
  assert.equal(res.cards[0].answer, 'Resposta um');
  assert.equal(res.cards[0].cardType, 'basic');
  assert.equal(res.cards[0].format, '>>');

  assert.equal(res.cards[1].question, 'Pergunta dois');
  assert.equal(res.cards[1].answer, 'Resposta dois');
  assert.equal(res.cards[1].cardType, 'basic');
});

test('RemNote: parseNoteFlashcards suporta conceitos (::) sem confundir com links nem clozes', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
- ACV isquêmico :: Obstrução arterial que reduz o fluxo cerebral
- Link [[Nota::Composta]] :: Explicação válida com https://site.com
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 2);
  assert.equal(res.cards[0].question, 'ACV isquêmico');
  assert.equal(res.cards[0].answer, 'Obstrução arterial que reduz o fluxo cerebral');
  assert.equal(res.cards[0].cardType, 'concept');
  assert.equal(res.cards[0].format, '::');

  assert.equal(res.cards[1].question, 'Link [[Nota::Composta]]');
  assert.equal(res.cards[1].answer, 'Explicação válida com https://site.com');
});

test('RemNote: parseNoteFlashcards suporta bidirecional (::: e <>>) gerando 2 cartões (frente e verso)', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
- Hipertensão ::: Pressão arterial elevada persistente
- Stroke <>> ACV
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 4); // 2 cards cada

  // Hipertensão ::: Pressão arterial
  assert.equal(res.cards[0].question, 'Hipertensão');
  assert.equal(res.cards[0].answer, 'Pressão arterial elevada persistente');
  assert.equal(res.cards[0].cardType, 'two-way');
  assert.equal(res.cards[0].direction, 'forward');

  assert.equal(res.cards[1].question, 'Pressão arterial elevada persistente');
  assert.equal(res.cards[1].answer, 'Hipertensão');
  assert.equal(res.cards[1].cardType, 'two-way');
  assert.equal(res.cards[1].direction, 'reverse');
  assert.match(res.cards[1].id, /:rev$/);

  // Stroke <>> ACV
  assert.equal(res.cards[2].question, 'Stroke');
  assert.equal(res.cards[2].answer, 'ACV');
  assert.equal(res.cards[3].question, 'ACV');
  assert.equal(res.cards[3].answer, 'Stroke');
});

test('RemNote: parseNoteFlashcards suporta omissão de palavras (cloze {{...}})', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
- O ACV isquêmico representa {{80-85%}} dos acidentes vasculares.
- A artéria mais acometida é a {{c1::artéria cerebral média::artéria}}.
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 2);

  // Cloze 1
  assert.equal(res.cards[0].question, 'O ACV isquêmico representa [...] dos acidentes vasculares.');
  assert.equal(res.cards[0].answer, '80-85%');
  assert.equal(res.cards[0].cardType, 'cloze');

  // Cloze 2 com hint
  assert.equal(res.cards[1].question, 'A artéria mais acometida é a [artéria].');
  assert.equal(res.cards[1].answer, 'artéria cerebral média');
  assert.equal(res.cards[1].cardType, 'cloze');
});

test('RemNote: parseNoteFlashcards suporta descritor (;;) e cartões de lista com filhos indentados', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
- Escala de Cincinnati ;; Avalia paralisia facial, queda do braço e fala
- Tipos de ACV >>
  - ACV isquêmico (80-85%)
  - ACV hemorrágico (15-20%)
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 2);

  assert.equal(res.cards[0].question, 'Escala de Cincinnati');
  assert.equal(res.cards[0].answer, 'Avalia paralisia facial, queda do braço e fala');
  assert.equal(res.cards[0].cardType, 'descriptor');

  assert.equal(res.cards[1].question, 'Tipos de ACV');
  assert.equal(res.cards[1].answer, '- ACV isquêmico (80-85%)\n- ACV hemorrágico (15-20%)');
});

test('Compatibilidade: preserva formato existente (==) com e sem bullets e não quebra FSRS', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const text = `
<!-- image-atlas-flashcards:start -->
Pergunta sem bullet == Resposta sem bullet
- Pergunta com bullet == Resposta com bullet
  Linha de continuação
<!-- image-atlas-flashcards:end -->
`;
  const res = tools.parseNoteFlashcards(text, 'Nota.md');
  assert.equal(res.cards.length, 2);
  assert.equal(res.cards[0].question, 'Pergunta sem bullet');
  assert.equal(res.cards[0].answer, 'Resposta sem bullet');

  assert.equal(res.cards[1].question, 'Pergunta com bullet');
  assert.equal(res.cards[1].answer, 'Resposta com bullet\nLinha de continuação');
});

test('normalizeFlashcardsToBullets transforma linhas legadas em bullets sem alterar o texto', () => {
  const raw = `Qué es el ACV? == Lesión neurológica.
En la epidemiología? == Segunda causa de muerte.
- Já tinha bullet >> Resposta preservada.
  Continuação indentada`;

  const normalized = normalizeFlashcardsToBullets(raw);
  const expected = `- Qué es el ACV? == Lesión neurológica.
- En la epidemiología? == Segunda causa de muerte.
- Já tinha bullet >> Resposta preservada.
  Continuação indentada`;

  assert.equal(normalized, expected);
});

test('serializeFlashcardRows gera saída limpa em bullets (-)', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();
  
  const rows = [
    { question: 'Pergunta 1', answer: 'Resposta 1', format: '>>' },
    { question: 'Conceito 2', answer: 'Definição 2', format: '::' },
    { question: 'Pergunta 3', answer: 'Resposta 3', format: '==' },
    { question: 'Lista 4', answer: '- Item A\n- Item B', format: '>>' }
  ];

  const serialized = tools.serializeFlashcardRows(rows);
  assert.equal(serialized, `- Pergunta 1 >> Resposta 1
- Conceito 2 :: Definição 2
- Pergunta 3 == Resposta 3
- Lista 4 >>
  - Item A
  - Item B`);
});

test('writeNoteFlashcardBlock e noteFlashcardBlock gerenciam o bloco de flashcards de forma segura', () => {
  const note = `# Título

Corpo da nota aqui.
`;
  const cards = `- Pergunta >> Resposta
- Conceito :: Definição`;

  const updated = writeNoteFlashcardBlock(note, null, cards);
  assert(updated.includes(NOTE_CARDS_START));
  assert(updated.includes(NOTE_CARDS_END));
  assert(updated.includes('## Flashcards'));

  const block = noteFlashcardBlock(updated);
  assert.equal(block.source, cards);
  assert.notEqual(block.original, null);

  const modified = writeNoteFlashcardBlock(updated, block.original, `- Pergunta editada >> Resposta nova`);
  const block2 = noteFlashcardBlock(modified);
  assert.equal(block2.source, `- Pergunta editada >> Resposta nova`);
});
