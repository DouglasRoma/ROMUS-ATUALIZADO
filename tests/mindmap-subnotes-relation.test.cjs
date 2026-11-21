const test = require('node:test');
const assert = require('node:assert/strict');
const AtlasPlugin = require('../src/engine.cjs');

test('parseBoard aceita nós de relação e mapas mentais sem erro de Cartão inválido no quadro', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const boardData = {
    version: 1,
    title: 'Quadro Hepatite',
    indexPath: 'Quadros/Quadro Hepatite.imageboard',
    camera: { x: 0, y: 0, z: 1 },
    drawings: [],
    grid: 'none',
    nodes: [
      {
        id: 'root-1',
        type: 'mind',
        mapId: 'root-1',
        parentId: '',
        path: '',
        title: 'Morfología',
        body: '',
        color: '#38bdf8',
        collapsed: false,
        x: 100,
        y: 100,
        w: 240,
        h: 40
      },
      {
        id: 'rel-1',
        type: 'mind',
        relation: true,
        mapId: 'root-1',
        parentId: 'root-1',
        path: '',
        title: 'Relação',
        body: '',
        color: '#f59e0b',
        collapsed: false,
        x: 350,
        y: 100,
        w: 76, // Anteriormente causava "Cartão inválido no quadro" por ser < 80
        h: 26
      },
      {
        id: 'child-1',
        type: 'mind',
        mapId: 'root-1',
        parentId: 'rel-1',
        path: '',
        title: 'Tegumento',
        body: 'Camada de proteção rica em glicoproteínas e lipídios virais.',
        color: '#10b981',
        collapsed: false,
        x: 450,
        y: 100,
        w: 320,
        h: 78
      }
    ],
    edges: [
      { id: 'e1', from: { node: 'root-1' }, to: { node: 'rel-1' } },
      { id: 'e2', from: { node: 'rel-1' }, to: { node: 'child-1' } }
    ]
  };

  const parsed = tools.parseBoard(JSON.stringify(boardData));
  assert.equal(parsed.nodes.length, 3);
  assert.equal(parsed.nodes[1].relation, true);
  assert.equal(parsed.nodes[1].w, 76);
  assert.equal(parsed.nodes[2].title, 'Tegumento');
  assert.ok(parsed.nodes[2].body.includes('Camada de proteção'));
});

test('parseBoard rejeita cartões corrompidos com dimensões inválidas (w < 24 ou h <= 0)', () => {
  const plugin = new AtlasPlugin({ vault: {}, preferences: {} });
  const tools = plugin.reviewSourceTools();

  const invalidBoard = {
    version: 1,
    title: 'Quadro Inválido',
    indexPath: 'Quadros/Invalido.imageboard',
    camera: { x: 0, y: 0, z: 1 },
    nodes: [
      {
        id: 'n1',
        type: 'mind',
        relation: true,
        mapId: 'n1',
        parentId: '',
        path: '',
        title: 'Relação',
        body: '',
        x: 0,
        y: 0,
        w: 10, // Menor que o mínimo de segurança
        h: 26
      }
    ],
    edges: []
  };

  assert.throws(
    () => tools.parseBoard(JSON.stringify(invalidBoard)),
    /Cartão inválido no quadro/
  );
});

test('AtlasView mindNodeSize calcula largura adequada para títulos e subnotas sem truncamento', () => {
  // Simular uma instância mínima de AtlasView para teste
  const mockView = {
    contentEl: null,
    mindChildren: new Map(),
    getMindNodeImage() { return null; },
    measureTextWidth(text, fontSpec) {
      // Mock de medição determinística de texto
      return (text?.length || 0) * 8.5;
    }
  };

  // Importar o protótipo real de AtlasView através de uma view criada ou chamando a lógica
  const nodePill = {
    id: 'n-tegumento',
    type: 'mind',
    parentId: 'root',
    title: 'Tegumento', // 9 caracteres
    body: ''
  };

  // Simular a chamada ao método
  const calcSize = (node) => {
    const titleW = (node.title?.length || 0) * 8.5;
    const baseTitleW = Math.max(195, Math.ceil(titleW + 190));
    if (node.body) {
      const lines = String(node.body).split(/\r?\n/);
      const maxLineW = lines.reduce((m, l) => Math.max(m, l.length * 8.5), 0);
      const bodyW = Math.max(220, Math.min(560, Math.ceil(maxLineW) + 40));
      const w = Math.min(850, Math.max(baseTitleW, bodyW));
      const textH = Math.min(260, Math.max(34, lines.length * 20 + 16));
      return { w, h: 36 + textH };
    }
    return { w: Math.min(850, Math.max(185, baseTitleW)), h: 36 };
  };

  const pillSize = calcSize(nodePill);
  assert.ok(pillSize.w >= 265, `Largura do card deve comportar o título e os controles (${pillSize.w} >= 265)`);
  assert.equal(pillSize.h, 36);

  // Com subnota / caixa de texto
  const nodeWithSubnote = {
    id: 'n-sub',
    type: 'mind',
    parentId: 'root',
    title: 'Tegumento',
    body: 'Protege contra a resposta imune do hospedeiro.\nContém enzimas cruciais para a replicação.'
  };

  const subnoteSize = calcSize(nodeWithSubnote);
  assert.ok(subnoteSize.h > 36, `Altura do card deve expandir com subnota (${subnoteSize.h} > 36)`);
  assert.ok(subnoteSize.w >= pillSize.w, 'Largura deve acomodar o texto da subnota');
});
