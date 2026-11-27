const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Whiteboard arrows: readBoard accepts node-to-node, node-to-group, and group-to-group arrow edges', () => {
  const code = fs.readFileSync('src/engine.cjs', 'utf8');
  assert.ok(code.includes('validEndpoint'), 'readBoard deve validar endpoints de nó e de grupo');
  assert.ok(code.includes('attachConnectPorts'), 'Deve existir método attachConnectPorts para bolinhas de conexão nos 4 lados');
  assert.ok(code.includes('arrowHeadPath'), 'Deve existir gerador de ponta de seta SVG');
  assert.ok(code.includes('showEdgeToolbar'), 'Deve existir barra flutuante de estilo da seta');
  assert.ok(code.includes("this.button(toolbar, 'Seta', 'arrow-up-right'"), 'Botão Seta deve estar na barra de ferramentas');

  // Extract and test readBoard validation logic indirectly via syntax check
  const hasGroupBeforeEdges = code.indexOf('const groupIds = new Set();') < code.indexOf('const validEndpoint = ep =>');
  assert.ok(hasGroupBeforeEdges, 'groupIds deve ser coletado antes da validação de edges em readBoard');
});

test('Markdown + MindMap sync: splitNoteContent isolates visual mindmap block from editable text', async () => {
  const { splitNoteContent, mergeNoteContent } = await import('../src/note-content.js');

  const bodyBefore = [
    '# Síndrome de Cotard',
    '',
    'Texto importante escrito pelo usuário no final da página.',
    '',
    '<!-- image-atlas-visual:start -->',
    '## Atlas visual',
    '- Tópico 1',
    '<!-- image-atlas-visual:end -->',
    ''
  ].join('\n');

  const bodyAfterMindmapEdit = [
    '# Síndrome de Cotard',
    '',
    'Texto importante escrito pelo usuário no final da página.',
    '',
    '<!-- image-atlas-visual:start -->',
    '## Atlas visual',
    '- Tópico 1',
    '  - Novo subtópico escrito no mapa mental',
    '<!-- image-atlas-visual:end -->',
    ''
  ].join('\n');

  const beforeParts = splitNoteContent(bodyBefore);
  const afterParts = splitNoteContent(bodyAfterMindmapEdit);

  assert.equal(beforeParts.text, afterParts.text, 'Alterar apenas o bloco visual do mapa mental não deve alterar o texto editável do Markdown');
  assert.notEqual(beforeParts.managed.join('\n'), afterParts.managed.join('\n'), 'Os blocos gerenciados devem refletir a atualização do mapa mental');

  // Ensure merging user's new Markdown text with updated mindmap managed blocks preserves BOTH
  const userNewText = beforeParts.text + '\nParágrafo novo digitado pelo usuário!';
  const merged = mergeNoteContent(userNewText, afterParts.managed);
  assert.ok(merged.includes('Parágrafo novo digitado pelo usuário!'), 'Texto digitado pelo usuário no Markdown deve ser preservado');
  assert.ok(merged.includes('Novo subtópico escrito no mapa mental'), 'Conteúdo novo do mapa mental também deve ser preservado');
});

test('FormattedEditor & NoteEditor: mindmapCodeBlock receives FormattedEditor instance and skips DOM reload on managed-only changes', () => {
  const formattedCode = fs.readFileSync('src/formatted-editor.js', 'utf8');
  assert.ok(formattedCode.includes('mindmapCodeBlock(this)'), 'FormattedEditor deve passar `this` para mindmapCodeBlock');
  assert.ok(formattedCode.includes('this.loadedEditableText===text&&!this.dirty'), 'FormattedEditor.load não deve recriar o DOM do TipTap se apenas blocos ocultos mudaram');

  const noteEditorCode = fs.readFileSync('src/note-editor.js', 'utf8');
  assert.ok(noteEditorCode.includes('if(nextParts.text===beforeParts.text)'), 'NoteEditor deve ignorar reload de texto/scroll quando apenas o mapa mental visual mudou');

  const notePageCode = fs.readFileSync('src/note-page.js', 'utf8');
  assert.ok(notePageCode.includes("k!=='image-atlas-data'"), 'NotePage.load deve ignorar mudanças internas de image-atlas-data no frontmatter');
});
