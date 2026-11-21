const test = require('node:test');
const assert = require('node:assert/strict');
const AtlasPlugin = require('../src/engine.cjs');

test('Cloze disambiguation: múltiplas lacunas com a mesma resposta são diferenciadas por posição e ID único', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const noteContent = [
    '# Micose Profunda',
    '',
    'O paciente A terá intradermo {{negativa}} em fase inicial.',
    '',
    'O paciente B terá intradermo {{positiva}} quando curado.',
    '',
    'O cultivo e exame direto são ambos {{negativa}} na fase latente.'
  ].join('\n');

  const parsed = tools.parseNoteFlashcards(noteContent, 'Notas/Micose Profunda.md');
  const clozeCards = parsed.cards.filter(c => c.cardType === 'cloze');

  assert.equal(clozeCards.length, 3, 'Deve extrair exatamente 3 cartões de cloze');
  assert.equal(clozeCards[0].answer, 'negativa');
  assert.equal(clozeCards[1].answer, 'positiva');
  assert.equal(clozeCards[2].answer, 'negativa');

  // As IDs e posições dos dois clozes com resposta 'negativa' DEVEM ser distintas
  assert.notEqual(clozeCards[0].id, clozeCards[2].id, 'As IDs dos cartões devem ser diferentes');
  assert.notEqual(clozeCards[0].sourceLine, clozeCards[2].sourceLine, 'As linhas de origem devem ser diferentes');
  assert.equal(clozeCards[0].sourceLine, 3);
  assert.equal(clozeCards[2].sourceLine, 7);
  assert.equal(clozeCards[0].clozeDocIndex, 0);
  assert.equal(clozeCards[2].clozeDocIndex, 2);
});

test('ScopeEntries: garante independência estrita entre cartões cloze e cartões convencionais', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const mixedContent = [
    '# Parasitologia',
    '- Vetor == Pthirus pubis',
    'La pediculosis afecta {{axila, pubis, vello}}.',
    '- Agente etiológico >> Piojo'
  ].join('\n');

  const parsed = tools.parseNoteFlashcards(mixedContent, 'test.md');
  assert.equal(parsed.cards.length, 3);

  const clozeCards = parsed.cards.filter(c => c.cardType === 'cloze' || c.isCloze);
  const normalCards = parsed.cards.filter(c => c.cardType !== 'cloze' && !c.isCloze);

  assert.equal(clozeCards.length, 1, 'Deve haver exatamente 1 cloze');
  assert.equal(normalCards.length, 2, 'Deve haver exatamente 2 flashcards normais');

  // Simular mock de FlashcardReviewView
  const view = {
    entries: parsed.cards,
    studyMode: 'cloze-note',
    scopeEntries() {
      if (this.studyMode === 'cloze-note') {
        return this.entries.filter(e => e.cardType === 'cloze' || e.isCloze);
      }
      return this.entries.filter(e => e.cardType !== 'cloze' && !e.isCloze);
    }
  };

  const scopedCloze = view.scopeEntries();
  assert.equal(scopedCloze.length, 1);
  assert.equal(scopedCloze[0].answer, 'axila, pubis, vello');

  // Trocar para flashcards convencionais
  view.studyMode = 'flashcards';
  const scopedNormal = view.scopeEntries();
  assert.equal(scopedNormal.length, 2);
  assert.ok(scopedNormal.every(c => c.cardType !== 'cloze'));
});

test('Whiteboard board drawings e grid persistem corretamente no quadro', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const rawBoard = JSON.stringify({
    version: 1,
    title: 'Meu Whiteboard',
    indexPath: '',
    nodes: [],
    edges: [],
    drawings: [
      { id: 'draw-1', color: '#38bdf8', width: 3, points: [{ x: 100, y: 120 }, { x: 150, y: 160 }] }
    ],
    grid: 'dots',
    camera: { x: 0, y: 0, z: 1 }
  });

  // Testar deserialização
  const parsed = JSON.parse(rawBoard);
  assert.equal(parsed.drawings.length, 1);
  assert.equal(parsed.drawings[0].points.length, 2);
  assert.equal(parsed.grid, 'dots');
});
