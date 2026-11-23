import { setIcon, Modal, Menu, Notice } from './compat.js';

export const MINDMAP_COLORS = [
  '#38bdf8', // sky
  '#34d399', // emerald
  '#f59e0b', // amber
  '#f472b6', // pink
  '#a78bfa', // purple
  '#fb923c', // orange
  '#4ade80', // green
  '#e879f9'  // fuchsia
];

let measureCanvasCtx = null;
export function measureTextWidth(text, font = '600 13px system-ui, -apple-system, sans-serif') {
  if (typeof document === 'undefined') return Math.max(30, (text || '').length * 8);
  if (!measureCanvasCtx) {
    const canvas = document.createElement('canvas');
    measureCanvasCtx = canvas.getContext('2d');
  }
  measureCanvasCtx.font = font;
  return measureCanvasCtx.measureText(text || '').width;
}

export function parseMindmapData(raw) {
  const defaultMap = {
    root: '1',
    height: 400,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    nodes: [
      { id: '1', title: 'Tópico Central', color: MINDMAP_COLORS[0], body: '' },
      { id: '2', parentId: '1', title: 'Subtópico 1', color: MINDMAP_COLORS[1], body: '' },
      { id: '3', parentId: '1', title: 'Subtópico 2', color: MINDMAP_COLORS[2], body: '' }
    ]
  };

  if (!raw || typeof raw !== 'string') return defaultMap;
  const trimmed = raw.trim();
  if (!trimmed) return defaultMap;

  // Try JSON parsing
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data.nodes) && data.nodes.length) {
        if (!data.root) data.root = data.nodes[0].id;
        if (!data.height) data.height = 400;
        return data;
      }
    } catch {}
  }

  // Try parsing Markdown Outline / Indented List
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return defaultMap;

  const nodes = [];
  const parentStack = [];
  let rootId = '1';

  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.|\#{1,6})?\s*(.*)$/);
    if (!match) return;
    const indent = match[1].replace(/\t/g, '  ').length;
    const title = match[2].trim() || `Tópico ${index + 1}`;
    const id = String(index + 1);

    while (parentStack.length > 0 && parentStack[parentStack.length - 1].indent >= indent) {
      parentStack.pop();
    }

    const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
    const parentId = parent ? parent.id : (index === 0 ? '' : rootId);

    const color = parentId
      ? (parent && parent.color ? parent.color : MINDMAP_COLORS[(index) % MINDMAP_COLORS.length])
      : MINDMAP_COLORS[0];

    const node = { id, title, parentId, color, body: '' };
    nodes.push(node);
    parentStack.push({ indent, id, color });
    if (index === 0) rootId = id;
  });

  return {
    root: rootId,
    height: 400,
    zoom: 1.0,
    nodes: nodes.length ? nodes : defaultMap.nodes
  };
}

export function serializeMindmapData(data) {
  const clean = {
    root: data.root || (data.nodes?.[0]?.id || '1'),
    height: Math.max(260, Math.min(1400, data.height || 400)),
    zoom: Number((data.zoom || 1.0).toFixed(2)),
    nodes: (data.nodes || []).map(n => {
      const item = {
        id: String(n.id),
        title: n.title || (n.relation ? 'Relação' : 'Novo tópico')
      };
      if (n.parentId) item.parentId = String(n.parentId);
      if (n.color) item.color = n.color;
      if (n.body) item.body = n.body;
      if (n.collapsed) item.collapsed = true;
      if (n.relation) item.relation = true;
      return item;
    })
  };
  return JSON.stringify(clean, null, 2);
}

export function calculateNodeSize(node, hasChildren) {
  if (node.relation) {
    const text = node.title || 'Relação';
    const textW = measureTextWidth(text, '600 12px system-ui, -apple-system, sans-serif');
    return { w: Math.max(80, Math.min(320, Math.ceil(textW) + 32)), h: 26, pillH: 26, bodyH: 0 };
  }

  const titleText = node.title || (node.parentId ? 'Novo tópico' : 'Tópico Central');
  const titleW = measureTextWidth(titleText, '600 13px system-ui, -apple-system, sans-serif');
  const extraControls = (hasChildren ? 24 : 0) + 115;
  const pillW = Math.max(150, Math.min(480, Math.ceil(titleW + extraControls)));
  const pillH = node.parentId ? 36 : 40;

  let bodyH = 0;
  let bodyW = 0;
  if (node.body) {
    const lines = String(node.body).split(/\r?\n/);
    let maxLineW = 0;
    for (const line of lines) {
      const lw = measureTextWidth(line, '400 12px system-ui, -apple-system, sans-serif');
      if (lw > maxLineW) maxLineW = lw;
    }
    bodyW = Math.max(180, Math.min(480, Math.ceil(maxLineW) + 26));
    const lineCount = lines.reduce((acc, l) => acc + Math.max(1, Math.ceil((l.length || 1) / 38)), 0);
    bodyH = Math.min(260, Math.max(32, lineCount * 19 + 16));
  }

  const w = Math.max(pillW, bodyW);
  const h = pillH + (bodyH ? bodyH + 8 : 0);
  return { w, h, pillW, pillH, bodyH };
}

export function layoutMindmapTree(nodes, rootId) {
  const root = nodes.find(n => n.id === rootId) || nodes[0];
  if (!root) return { positions: new Map(), bbox: { minX: 0, minY: 0, width: 400, height: 300 } };

  const childrenMap = new Map();
  for (const n of nodes) {
    if (n.parentId) {
      if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
      childrenMap.get(n.parentId).push(n);
    }
  }

  const sizes = new Map();
  for (const n of nodes) {
    const hasChildren = Boolean(childrenMap.get(n.id)?.length);
    sizes.set(n.id, calculateNodeSize(n, hasChildren));
  }

  const order = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    order.push(n);
    if (!n.collapsed) {
      const ch = childrenMap.get(n.id) || [];
      for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
    }
  }

  const spans = new Map();
  const gap = 18;
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const size = sizes.get(n.id);
    const ch = n.collapsed ? [] : childrenMap.get(n.id) || [];
    if (!ch.length) {
      spans.set(n.id, size.h);
    } else {
      const totalChildren = ch.reduce((sum, c) => sum + (spans.get(c.id) || sizes.get(c.id).h), 0) + Math.max(0, ch.length - 1) * gap;
      spans.set(n.id, Math.max(size.h, totalChildren));
    }
  }

  const depths = new Map();
  depths.set(root.id, 0);
  const depthStack = [root];
  while (depthStack.length) {
    const cur = depthStack.pop();
    const d = depths.get(cur.id) || 0;
    const ch = cur.collapsed ? [] : childrenMap.get(cur.id) || [];
    for (const c of ch) {
      depths.set(c.id, d + 1);
      depthStack.push(c);
    }
  }

  const maxWByDepth = new Map();
  for (const n of order) {
    const d = depths.get(n.id) || 0;
    const size = sizes.get(n.id);
    maxWByDepth.set(d, Math.max(maxWByDepth.get(d) || 0, size.w));
  }

  const xByDepth = new Map();
  xByDepth.set(0, 48);
  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  for (let d = 1; d <= maxDepth; d++) {
    const prevW = maxWByDepth.get(d - 1) || 160;
    xByDepth.set(d, xByDepth.get(d - 1) + prevW + 68);
  }

  const positions = new Map();
  const rootSize = sizes.get(root.id);
  const rootSpan = spans.get(root.id) || rootSize.h;
  positions.set(root.id, {
    x: xByDepth.get(0),
    y: 48 + (rootSpan - rootSize.h) / 2,
    w: rootSize.w,
    h: rootSize.h,
    pillH: rootSize.pillH,
    depth: 0,
    node: root
  });

  const posStack = [{ node: root, top: 48 }];
  while (posStack.length) {
    const { node: n, top } = posStack.pop();
    const ch = n.collapsed ? [] : childrenMap.get(n.id) || [];
    if (!ch.length) continue;

    const totalChildren = ch.reduce((sum, c) => sum + (spans.get(c.id) || sizes.get(c.id).h), 0) + Math.max(0, ch.length - 1) * gap;
    let y = top + (spans.get(n.id) - totalChildren) / 2;

    for (const c of ch) {
      const cSpan = spans.get(c.id) || sizes.get(c.id).h;
      const cSize = sizes.get(c.id);
      const cDepth = depths.get(c.id);
      positions.set(c.id, {
        x: xByDepth.get(cDepth),
        y: y + (cSpan - cSize.h) / 2,
        w: cSize.w,
        h: cSize.h,
        pillH: cSize.pillH,
        depth: cDepth,
        node: c
      });
      posStack.push({ node: c, top: y });
      y += cSpan + gap;
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.w);
    maxY = Math.max(maxY, pos.y + pos.h);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300; }

  return {
    positions,
    bbox: {
      minX, minY, maxX, maxY,
      width: Math.max(100, maxX - minX + 96),
      height: Math.max(100, maxY - minY + 96)
    }
  };
}

class MindSubnoteModal extends Modal {
  constructor(app, node, onSave) {
    super(app);
    this.node = node;
    this.onSave = onSave;
  }
  onOpen() {
    this.setTitle(`Subnota / Caixa de texto: ${this.node.title || 'Nó'}`);
    this.modalEl.classList.add('romus-mindmap-subnote-modal');
    this.contentEl.createEl('p', {
      cls: 'ia-muted',
      text: 'Escreva anotações, detalhes ou explicações que serão exibidos logo abaixo do nó no mapa mental.'
    });

    const textarea = this.contentEl.createEl('textarea', {
      cls: 'ia-mind-subnote-textarea',
      attr: {
        rows: '6',
        placeholder: 'Escreva anotações, explicações ou detalhes adicionais...'
      }
    });
    textarea.value = this.node.body || '';

    const footer = this.contentEl.createDiv({ cls: 'modal-button-container' });
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.marginTop = '14px';

    if (this.node.body) {
      const delBtn = footer.createEl('button', { text: 'Remover subnota', cls: 'mod-warning' });
      delBtn.onclick = () => {
        this.onSave('');
        this.close();
      };
    } else {
      footer.createDiv();
    }

    const right = footer.createDiv();
    right.style.display = 'flex';
    right.style.gap = '8px';
    const cancel = right.createEl('button', { text: 'Cancelar' });
    cancel.onclick = () => this.close();

    const save = right.createEl('button', { text: 'Salvar subnota', cls: 'mod-cta' });
    const commit = () => {
      this.onSave(textarea.value.trim());
      this.close();
    };
    save.onclick = commit;
    textarea.onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    };
    setTimeout(() => textarea.focus(), 20);
  }
}

export class EmbeddedMindMap {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.app = options.app || null;
    this.readOnly = Boolean(options.readOnly);
    this.data = parseMindmapData(options.data);
    this.selectedId = this.data.root;
    this.camera = { x: 0, y: 0, z: this.data.zoom || 1.0 };
    this.panState = null;
    this.nodeElements = new Map();
    this.inlineRename = null;

    this.initDOM();
    this.layoutAndRender();
    // Auto-fit initial view smoothly
    requestAnimationFrame(() => this.fitToView(true));
  }

  load(raw) {
    this.data = parseMindmapData(raw);
    if (!this.data.nodes.some(n => n.id === this.selectedId)) {
      this.selectedId = this.data.root;
    }
    this.layoutAndRender();
  }

  serialize() {
    return serializeMindmapData(this.data);
  }

  emitChange() {
    if (this.readOnly) return;
    if (typeof this.options.onChange === 'function') {
      this.options.onChange(this.serialize());
    }
  }

  initDOM() {
    this.container.classList.add('romus-embedded-mindmap');
    this.container.style.height = `${this.data.height || 400}px`;
    this.container.tabIndex = 0;

    // Header Toolbar
    const toolbar = this.toolbar = this.container.createDiv({ cls: 'romus-mindmap-toolbar' });
    const leftTools = toolbar.createDiv({ cls: 'romus-mindmap-tools-left' });
    const titlePill = leftTools.createDiv({ cls: 'romus-mindmap-badge' });
    setIcon(titlePill.createSpan({ cls: 'romus-mindmap-badge-icon' }), 'git-fork');
    titlePill.createSpan({ text: 'Mapa mental' });

    if (!this.readOnly) {
      const addChildBtn = leftTools.createEl('button', {
        cls: 'romus-mindmap-btn',
        attr: { title: 'Adicionar filho ao nó selecionado (Tab)', 'aria-label': 'Adicionar filho' }
      });
      setIcon(addChildBtn, 'plus');
      addChildBtn.createSpan({ text: 'Filho' });
      addChildBtn.onclick = () => this.addNode(this.selectedId);

      const addSiblingBtn = leftTools.createEl('button', {
        cls: 'romus-mindmap-btn',
        attr: { title: 'Adicionar irmão ao nó selecionado (Enter)', 'aria-label': 'Adicionar irmão' }
      });
      setIcon(addSiblingBtn, 'git-commit');
      addSiblingBtn.createSpan({ text: 'Irmão' });
      addSiblingBtn.onclick = () => this.addNode(this.selectedId, true);
    }

    const rightTools = toolbar.createDiv({ cls: 'romus-mindmap-tools-right' });

    const zoomOutBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { title: 'Diminuir zoom (-)', 'aria-label': 'Zoom -' }
    });
    setIcon(zoomOutBtn, 'minus');
    zoomOutBtn.onclick = () => this.zoom(0.85);

    const fitBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn',
      attr: { title: 'Enquadrar mapa mental (100%)', 'aria-label': 'Enquadrar' }
    });
    setIcon(fitBtn, 'maximize-2');
    fitBtn.createSpan({ text: '100%' });
    fitBtn.onclick = () => this.fitToView();

    const zoomInBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { title: 'Aumentar zoom (+)', 'aria-label': 'Zoom +' }
    });
    setIcon(zoomInBtn, 'plus');
    zoomInBtn.onclick = () => this.zoom(1.18);

    const fullscreenBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { title: 'Expandir / Tela cheia', 'aria-label': 'Tela cheia' }
    });
    setIcon(fullscreenBtn, 'expand');
    fullscreenBtn.onclick = () => this.toggleFullscreen();

    const codeBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { title: 'Ver ou editar código JSON', 'aria-label': 'Código' }
    });
    setIcon(codeBtn, 'code');
    codeBtn.onclick = () => this.toggleCodeOverlay();

    // Stage & Viewport
    const stage = this.stage = this.container.createDiv({ cls: 'romus-mindmap-stage' });
    const world = this.world = stage.createDiv({ cls: 'romus-mindmap-world' });

    // SVG connectors layer
    const svg = this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'romus-mindmap-svg');
    world.appendChild(svg);

    // Nodes container
    this.nodesHost = world.createDiv({ cls: 'romus-mindmap-nodes' });

    // Code Overlay
    this.initCodeOverlay();

    // Bottom Resizer Handle
    if (!this.readOnly) {
      this.initResizer();
    }

    // Canvas Pointer Handlers (Pan & Zoom)
    this.initStageInteractions();

    // Keyboard Shortcuts
    this.initKeyboardShortcuts();
  }

  initCodeOverlay() {
    const overlay = this.codeOverlay = this.container.createDiv({ cls: 'romus-mindmap-code-overlay' });
    overlay.style.display = 'none';

    const header = overlay.createDiv({ cls: 'romus-mindmap-code-header' });
    header.createSpan({ text: 'Editor de Código do Mapa Mental (JSON)' });

    const btnWrap = header.createDiv({ style: 'display:flex;gap:6px;' });
    const applyBtn = btnWrap.createEl('button', { cls: 'mod-cta', text: 'Aplicar alterações' });
    const closeBtn = btnWrap.createEl('button', { text: 'Fechar' });

    const textarea = this.codeTextarea = overlay.createEl('textarea', {
      cls: 'romus-mindmap-code-textarea',
      attr: { spellcheck: 'false' }
    });

    closeBtn.onclick = () => {
      overlay.style.display = 'none';
    };

    applyBtn.onclick = () => {
      try {
        const parsed = JSON.parse(textarea.value);
        if (Array.isArray(parsed.nodes)) {
          this.data = parsed;
          this.layoutAndRender();
          this.emitChange();
          overlay.style.display = 'none';
          new Notice('Mapa mental atualizado!');
        } else {
          new Notice('O JSON deve conter um array "nodes".');
        }
      } catch (err) {
        new Notice('Erro ao processar JSON: ' + err.message);
      }
    };
  }

  toggleCodeOverlay() {
    if (this.codeOverlay.style.display === 'none') {
      this.codeTextarea.value = this.serialize();
      this.codeOverlay.style.display = 'flex';
      setTimeout(() => this.codeTextarea.focus(), 20);
    } else {
      this.codeOverlay.style.display = 'none';
    }
  }

  initResizer() {
    const resizer = this.container.createDiv({
      cls: 'romus-mindmap-resizer',
      attr: { title: 'Arraste para redimensionar a altura do mapa mental' }
    });
    resizer.createSpan({ cls: 'romus-mindmap-resizer-bar' });

    let startY = 0;
    let startH = 0;

    const onPointerMove = event => {
      const deltaY = event.clientY - startY;
      const newHeight = Math.max(260, Math.min(1400, Math.round(startH + deltaY)));
      this.container.style.height = `${newHeight}px`;
      this.data.height = newHeight;
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.classList.remove('is-resizing-mindmap');
      this.emitChange();
    };

    resizer.onpointerdown = event => {
      event.preventDefault();
      event.stopPropagation();
      startY = event.clientY;
      startH = this.container.offsetHeight;
      document.body.classList.add('is-resizing-mindmap');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };
  }

  initStageInteractions() {
    const stage = this.stage;

    stage.onpointerdown = event => {
      if (event.target.closest('.ia-card, .romus-mindmap-toolbar, .romus-mindmap-code-overlay, .romus-mindmap-resizer')) {
        return;
      }
      this.inlineRename?.finish();
      this.panState = {
        startX: event.clientX,
        startY: event.clientY,
        camX: this.camera.x,
        camY: this.camera.y
      };
      stage.classList.add('is-panning');
      stage.setPointerCapture?.(event.pointerId);
    };

    stage.onpointermove = event => {
      if (!this.panState) return;
      const dx = event.clientX - this.panState.startX;
      const dy = event.clientY - this.panState.startY;
      this.camera.x = this.panState.camX + dx;
      this.camera.y = this.panState.camY + dy;
      this.applyCamera();
    };

    const endPan = event => {
      if (!this.panState) return;
      this.panState = null;
      stage.classList.remove('is-panning');
      try { stage.releasePointerCapture?.(event.pointerId); } catch {}
    };

    stage.onpointerup = endPan;
    stage.onpointercancel = endPan;

    stage.onwheel = event => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      this.zoom(factor, clientX, clientY);
    };
  }

  initKeyboardShortcuts() {
    this.container.addEventListener('keydown', event => {
      if (this.inlineRename || event.target.closest('input, textarea')) return;

      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        this.addNode(this.selectedId);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.addNode(this.selectedId, true);
      } else if (event.key === 'F2') {
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedId) this.renameNodeInline(this.selectedId);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedId && this.selectedId !== this.data.root) {
          this.deleteNode(this.selectedId);
        }
      } else if (event.key === '+' || event.key === '=') {
        this.zoom(1.15);
      } else if (event.key === '-') {
        this.zoom(0.85);
      } else if (event.key === '0') {
        this.fitToView();
      }
    });
  }

  zoom(factor, pivotX, pivotY) {
    const stage = this.stage;
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    const px = typeof pivotX === 'number' ? pivotX : w / 2;
    const py = typeof pivotY === 'number' ? pivotY : h / 2;

    const oldZ = this.camera.z;
    const newZ = Math.min(2.5, Math.max(0.25, oldZ * factor));
    if (newZ === oldZ) return;

    this.camera.x = px - (px - this.camera.x) * (newZ / oldZ);
    this.camera.y = py - (py - this.camera.y) * (newZ / oldZ);
    this.camera.z = newZ;
    this.applyCamera();
  }

  fitToView(silent = false) {
    if (!this.lastLayoutResult) return;
    const { bbox } = this.lastLayoutResult;
    const stageW = this.stage.offsetWidth || this.container.offsetWidth || 600;
    const stageH = this.stage.offsetHeight || this.container.offsetHeight || 400;

    const pad = 42;
    const scaleX = (stageW - pad * 2) / bbox.width;
    const scaleY = (stageH - pad * 2) / bbox.height;
    const z = Math.min(1.2, Math.max(0.35, Math.min(scaleX, scaleY)));

    const x = (stageW - bbox.width * z) / 2 - (bbox.minX - 48) * z;
    const y = (stageH - bbox.height * z) / 2 - (bbox.minY - 48) * z;

    this.camera = { x: Math.round(x), y: Math.round(y), z };
    this.applyCamera();
  }

  applyCamera() {
    this.world.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.z})`;
  }

  toggleFullscreen() {
    const isFull = this.container.classList.toggle('is-fullscreen');
    setTimeout(() => this.fitToView(), 60);
  }

  layoutAndRender() {
    this.inlineRename?.finish();
    const layout = layoutMindmapTree(this.data.nodes, this.data.root);
    this.lastLayoutResult = layout;
    const { positions, bbox } = layout;

    // Update SVG viewport size
    this.svg.setAttribute('width', String(Math.max(800, bbox.maxX + 200)));
    this.svg.setAttribute('height', String(Math.max(600, bbox.maxY + 200)));
    this.svg.replaceChildren();

    // Render Connector Curves
    for (const node of this.data.nodes) {
      if (!node.parentId) continue;
      const p = positions.get(node.parentId);
      const c = positions.get(node.id);
      if (!p || !c) continue;

      const x1 = p.x + p.w;
      const y1 = p.y + p.pillH / 2;
      const x2 = c.x;
      const y2 = c.y + c.pillH / 2;
      const dx = Math.max(35, (x2 - x1) * 0.5);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('stroke', node.color || p.node.color || MINDMAP_COLORS[0]);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      if (node.relation) {
        path.setAttribute('stroke-dasharray', '4, 4');
      }
      this.svg.appendChild(path);
    }

    // Render Node Elements
    const existingIds = new Set(this.nodeElements.keys());
    const visibleIds = new Set(positions.keys());

    for (const id of existingIds) {
      if (!visibleIds.has(id)) {
        this.nodeElements.get(id)?.remove();
        this.nodeElements.delete(id);
      }
    }

    for (const [id, pos] of positions.entries()) {
      let el = this.nodeElements.get(id);
      if (!el) {
        el = this.createNodeElement(pos.node);
        this.nodeElements.set(id, el);
        this.nodesHost.appendChild(el);
      }
      this.updateNodeElement(el, pos);
    }

    this.applyCamera();
  }

  createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'ia-card ia-mind romus-mind-node';
    el.dataset.nodeId = node.id;

    const head = el.createDiv({ cls: 'ia-card-head' });

    // Title label
    head.createSpan({ cls: 'ia-card-title', text: node.title });

    // Subnote (+ Nota) button
    const noteBadge = head.createSpan({ cls: 'ia-mind-note-badge' });
    setIcon(noteBadge, 'file-text');
    noteBadge.createSpan({ text: node.body ? 'Nota' : '+ Nota' });
    noteBadge.title = node.body ? 'Ver/editar subnota' : 'Adicionar subnota/caixa de texto';

    // Collapse toggle button
    const collapseBtn = head.createEl('button', { cls: 'ia-mind-collapse-btn' });
    setIcon(collapseBtn, 'chevron-down');

    // Add child button
    const addChildBtn = head.createEl('button', { cls: 'ia-mind-add-btn', attr: { title: 'Adicionar filho (Tab)' } });
    setIcon(addChildBtn, 'plus');

    // Subnote body container
    const subnoteBox = el.createDiv({ cls: 'ia-mind-subnote' });
    subnoteBox.createDiv({ cls: 'ia-mind-subnote-text' });

    // Events
    el.onpointerdown = e => {
      e.stopPropagation();
      this.selectNode(node.id);
    };

    el.ondblclick = e => {
      e.stopPropagation();
      this.renameNodeInline(node.id);
    };

    el.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      this.selectNode(node.id);
      this.showContextMenu(node.id, e);
    };

    noteBadge.onclick = e => {
      e.stopPropagation();
      this.selectNode(node.id);
      this.editSubnote(node.id);
    };

    collapseBtn.onclick = e => {
      e.stopPropagation();
      this.toggleCollapse(node.id);
    };

    addChildBtn.onclick = e => {
      e.stopPropagation();
      this.selectNode(node.id);
      this.addNode(node.id);
    };

    subnoteBox.ondblclick = e => {
      e.stopPropagation();
      this.editSubnote(node.id);
    };

    return el;
  }

  updateNodeElement(el, pos) {
    const node = pos.node;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.width = `${pos.w}px`;
    el.style.setProperty('--ia-mind-color', node.color || MINDMAP_COLORS[0]);

    el.classList.toggle('is-selected', this.selectedId === node.id);
    el.classList.toggle('is-root', node.id === this.data.root);
    el.classList.toggle('has-subnote', Boolean(node.body));
    el.classList.toggle('is-relation', Boolean(node.relation));

    const head = el.querySelector('.ia-card-head');
    if (head) {
      head.style.height = `${pos.pillH}px`;
      const titleSpan = head.querySelector('.ia-card-title');
      if (titleSpan) titleSpan.textContent = node.title || (node.relation ? 'Relação' : 'Novo tópico');

      const noteBadge = head.querySelector('.ia-mind-note-badge');
      if (noteBadge) {
        noteBadge.classList.toggle('is-linked', Boolean(node.body));
        const badgeLabel = noteBadge.querySelector('span:last-child');
        if (badgeLabel) badgeLabel.textContent = node.body ? 'Nota' : '+ Nota';
      }

      const hasChildren = this.data.nodes.some(n => n.parentId === node.id);
      const collapseBtn = head.querySelector('.ia-mind-collapse-btn');
      if (collapseBtn) {
        collapseBtn.style.display = hasChildren ? 'inline-flex' : 'none';
        setIcon(collapseBtn, node.collapsed ? 'chevron-right' : 'chevron-down');
        collapseBtn.title = node.collapsed ? 'Expandir filhos' : 'Recolher filhos';
      }
    }

    const subnoteBox = el.querySelector('.ia-mind-subnote');
    if (subnoteBox) {
      subnoteBox.style.display = node.body ? 'block' : 'none';
      const textEl = subnoteBox.querySelector('.ia-mind-subnote-text');
      if (textEl) textEl.textContent = node.body || '';
    }
  }

  selectNode(id) {
    this.selectedId = id;
    for (const [nodeId, el] of this.nodeElements.entries()) {
      el.classList.toggle('is-selected', nodeId === id);
    }
  }

  addNode(parentId, sibling = false, relation = false) {
    if (this.readOnly) return;
    this.inlineRename?.finish();

    const parent = sibling
      ? this.data.nodes.find(n => n.id === (this.data.nodes.find(m => m.id === parentId)?.parentId))
      : this.data.nodes.find(n => n.id === parentId);

    if (!parent && sibling) {
      new Notice('O tópico central não possui irmãos. Use + Filho.');
      return;
    }

    const actualParent = parent || this.data.nodes.find(n => n.id === this.data.root) || this.data.nodes[0];
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    let color;
    if (actualParent.id === this.data.root) {
      const childCount = this.data.nodes.filter(n => n.parentId === actualParent.id).length;
      color = MINDMAP_COLORS[(childCount + 1) % MINDMAP_COLORS.length];
    } else {
      color = actualParent.color || MINDMAP_COLORS[0];
    }

    const newNode = {
      id: newId,
      parentId: actualParent.id,
      title: relation ? 'Relação' : 'Novo tópico',
      color,
      body: '',
      collapsed: false,
      relation: Boolean(relation)
    };

    actualParent.collapsed = false;
    this.data.nodes.push(newNode);
    this.selectedId = newId;
    this.layoutAndRender();
    this.emitChange();

    setTimeout(() => {
      this.renameNodeInline(newId, true);
    }, 25);

    return newNode;
  }

  renameNodeInline(nodeId, isNew = false) {
    if (this.readOnly) return;
    this.inlineRename?.finish();

    const node = this.data.nodes.find(n => n.id === nodeId);
    const el = this.nodeElements.get(nodeId);
    if (!node || !el) return;

    const head = el.querySelector('.ia-card-head');
    const label = head?.querySelector('.ia-card-title');
    if (!head || !label) return;

    el.classList.add('is-renaming');
    label.style.display = 'none';

    const input = head.createEl('input', {
      cls: 'ia-mind-rename',
      type: 'text',
      value: isNew ? '' : node.title,
      attr: { placeholder: node.relation ? 'Relação' : 'Novo tópico' }
    });

    let finished = false;
    const commit = (cancel = false) => {
      if (finished) return;
      finished = true;
      el.classList.remove('is-renaming');
      input.remove();
      label.style.display = '';

      if (!cancel) {
        const val = input.value.trim();
        if (val && val !== node.title) {
          node.title = val;
          this.layoutAndRender();
          this.emitChange();
        } else if (isNew && !val) {
          node.title = node.relation ? 'Relação' : 'Novo tópico';
          this.layoutAndRender();
        }
      }
      this.inlineRename = null;
    };

    this.inlineRename = { finish: commit, cancel: () => commit(true) };

    input.onpointerdown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.ondblclick = e => e.stopPropagation();

    input.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit();
        this.addNode(node.id);
      } else if (e.key === 'Escape') {
        commit(true);
      }
    };

    input.onblur = () => commit();
    setTimeout(() => {
      input.focus();
      input.select();
    }, 20);
  }

  editSubnote(nodeId) {
    if (this.readOnly) return;
    const node = this.data.nodes.find(n => n.id === nodeId);
    if (!node) return;

    new MindSubnoteModal(this.app, node, newBody => {
      node.body = newBody;
      this.layoutAndRender();
      this.emitChange();
    }).open();
  }

  toggleCollapse(nodeId) {
    const node = this.data.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.collapsed = !node.collapsed;
    this.layoutAndRender();
    this.emitChange();
  }

  deleteNode(nodeId) {
    if (this.readOnly) return;
    if (nodeId === this.data.root) {
      new Notice('Não é possível excluir o tópico central.');
      return;
    }

    const node = this.data.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Collect all descendants recursively
    const toDelete = new Set([nodeId]);
    let added = true;
    while (added) {
      added = false;
      for (const n of this.data.nodes) {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          added = true;
        }
      }
    }

    this.data.nodes = this.data.nodes.filter(n => !toDelete.has(n.id));
    this.selectedId = node.parentId || this.data.root;
    this.layoutAndRender();
    this.emitChange();
  }

  showContextMenu(nodeId, event) {
    const node = this.data.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const menu = new Menu();
    menu.addItem(item => {
      item.setTitle('Renomear nó (F2)');
      item.onClick(() => this.renameNodeInline(node.id));
    });

    menu.addItem(item => {
      item.setTitle(node.body ? 'Editar subnota / caixa de texto' : 'Adicionar subnota / caixa de texto');
      item.onClick(() => this.editSubnote(node.id));
    });

    if (node.body) {
      menu.addItem(item => {
        item.setTitle('Remover subnota');
        item.onClick(() => {
          node.body = '';
          this.layoutAndRender();
          this.emitChange();
        });
      });
    }

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Adicionar filho (Tab)');
      item.onClick(() => this.addNode(node.id));
    });

    if (node.id !== this.data.root) {
      menu.addItem(item => {
        item.setTitle('Adicionar irmão (Enter)');
        item.onClick(() => this.addNode(node.id, true));
      });
    }

    menu.addItem(item => {
      item.setTitle('Adicionar relação...');
      item.onClick(() => this.addNode(node.id, false, true));
    });

    const hasChildren = this.data.nodes.some(n => n.parentId === node.id);
    if (hasChildren) {
      menu.addItem(item => {
        item.setTitle(node.collapsed ? 'Expandir filhos' : 'Recolher filhos');
        item.onClick(() => this.toggleCollapse(node.id));
      });
    }

    menu.addSeparator();

    // Color picker
    MINDMAP_COLORS.slice(0, 4).forEach((color, idx) => {
      const names = ['Azul', 'Esmeralda', 'Âmbar', 'Rosa'];
      menu.addItem(item => {
        item.setTitle(`Cor: ${names[idx]}`);
        item.onClick(() => {
          node.color = color;
          this.layoutAndRender();
          this.emitChange();
        });
      });
    });

    if (node.id !== this.data.root) {
      menu.addSeparator();
      menu.addItem(item => {
        item.setTitle('Excluir nó (Delete)');
        item.onClick(() => this.deleteNode(node.id));
      });
    }

    menu.showAtMouseEvent(event);
  }

  destroy() {
    this.inlineRename?.cancel();
    this.nodeElements.clear();
    this.container.empty?.();
  }
}
