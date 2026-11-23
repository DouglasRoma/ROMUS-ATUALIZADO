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

test('EmbeddedMindMap: parseMindmapData never parses JSON keys as outline nodes even with code fences', async () => {
  const { parseMindmapData } = await import('../src/embedded-mindmap.js');

  const fencedJson = [
    '```mindmap',
    '{',
    '  "root": "1",',
    '  "height": 400,',
    '  "nodes": [',
    '    { "id": "1", "title": "Tópico Central", "color": "#38bdf8" },',
    '    { "id": "2", "parentId": "1", "title": "Subtópico 1", "color": "#34d399" },',
    '    { "id": "3", "parentId": "1", "title": "Subtópico 2", "color": "#f59e0b" }',
    '  ]',
    '}',
    '```'
  ].join('\n');

  const data = parseMindmapData(fencedJson);
  assert.equal(data.nodes.length, 3, 'Deve conter exatamente os 3 nós do JSON');
  assert.equal(data.nodes[0].title, 'Tópico Central');
  assert.equal(data.nodes[1].title, 'Subtópico 1');
  assert.equal(data.nodes[2].title, 'Subtópico 2');

  // Verify that JSON keys are NEVER created as nodes
  const nodeTitles = data.nodes.map(n => n.title);
  assert.ok(!nodeTitles.includes('root'), 'Não deve criar nó para a chave "root"');
  assert.ok(!nodeTitles.includes('height'), 'Não deve criar nó para a chave "height"');
  assert.ok(!nodeTitles.includes('{'), 'Não deve criar nó para "{"');
  assert.ok(!nodeTitles.includes('}'), 'Não deve criar nó para "}"');
});

test('EmbeddedMindMap: calculateNodeSize guarantees room for full text and controls without 480px limit', async () => {
  const { calculateNodeSize } = await import('../src/embedded-mindmap.js');

  const longTitleNode = {
    id: '1',
    title: 'Fisiopatologia da resposta imune celular mediada por linfócitos T CD4 e CD8 na infecção crônica',
    color: '#38bdf8'
  };

  const size = calculateNodeSize(longTitleNode, true);
  assert.ok(size.w > 480, 'Nó com título longo deve ultrapassar 480px para não cortar texto');
  assert.ok(size.pillH >= 36, 'Altura da pílula deve acomodar a tipografia');
});

test('EmbeddedMindMap: sibling of root adds child of root seamlessly', async () => {
  const origDoc = global.document;
  const makeEl = (tag, o = {}) => {
    const el = {
      tagName: (tag || 'DIV').toUpperCase(),
      dataset: {},
      value: o.value !== undefined ? o.value : '',
      placeholder: o.attr?.placeholder || '',
      classList: { add() {}, remove() {}, toggle() {} },
      style: { setProperty() {} },
      createSpan: (opts) => makeEl('span', opts),
      createDiv: (opts) => makeEl('div', opts),
      createEl: (t, opts) => makeEl(t, opts),
      appendChild: () => ({}),
      setAttribute: (k, v) => { el[k] = v; },
      replaceChildren: () => {},
      remove: () => {},
      focus: () => {},
      select: () => {},
      setSelectionRange: () => {},
      querySelector: () => makeEl('div'),
      querySelectorAll: () => [],
      getContext: () => ({
        measureText: (t) => ({ width: (t || '').length * 8.5 })
      })
    };
    return el;
  };

  global.document = {
    createElement: makeEl,
    createElementNS: makeEl
  };

  const { EmbeddedMindMap } = await import('../src/embedded-mindmap.js');

  const container = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    createDiv: () => makeEl('div'),
    addEventListener: () => {},
    focus: () => {}
  };

  try {
    const map = new EmbeddedMindMap(container, {
      data: JSON.stringify({
        root: '1',
        nodes: [{ id: '1', title: 'Raiz', color: '#38bdf8' }]
      })
    });

    const child = map.addNode('1', true);
    assert.ok(child, 'Deve criar o nó');
    assert.equal(child.parentId, '1', 'Deve ser filho da raiz');
    assert.equal(child.title, 'Novo tópico', 'Título inicial deve ser Novo tópico');
    assert.ok(map.inlineRename, 'Deve ativar modo de renomeação imediatamente');
    assert.equal(map.inlineRename.nodeId, child.id, 'Renomeação deve ser para o novo nó');
    assert.equal(map.inlineRename.input.value, '', 'Valor inicial do input deve ser vazio para digitação direta');
    assert.equal(map.inlineRename.input.placeholder, 'Novo tópico', 'Placeholder deve indicar Novo tópico');

    // Simula usuário digitando "Patologia" e pressionando Enter / confirmando
    map.inlineRename.input.value = 'Patologia';
    map.inlineRename.finish();
    assert.equal(child.title, 'Patologia', 'Título deve ser atualizado para Patologia');
    assert.equal(map.inlineRename, null, 'Renomeação deve ser finalizada');
  } finally {
    global.document = origDoc;
  }
});

test('EmbeddedMindMap: fluid navigation with Tab, Enter and direct typing', async () => {
  const origDoc = global.document;
  const makeEl = (tag, o = {}) => {
    let _val = o.value !== undefined ? o.value : '';
    const el = {
      tagName: (tag || 'DIV').toUpperCase(),
      dataset: {},
      get value() { return _val; },
      set value(v) { _val = v; },
      placeholder: o.attr?.placeholder || '',
      isConnected: true,
      classList: { add() {}, remove() {}, toggle() {} },
      style: { setProperty() {} },
      createSpan: (opts) => makeEl('span', opts),
      createDiv: (opts) => makeEl('div', opts),
      createEl: (t, opts) => makeEl(t, opts),
      appendChild: () => ({}),
      setAttribute: (k, v) => { el[k] = v; },
      replaceChildren: () => {},
      remove: () => { el.isConnected = false; },
      focus: () => {},
      select: () => { el.selected = true; },
      setSelectionRange: () => {},
      querySelector: () => makeEl('div'),
      querySelectorAll: () => [],
      getContext: () => ({
        measureText: (t) => ({ width: (t || '').length * 8.5 })
      })
    };
    return el;
  };

  global.document = {
    createElement: makeEl,
    createElementNS: makeEl
  };

  const { EmbeddedMindMap } = await import('../src/embedded-mindmap.js');

  const containerListeners = {};
  const container = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    createDiv: () => makeEl('div'),
    addEventListener: (evt, fn) => { containerListeners[evt] = fn; },
    focus: () => {},
    closest: () => null
  };

  try {
    const map = new EmbeddedMindMap(container, {
      data: JSON.stringify({
        root: '1',
        nodes: [{ id: '1', title: 'Cardiologia', color: '#38bdf8' }]
      })
    });

    // 1. Direct character typing on selected node
    map.selectNode('1');
    containerListeners['keydown']({
      key: 'M',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: container,
      preventDefault() {},
      stopPropagation() {}
    });

    assert.ok(map.inlineRename, 'Digitação direta em nó selecionado deve abrir renomeação imediatamente');
    assert.equal(map.inlineRename.input.value, 'M', 'Primeiro caractere deve ser colocado no input');
    map.inlineRename.finish();

    // 2. Tab creates child and enters rename mode
    map.selectNode('1');
    containerListeners['keydown']({
      key: 'Tab',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: container,
      preventDefault() {},
      stopPropagation() {}
    });

    assert.ok(map.inlineRename, 'Tab deve criar nó filho e abrir renomeação imediatamente');
    const childId = map.inlineRename.nodeId;
    assert.notEqual(childId, '1', 'Deve ser o novo nó filho');
    assert.equal(map.inlineRename.input.value, '', 'Input do novo nó deve estar limpo para digitação imediata');
    assert.equal(map.inlineRename.input.placeholder, 'Novo tópico', 'Placeholder deve ser Novo tópico');

    // Usuário digita "Insuficiência Cardíaca" e aperta Tab no próprio input para criar neto
    map.inlineRename.input.value = 'Insuficiência Cardíaca';
    const inputKeydown = map.inlineRename.input.onkeydown;
    inputKeydown({
      key: 'Tab',
      stopPropagation() {},
      preventDefault() {}
    });

    // O filho deve ter o título salvo e agora estamos renomeando o neto!
    const childNode = map.data.nodes.find(n => n.id === childId);
    assert.equal(childNode.title, 'Insuficiência Cardíaca', 'Título do filho deve ser salvo ao pressionar Tab');
    assert.ok(map.inlineRename, 'Tab dentro do input deve criar e focar o próximo nó filho');
    const grandsonId = map.inlineRename.nodeId;
    const grandsonNode = map.data.nodes.find(n => n.id === grandsonId);
    assert.equal(grandsonNode.parentId, childId, 'Neto deve ser filho de Insuficiência Cardíaca');

    // Usuário digita "FEVE reduzida" e aperta Enter para criar irmão do neto
    map.inlineRename.input.value = 'FEVE reduzida';
    const grandsonKeydown = map.inlineRename.input.onkeydown;
    grandsonKeydown({
      key: 'Enter',
      stopPropagation() {},
      preventDefault() {}
    });

    assert.equal(grandsonNode.title, 'FEVE reduzida', 'Título do neto deve ser salvo ao pressionar Enter');
    assert.ok(map.inlineRename, 'Enter deve criar e focar o nó irmão');
    const siblingId = map.inlineRename.nodeId;
    const siblingNode = map.data.nodes.find(n => n.id === siblingId);
    assert.equal(siblingNode.parentId, childId, 'Irmão deve ter o mesmo pai');
    assert.notEqual(siblingId, grandsonId, 'Deve ser um nó irmão distinto');
  } finally {
    global.document = origDoc;
  }
});

test('EmbeddedMindMap: focus button and total isolation from Tab cycling', async () => {
  const origDoc = global.document;
  const createdButtons = [];
  const makeEl = (tag, o = {}) => {
    let _val = o.value !== undefined ? o.value : '';
    const el = {
      tagName: (tag || 'DIV').toUpperCase(),
      dataset: {},
      get value() { return _val; },
      set value(v) { _val = v; },
      placeholder: o.attr?.placeholder || '',
      tabIndex: o.attr?.tabindex !== undefined ? parseInt(o.attr.tabindex, 10) : 0,
      isConnected: true,
      classList: { add() {}, remove() {}, toggle() {} },
      style: { setProperty() {} },
      createSpan: (opts) => makeEl('span', opts),
      createDiv: (opts) => makeEl('div', opts),
      createEl: (t, opts) => {
        const child = makeEl(t, opts);
        if (t === 'button') createdButtons.push(child);
        return child;
      },
      appendChild: () => ({}),
      setAttribute: (k, v) => {
        el[k] = v;
        if (k === 'tabindex') el.tabIndex = parseInt(v, 10);
      },
      replaceChildren: () => {},
      remove: () => { el.isConnected = false; },
      focus: () => {},
      select: () => { el.selected = true; },
      setSelectionRange: () => {},
      querySelector: () => makeEl('div'),
      querySelectorAll: () => [],
      getContext: () => ({
        measureText: (t) => ({ width: (t || '').length * 8.5 })
      })
    };
    return el;
  };

  global.document = {
    createElement: makeEl,
    createElementNS: makeEl
  };

  const { EmbeddedMindMap } = await import('../src/embedded-mindmap.js');

  const containerListeners = {};
  const container = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    createDiv: () => makeEl('div'),
    addEventListener: (evt, fn) => { containerListeners[evt] = fn; },
    focus: () => {},
    closest: () => null
  };

  try {
    const map = new EmbeddedMindMap(container, {
      data: JSON.stringify({
        root: '1',
        nodes: [
          { id: '1', title: 'Cardiologia', color: '#38bdf8' },
          { id: '2', parentId: '1', title: 'Subtópico 1', color: '#34d399' }
        ]
      })
    });

    // Verify focus button exists and toggles focus
    assert.ok(map.focusBtn, 'Botão de modo foco deve existir na barra de ferramentas');
    assert.equal(map.focusBtn.tabIndex, -1, 'Botão de foco não deve ser tabulável');
    assert.equal(map.isFocused, false);

    map.toggleFocusMode();
    assert.equal(map.isFocused, true, 'Deve ativar o modo de foco independente');

    map.toggleFocusMode();
    assert.equal(map.isFocused, false, 'Deve desativar o modo de foco');

    // Verify every button in the mind map has tabIndex === -1
    assert.ok(createdButtons.length > 5, 'Deve haver múltiplos botões criados');
    for (const btn of createdButtons) {
      assert.equal(btn.tabIndex, -1, `Botão ${btn.tagName} deve ter tabIndex -1 para impedir navegação por Tab`);
    }
  } finally {
    global.document = origDoc;
  }
});

test('EmbeddedMindMap: adding sibling to node with children places it as sibling underneath, not child', async () => {
  const origDoc = global.document;
  const makeEl = (tag, o = {}) => {
    let _val = o.value !== undefined ? o.value : '';
    const el = {
      tagName: (tag || 'DIV').toUpperCase(),
      dataset: {},
      get value() { return _val; },
      set value(v) { _val = v; },
      placeholder: o.attr?.placeholder || '',
      tabIndex: o.attr?.tabindex !== undefined ? parseInt(o.attr.tabindex, 10) : 0,
      isConnected: true,
      classList: { add() {}, remove() {}, toggle() {} },
      style: { setProperty() {} },
      createSpan: (opts) => makeEl('span', opts),
      createDiv: (opts) => makeEl('div', opts),
      createEl: (t, opts) => makeEl(t, opts),
      appendChild: () => ({}),
      setAttribute: (k, v) => { el[k] = v; },
      replaceChildren: () => {},
      remove: () => { el.isConnected = false; },
      focus: () => {},
      select: () => { el.selected = true; },
      setSelectionRange: () => {},
      querySelector: () => makeEl('div'),
      querySelectorAll: () => [],
      getContext: () => ({
        measureText: (t) => ({ width: (t || '').length * 8.5 })
      })
    };
    return el;
  };

  global.document = {
    createElement: makeEl,
    createElementNS: makeEl
  };

  const { EmbeddedMindMap } = await import('../src/embedded-mindmap.js');

  const containerListeners = {};
  const container = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    createDiv: () => makeEl('div'),
    addEventListener: (evt, fn) => { containerListeners[evt] = fn; },
    focus: () => {},
    closest: () => null
  };

  try {
    const map = new EmbeddedMindMap(container, {
      data: JSON.stringify({
        root: '1',
        nodes: [
          { id: '1', title: 'Tópico Central' },
          { id: '2', parentId: '1', title: 'L1' },
          { id: '3', parentId: '2', title: 'L2' },
          { id: '4', parentId: '3', title: 'L3-top' },
          { id: '5', parentId: '3', title: 'L3-bottom' },
          { id: 'c1', parentId: '5', title: 'Child 1' },
          { id: 'c2', parentId: '5', title: 'Child 2' }
        ]
      })
    });

    // Select node '5' (L3-bottom) which already has children
    map.selectNode('5');
    assert.equal(map.selectedId, '5');

    // Add sibling to node '5'
    const siblingNode = map.addNode('5', true);
    assert.ok(siblingNode, 'Nó irmão deve ser criado');
    assert.equal(siblingNode.parentId, '3', 'O pai do irmão de 5 deve ser 3 (L2), NUNCA 5!');
    assert.notEqual(siblingNode.parentId, '5', 'Irmão de 5 NUNCA pode ter parentId = 5');

    // Verify splicing index: sibling of 5 must be placed after 5 and all its children (c1, c2)
    const idx5 = map.data.nodes.findIndex(n => n.id === '5');
    const idxC1 = map.data.nodes.findIndex(n => n.id === 'c1');
    const idxC2 = map.data.nodes.findIndex(n => n.id === 'c2');
    const idxSib = map.data.nodes.findIndex(n => n.id === siblingNode.id);

    assert.ok(idxSib > idx5, 'Irmão deve vir após o nó 5');
    assert.ok(idxSib > idxC2, 'Irmão deve vir após a subárvore inteira do nó 5');

    // Verify layout: siblingNode depth is 3 (same level as 5), NOT depth 4 (child level)
    const layout = map.lastLayoutResult;
    const pos5 = layout.positions.get('5');
    const posSib = layout.positions.get(siblingNode.id);
    assert.equal(posSib.depth, 3, 'Profundidade do irmão deve ser 3 (mesmo nível de 5)');
    assert.equal(posSib.depth, pos5.depth, 'Profundidade deve ser igual à de 5');
    assert.ok(posSib.y > pos5.y, 'Irmão deve ser posicionado verticalmente abaixo de 5');

    // Test Enter key on selected node via handleWindowKeydown
    map.selectNode('4'); // L3-top
    map.inlineRename?.finish();
    assert.equal(map.selectedId, '4');

    containerListeners['keydown']({
      key: 'Enter',
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {}
    });

    assert.ok(map.inlineRename, 'Enter deve criar novo nó e abrir renomeação inline');
    const newSibId = map.inlineRename.nodeId;
    const newSibNode = map.data.nodes.find(n => n.id === newSibId);
    assert.equal(newSibNode.parentId, '3', 'Enter em L3-top deve criar nó irmão com pai L2');
    assert.equal(map.data.nodes.indexOf(newSibNode), map.data.nodes.findIndex(n => n.id === '4') + 1, 'Novo irmão deve ser inserido logo após 4');
  } finally {
    global.document = origDoc;
  }
});
