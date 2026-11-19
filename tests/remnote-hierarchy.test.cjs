const test = require('node:test');
const assert = require('node:assert/strict');
const AtlasPlugin = require('../src/engine.cjs');
const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
const { parseNoteFlashcards } = plugin.reviewSourceTools();

test('RemNote hierarchy: sub-bullets inherit parent question context without being swallowed as continuation', () => {
  const text = `
* Cual es el mecanismo de penetración de la rubéola? == Endocitosis
 * En este mecanismo de peentración, donde ocurre? == citoplasma
`;

  const parsed = parseNoteFlashcards(text, 'Notas/Rubeola.md');
  assert.equal(parsed.cards.length, 2, 'Should create 2 separate flashcards');
  
  const parent = parsed.cards[0];
  assert.equal(parent.question, 'Cual es el mecanismo de penetración de la rubéola?');
  assert.equal(parent.answer, 'Endocitosis');
  assert.equal(parent.parentPrompt, '');

  const child = parsed.cards[1];
  assert.equal(child.question, 'En este mecanismo de peentración, donde ocurre?');
  assert.equal(child.answer, 'citoplasma');
  assert.equal(child.parentPrompt, 'Cual es el mecanismo de penetración de la rubéola?');
  assert.equal(child.contextBreadcrumb, 'Cual es el mecanismo de penetración de la rubéola?');
});

test('RemNote hierarchy: multi-level hierarchy with topics and standard formats', () => {
  const text = `
- Rubéola
  - Mecanismo de penetración >> Endocitosis
    - Donde ocurre el desnudamiento viral? >> Citoplasma
`;

  const parsed = parseNoteFlashcards(text, 'Notas/Rubeola2.md');
  assert.equal(parsed.cards.length, 2);

  const card1 = parsed.cards[0];
  assert.equal(card1.question, 'Mecanismo de penetración');
  assert.equal(card1.answer, 'Endocitosis');
  assert.equal(card1.parentPrompt, 'Rubéola');
  assert.equal(card1.contextBreadcrumb, 'Rubéola');

  const card2 = parsed.cards[1];
  assert.equal(card2.question, 'Donde ocurre el desnudamiento viral?');
  assert.equal(card2.answer, 'Citoplasma');
  assert.equal(card2.parentPrompt, 'Mecanismo de penetración');
  assert.equal(card2.contextBreadcrumb, 'Rubéola > Mecanismo de penetración');
});

test('RemNote hierarchy: multiline answer continuation still works when indented line has no card separator', () => {
  const text = `
- Sintomas principais da rubéola >>
  - Exantema maculopapular
  - Febre baixa
  - Linfadenopatia retroauricular
`;

  const parsed = parseNoteFlashcards(text, 'Notas/Sintomas.md');
  assert.equal(parsed.cards.length, 1);
  assert.equal(parsed.cards[0].question, 'Sintomas principais da rubéola');
  assert.match(parsed.cards[0].answer, /Exantema maculopapular/);
  assert.match(parsed.cards[0].answer, /Linfadenopatia retroauricular/);
});
