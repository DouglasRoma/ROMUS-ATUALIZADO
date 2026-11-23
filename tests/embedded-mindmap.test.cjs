const test = require('node:test');
const assert = require('node:assert/strict');

test('EmbeddedMindMap: parseMindmapData parses valid JSON and preserves fields', async () => {
  const { parseMindmapData, serializeMindmapData } = await import('../src/embedded-mindmap.js');

  const rawJson = JSON.stringify({
    root: 'root_1',
    height: 480,
    zoom: 1.2,
    nodes: [
      { id: 'root_1', title: 'Hepatite C', color: '#38bdf8', body: 'Vírus RNA Flaviviridae' },
      { id: 'sub_1', parentId: 'root_1', title: 'Diagnóstico', color: '#34d399', body: 'Anti-HCV + PCR' },
      { id: 'sub_2', parentId: 'root_1', title: 'Tratamento', color: '#f59e0b', body: 'Sofosbuvir + Velpatasvir' }
    ]
  }, null, 2);

  const data = parseMindmapData(rawJson);
  assert.equal(data.root, 'root_1');
  assert.equal(data.height, 480);
  assert.equal(data.nodes.length, 3);
  assert.equal(data.nodes[0].title, 'Hepatite C');
  assert.equal(data.nodes[0].body, 'Vírus RNA Flaviviridae');
  assert.equal(data.nodes[1].parentId, 'root_1');
  assert.equal(data.nodes[2].title, 'Tratamento');

  const serialized = serializeMindmapData(data);
  const parsedAgain = JSON.parse(serialized);
  assert.equal(parsedAgain.root, 'root_1');
  assert.equal(parsedAgain.height, 480);
  assert.equal(parsedAgain.nodes.length, 3);
  assert.equal(parsedAgain.nodes[1].body, 'Anti-HCV + PCR');
});

test('EmbeddedMindMap: parseMindmapData supports indented Markdown outlines', async () => {
  const { parseMindmapData } = await import('../src/embedded-mindmap.js');

  const outline = [
    '# Sistema Nervoso',
    '  - Sistema Nervoso Central',
    '    - Encéfalo',
    '    - Medula Espinhal',
    '  - Sistema Nervoso Periférico',
    '    - Nervos cranianos',
    '    - Nervos espinhais'
  ].join('\n');

  const data = parseMindmapData(outline);
  assert.ok(data.nodes.length >= 7, 'Deve criar nós para todas as linhas');
  assert.equal(data.nodes[0].title, 'Sistema Nervoso');
  assert.equal(data.nodes[0].parentId, '');

  const snc = data.nodes.find(n => n.title === 'Sistema Nervoso Central');
  assert.ok(snc, 'Deve conter SNC');
  assert.equal(snc.parentId, data.nodes[0].id);

  const encefalo = data.nodes.find(n => n.title === 'Encéfalo');
  assert.ok(encefalo, 'Deve conter Encéfalo');
  assert.equal(encefalo.parentId, snc.id);
});

test('EmbeddedMindMap: calculateNodeSize sizes dynamically without text ellipsis', async () => {
  const { calculateNodeSize } = await import('../src/embedded-mindmap.js');

  const shortNode = { id: '1', title: 'Curto', color: '#38bdf8' };
  const longNode = { id: '2', title: 'Virus de la Hepatitis C (VHC) con mayor tasa de cronificación', color: '#38bdf8' };
  const nodeWithSubnote = {
    id: '3',
    title: 'Morfología',
    body: 'Pertenece a la familia Flaviviridae. Genoma ARN monocatenario de polaridad positiva.',
    color: '#34d399'
  };

  const shortSize = calculateNodeSize(shortNode, false);
  const longSize = calculateNodeSize(longNode, false);
  const subnoteSize = calculateNodeSize(nodeWithSubnote, true);

  assert.ok(longSize.w > shortSize.w, 'Nó com título longo deve ter largura maior');
  assert.ok(subnoteSize.h > shortSize.h, 'Nó com subnota deve ter altura maior para acomodar a caixa de texto');
  assert.ok(subnoteSize.bodyH > 0, 'Deve calcular altura da subnota');
});

test('EmbeddedMindMap: layoutMindmapTree positions nodes hierarchically and centers parent', async () => {
  const { layoutMindmapTree } = await import('../src/embedded-mindmap.js');

  const nodes = [
    { id: '1', title: 'Raiz', color: '#38bdf8' },
    { id: '2', parentId: '1', title: 'Filho 1', color: '#34d399' },
    { id: '3', parentId: '1', title: 'Filho 2', color: '#f59e0b' },
    { id: '4', parentId: '2', title: 'Neto 1.1', color: '#34d399' }
  ];

  const layout = layoutMindmapTree(nodes, '1');
  const pos1 = layout.positions.get('1');
  const pos2 = layout.positions.get('2');
  const pos3 = layout.positions.get('3');
  const pos4 = layout.positions.get('4');

  assert.ok(pos1 && pos2 && pos3 && pos4, 'Todas as posições devem ser calculadas');
  assert.equal(pos1.depth, 0);
  assert.equal(pos2.depth, 1);
  assert.equal(pos3.depth, 1);
  assert.equal(pos4.depth, 2);

  assert.ok(pos2.x > pos1.x, 'Filho deve estar à direita do pai');
  assert.ok(pos4.x > pos2.x, 'Neto deve estar à direita do filho');
  assert.ok(pos3.y > pos2.y, 'Irmãos devem estar espaçados verticalmente');
  assert.ok(layout.bbox.width > 200, 'Bounding box deve ser calculado');
});

test('EmbeddedMindMap: layoutMindmapTree respects collapsed branches', async () => {
  const { layoutMindmapTree } = await import('../src/embedded-mindmap.js');

  const nodes = [
    { id: '1', title: 'Raiz', color: '#38bdf8', collapsed: false },
    { id: '2', parentId: '1', title: 'Filho Recolhido', color: '#34d399', collapsed: true },
    { id: '3', parentId: '2', title: 'Neto Oculto', color: '#34d399' }
  ];

  const layout = layoutMindmapTree(nodes, '1');
  assert.ok(layout.positions.has('1'), 'Raiz deve estar visível');
  assert.ok(layout.positions.has('2'), 'Filho deve estar visível');
  assert.ok(!layout.positions.has('3'), 'Neto não deve ser posicionado quando o pai está recolhido');
});

test('EditorSlashMenu: supports /mindmap and /mapa queries', async () => {
  const slashModule = await import('../src/editor-slash.js');
  // Verify EditorSlashMenu class exists
  assert.ok(slashModule.EditorSlashMenu);

  // Read the source text of editor-slash to confirm slash command keywords
  const fs = require('node:fs');
  const code = fs.readFileSync('src/editor-slash.js', 'utf8');
  assert.ok(code.includes('mindmap'), 'Deve conter comando mindmap');
  assert.ok(code.includes('mapa'), 'Deve conter alias mapa');
  assert.ok(code.includes('git-fork'), 'Deve usar ícone git-fork');
});
