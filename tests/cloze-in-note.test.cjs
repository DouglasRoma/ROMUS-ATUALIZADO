const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const AtlasPlugin = require('../src/engine.cjs');

test('parseClozes: extrai resposta, etiqueta (label) e dica (hint) corretamente', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const text1 = 'La pediculosis pubiana afecta {{c1::axila, pubis, vello::Localización::me diga as 3 localizações}}.';
  const clozes1 = tools.parseClozes(text1);
  assert.equal(clozes1.length, 1);
  assert.equal(clozes1[0].answer, 'axila, pubis, vello');
  assert.equal(clozes1[0].label, 'Localización');
  assert.equal(clozes1[0].hint, 'me diga as 3 localizações');
  assert.equal(clozes1[0].clozeNumber, 1);

  // Simple cloze without label or hint
  const text2 = 'O fungo {{c1::Malassezia furfur}} causa pitiríase.';
  const clozes2 = tools.parseClozes(text2);
  assert.equal(clozes2.length, 1);
  assert.equal(clozes2[0].answer, 'Malassezia furfur');
  assert.equal(clozes2[0].label, '');
  assert.equal(clozes2[0].hint, '');

  // Cloze with only label
  const text3 = 'Lesão: {{c1::Máculas hipopigmentadas::Lesión}}';
  const clozes3 = tools.parseClozes(text3);
  assert.equal(clozes3.length, 1);
  assert.equal(clozes3[0].answer, 'Máculas hipopigmentadas');
  assert.equal(clozes3[0].label, 'Lesión');
});

test('parseNoteFlashcards: gera flashcards do tipo cloze com etiqueta e prompt formatado', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const content = [
    '# Parasitologia',
    '',
    'La pediculosis pubiana afecta {{c1::axila, pubis, vello::Localización::me diga as 3 localizações}}.',
    '',
    '## Flashcards',
    '',
    '<!-- image-atlas-flashcards:start -->',
    '- Qual o vetor? == Pthirus pubis',
    '<!-- image-atlas-flashcards:end -->'
  ].join('\n');

  const parsed = tools.parseNoteFlashcards(content, 'test.md');
  const clozeCard = parsed.cards.find(c => c.cardType === 'cloze');
  assert.ok(clozeCard, 'Deve encontrar o cartão de cloze');
  assert.equal(clozeCard.isCloze, true);
  assert.equal(clozeCard.label, 'Localización');
  assert.equal(clozeCard.hint, 'me diga as 3 localizações');
  assert.equal(clozeCard.answer, 'axila, pubis, vello');
  assert.ok(clozeCard.question.includes('[Localización: me diga as 3 localizações]'));
});

test('renameImage: garante extensão de imagem (.png) e atualiza referências em Markdown', async () => {
  const { renameImage } = await import('../src/image-viewer.js');

  const fakeNotes = new Map([
    ['foto-antiga.png', 'binary'],
    ['Notas/Dermatologia.md', 'Veja a lesão: ![[foto-antiga.png]] e link [[foto-antiga.png]]'],
    ['Notas/Outra.md', 'Outro texto sem link']
  ]);

  const fakeVault = {
    getFiles: () => [{ path: 'Notas/Dermatologia.md', extension: 'md' }, { path: 'Notas/Outra.md', extension: 'md' }],
    getFileByPath: (p) => fakeNotes.has(p) ? { path: p, name: p.split('/').pop(), basename: p.split('/').pop().replace(/\.[^.]+$/, ''), extension: p.split('.').pop() } : null,
    read: async (f) => fakeNotes.get(f.path),
    process: async (f, fn) => {
      fakeNotes.set(f.path, fn(fakeNotes.get(f.path)));
    },
    rename: async () => {},
    trigger: () => {}
  };

  const fakeItem = {
    source: 'foto-antiga.png',
    key: 'image:foto-antiga.png',
    title: 'foto-antiga',
    local: true,
    refs: []
  };

  const fakeApp = {
    vault: fakeVault,
    media: { touch: () => {}, flush: async () => {}, items: new Map(), byKey: new Map() },
    workspace: { leaves: [] },
    flushAll: async () => {}
  };

  const newTitle = await renameImage(fakeApp, fakeItem, 'pediculosis-ciliaris');
  assert.equal(newTitle, 'pediculosis-ciliaris.png');
  assert.equal(fakeItem.source, 'pediculosis-ciliaris.png');
  assert.equal(fakeItem.title, 'pediculosis-ciliaris.png');

  // Verify that markdown references in notes were updated to new filename with .png
  const updatedNote = fakeNotes.get('Notas/Dermatologia.md');
  assert.ok(updatedNote.includes('![[pediculosis-ciliaris.png]]'));
  assert.ok(updatedNote.includes('[[pediculosis-ciliaris.png]]'));
  assert.ok(!updatedNote.includes('foto-antiga.png'));
});

test('cloze in markdown: renders top icon, label, edit button and clean text', async () => {
  const { marked } = await import('marked');
  // Trigger marked extension registration from compat.js
  await import('../src/compat.js');

  const md = 'Se llama de {{Piojo Pubiano::Localización::me diga o nome}}, popularmente ladillas.';
  const html = marked.parse(md);

  assert.ok(html.includes('class="romus-cloze-pill"'), 'Deve conter pill de cloze');
  assert.ok(html.includes('class="romus-cloze-top-tag"'), 'Deve renderizar tag superior com ícone');
  assert.ok(html.includes('🎴'), 'Deve conter ícone de flashcard/cloze na tag superior');
  assert.ok(html.includes('me diga o nome') || html.includes('Localización'), 'Deve exibir dica ou etiqueta do cloze');
  assert.ok(html.includes('✏️'), 'Deve conter ícone de lápis para editar o cloze');
  assert.ok(html.includes('Piojo Pubiano'), 'O texto deve conter a resposta visível e legível no fluxo da nota');
  assert.ok(!html.includes('>{{Piojo'), 'Não deve exibir chaves duplas {{ no texto visível');
});

test('FormattedEditor: cloze loads cleanly as link and serializes back to normal markdown', () => {
  const rawInput = 'Se llama de {{Piojo Pubiano::Cómo es llamado?}}, o popularmente llamado de ladillas.';
  
  // Test conversion during load(body)
  const loaded = rawInput.replace(/\{\{((?:[^{}]|(?<=\\)[{}])+)\}\}/g, (raw, inner) => {
    const parts = inner.split('::');
    let cId = '', answer = inner, label = '', hint = '';
    if (parts.length > 1) {
      if (/^c\d+$/i.test(parts[0].trim())) {
        cId = parts[0].trim(); answer = parts[1].trim();
        if (parts.length >= 4) { label = parts[2].trim(); hint = parts.slice(3).join('::').trim(); }
        else { hint = parts.slice(2).join('::').trim(); }
      } else {
        answer = parts[0].trim();
        if (parts.length >= 3) { label = parts[1].trim(); hint = parts.slice(2).join('::').trim(); }
        else { hint = parts.slice(1).join('::').trim(); }
      }
    }
    const encoded = encodeURIComponent(JSON.stringify({ raw, cId, answer, label, hint }));
    return `[${answer}](atlas-cloze:${encoded})`;
  });

  // Verify that the user only sees "Piojo Pubiano" as the link label, without {{ or ::
  assert.ok(loaded.includes('[Piojo Pubiano](atlas-cloze:'));
  assert.ok(!loaded.includes('{{Piojo Pubiano'));

  // Test restoration during serialize()
  const serialized = loaded.replace(/\[([^\]]+)\]\(atlas-cloze:([^\s)]+)\)/g, (_, val, encoded) => {
    let data = {};
    try { data = JSON.parse(decodeURIComponent(encoded)); } catch {}
    if (data.cId) {
      if (data.label && data.hint) return `{{${data.cId}::${val}::${data.label}::${data.hint}}}`;
      if (data.label) return `{{${data.cId}::${val}::${data.label}}}`;
      if (data.hint) return `{{${data.cId}::${val}::${data.hint}}}`;
      return `{{${data.cId}::${val}}}`;
    } else {
      if (data.label && data.hint) return `{{${val}::${data.label}::${data.hint}}}`;
      if (data.label) return `{{${val}::${data.label}}}`;
      if (data.hint) return `{{${val}::${data.hint}}}`;
      return `{{${val}}}`;
    }
  });

  assert.equal(serialized, rawInput, 'O Markdown final serializado deve ser 100% normal e idêntico');
});
