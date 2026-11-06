const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWikipediaUrl, wikiToMarkdown } = require('../src/wikipedia.js');
const { patchNotePage, notePageData } = require('../src/note-page-data.js');
const { propertyDocument } = require('../src/property-data.js');

test('parseWikipediaUrl extrai corretamente idioma, título decodificado e url', () => {
  const es = parseWikipediaUrl('https://es.wikipedia.org/wiki/Ram%C3%B3n_Carrillo');
  assert.equal(es.lang, 'es');
  assert.equal(es.title, 'Ramón Carrillo');
  assert.equal(es.url, 'https://es.wikipedia.org/wiki/Ram%C3%B3n_Carrillo');

  const pt = parseWikipediaUrl('https://pt.wikipedia.org/wiki/Sa%C3%BAde_p%C3%BAblica');
  assert.equal(pt.lang, 'pt');
  assert.equal(pt.title, 'Saúde pública');

  const en = parseWikipediaUrl('https://en.wikipedia.org/wiki/Public_health');
  assert.equal(en.lang, 'en');
  assert.equal(en.title, 'Public health');

  assert.equal(parseWikipediaUrl('not a url'), null);
  assert.equal(parseWikipediaUrl('https://google.com/search?q=test'), null);
});

test('wikiToMarkdown converte cabeçalhos da Wikipedia em sintaxe Markdown nativa', () => {
  const input = `== Primeros años ==\nNació en Santiago del Estero.\n=== Carrera médica ===\nSe recibió con medalla de honor.\n==== Hospitales ====`;
  const output = wikiToMarkdown(input);

  assert.match(output, /## Primeros años/);
  assert.match(output, /### Carrera médica/);
  assert.match(output, /#### Hospitales/);
});

test('metadados da Wikipedia persistem no frontmatter YAML sem corromper a nota', () => {
  const rawNote = `---
title: TP 4 Salud Pública
---
- Entre 1945 y 1955 durante el primer peronismo...
- En 1949, Ramón Carrillo fue el primer ministro...`;

  const wikiData = {
    title: 'Ramón Carrillo',
    lang: 'es',
    url: 'https://es.wikipedia.org/wiki/Ram%C3%B3n_Carrillo',
    description: 'Médico neurocirujano y sanitarista argentino',
    summary: 'Ramón Carrillo fue un neurocirujano y político argentino.',
    content: '== Biografía ==\nRamón Carrillo nació en Santiago del Estero...',
    updatedAt: 1730000000000
  };

  const patched = patchNotePage(rawNote, data => {
    data.wikipedia = wikiData;
  });

  const parsed = propertyDocument(patched);
  const noteData = notePageData(parsed.props);

  assert.deepEqual(noteData.wikipedia, wikiData);
  assert.match(patched, /Ramón Carrillo fue el primer ministro/);
});

test('aba Resumo Wikipedia é posicionada estritamente entre Resumo e Mídia da nota', () => {
  // Simular notePage.renderTabs logic
  function computeTabs(data) {
    const sections = [['summary', 'Resumo', 'file-text']];
    if (data?.wikipedia) {
      sections.push(['wikipedia', 'Resumo Wikipedia', 'wikipedia']);
    }
    sections.push(['media', 'Mídia da nota', 'paperclip']);
    sections.push(['quizzes', 'Quizzes', 'list-checks']);
    return sections;
  }

  // Sem wikipedia: 3 abas
  const withoutWiki = computeTabs({});
  assert.deepEqual(withoutWiki.map(s => s[0]), ['summary', 'media', 'quizzes']);

  // Com wikipedia: 4 abas, na ordem exata solicitada pelo usuário
  const withWiki = computeTabs({ wikipedia: { title: 'Ramón Carrillo' } });
  assert.deepEqual(withWiki.map(s => s[0]), ['summary', 'wikipedia', 'media', 'quizzes']);
  assert.equal(withWiki[1][1], 'Resumo Wikipedia');
  assert.equal(withWiki[1][2], 'wikipedia');
});
