import { setIcon, Modal, Menu, Notice } from './compat.js';

const safeRAF = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb) => setTimeout(cb, 16);

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
  if (typeof document === 'undefined') return Math.max(30, (text || '').length * 8.5);
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
  let text = raw.trim();
  if (!text) return defaultMap;

  // 1. Strip markdown code fences if present (```mindmap ... ``` or ~~~mindmap ... ~~~)
  text = text.replace(/^```[^\n]*\r?\n|^~~~[^\n]*\r?\n/i, '');
  text = text.replace(/\r?\n```\s*$|\r?\n~~~\s*$/g, '').trim();

  // 2. Locate outermost JSON object if present
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const data = JSON.parse(candidate);
      if (Array.isArray(data.nodes) && data.nodes.length) {
        if (!data.root) data.root = data.nodes[0].id;
        if (!data.height) data.height = 400;
        return data;
      }
    } catch {}
  }

  // 3. Fallback to Markdown indented list ONLY if lines start with bullets/headers
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const isOutline = lines.some(l => /^\s*(?:[-*+]|\d+\.|\#{1,6})\s+/.test(l));
  if (!isOutline) return defaultMap;

  const nodes = [];
  const parentStack = [];
  let rootId = '1';

  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.|\#{1,6})\s+(.*)$/);
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
    return { w: Math.max(90, Math.ceil(textW) + 40), h: 28, pillH: 28, bodyH: 0 };
  }

  const titleText = node.title || (node.parentId ? 'Novo tópico' : 'Tópico Central');
  const titleW = measureTextWidth(titleText, '600 13px system-ui, -apple-system, sans-serif');
  const controlsW = (hasChildren ? 32 : 0) + 162;
  const pillW = Math.max(170, Math.ceil(titleW + controlsW));
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
    bodyW = Math.max(200, Math.ceil(maxLineW) + 32);
    const lineCount = lines.reduce((acc, l) => acc + Math.max(1, Math.ceil((l.length || 1) / 38)), 0);
    bodyH = Math.min(320, Math.max(34, lineCount * 20 + 18));
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
    this.isFocused = false;
    this._windowKeyHandler = null;
    this._docClickListener = null;
    this._docTimer = null;
    this._fullscreenEscHandler = null;

    this.initDOM();
    this.layoutAndRender();
    safeRAF(() => this.centerView());
  }

  load(raw) {
    if (this.inlineRename) return;
    this.data = parseMindmapData(raw);
    const normSelectedId = String(this.selectedId);
    if (!this.data.nodes.some(n => String(n.id) === normSelectedId)) {
      this.selectedId = String(this.data.root);
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

  toggleFocusMode() {
    this.setFocused(!this.isFocused);
  }

  setFocused(focused) {
    const nextState = Boolean(focused);
    if (this.isFocused === nextState) {
      if (nextState && this.container) {
        this.container.focus({ preventScroll: true });
      }
      return;
    }
    this.isFocused = nextState;
    this.container.classList.toggle('is-focused-mode', this.isFocused);
    if (this.focusBtn) {
      this.focusBtn.classList.toggle('is-active', this.isFocused);
      if (this.focusLabel) {
        this.focusLabel.textContent = this.isFocused ? 'Foco Ativo' : 'Modo Foco';
      }
      this.focusBtn.title = this.isFocused
        ? 'Modo Foco Ativo (Tab = Filho, Enter = Irmão, digite direto). Clique para desativar.'
        : 'Ativar Modo Foco (Tab cria filhos sem interferência do markdown)';
    }
    if (this.isFocused) {
      if (!this.selectedId) {
        this.selectedId = this.data.root || this.data.nodes[0]?.id;
        this.renderSelection();
      }
      this.container.focus({ preventScroll: true });

      if (!this._windowKeyHandler && typeof window !== 'undefined') {
        this._windowKeyHandler = (e) => this.handleWindowKeydown(e);
        window.addEventListener?.('keydown', this._windowKeyHandler, true);
      }
      if (!this._docClickListener && typeof document !== 'undefined') {
        this._docClickListener = (e) => {
          if (!this.container || !this.isFocused) return;
          if (this.container.contains(e.target)) return;
          if (e.target?.closest?.('.romus-mindmap-subnote-modal, .modal, .menu, .notice')) return;
          this.setFocused(false);
        };
        if (this._docTimer) clearTimeout(this._docTimer);
        this._docTimer = setTimeout(() => {
          if (this.isFocused && this._docClickListener && typeof document !== 'undefined') {
            document.addEventListener?.('pointerdown', this._docClickListener);
          }
        }, 80);
      }
    } else {
      if (this._docTimer) {
        clearTimeout(this._docTimer);
        this._docTimer = null;
      }
      if (this._windowKeyHandler && typeof window !== 'undefined') {
        window.removeEventListener?.('keydown', this._windowKeyHandler, true);
        this._windowKeyHandler = null;
      }
      if (this._docClickListener && typeof document !== 'undefined') {
        document.removeEventListener?.('pointerdown', this._docClickListener);
        this._docClickListener = null;
      }
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

    // Focus Mode Toggle Button (requested by user: "coloque algum botao de foco de mapa mental no propio makdonw")
    const focusBtn = this.focusBtn = leftTools.createEl('button', {
      cls: 'romus-mindmap-btn romus-mindmap-focus-btn',
      attr: {
        tabindex: '-1',
        title: 'Ativar Modo Foco Independente (Tab cria filhos sem interferência do markdown)',
        'aria-label': 'Modo foco'
      }
    });
    focusBtn.tabIndex = -1;
    focusBtn.onpointerdown = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    focusBtn.onmousedown = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    const focusIconSpan = focusBtn.createSpan({ cls: 'romus-mindmap-focus-icon' });
    setIcon(focusIconSpan, 'crosshair');
    const focusLabel = this.focusLabel = focusBtn.createSpan({ text: 'Modo Foco' });
    focusBtn.onclick = (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      this.toggleFocusMode();
    };

    if (!this.readOnly) {
      const addChildBtn = leftTools.createEl('button', {
        cls: 'romus-mindmap-btn',
        attr: { tabindex: '-1', title: 'Adicionar filho ao nó selecionado (Tab)', 'aria-label': 'Adicionar filho' }
      });
      addChildBtn.tabIndex = -1;
      addChildBtn.onpointerdown = e => e.preventDefault();
      setIcon(addChildBtn, 'plus');
      addChildBtn.createSpan({ text: 'Filho' });
      addChildBtn.onclick = () => this.addNode(this.selectedId);

      const addSiblingBtn = leftTools.createEl('button', {
        cls: 'romus-mindmap-btn',
        attr: { tabindex: '-1', title: 'Adicionar irmão ao nó selecionado (Enter)', 'aria-label': 'Adicionar irmão' }
      });
      addSiblingBtn.tabIndex = -1;
      addSiblingBtn.onpointerdown = e => e.preventDefault();
      setIcon(addSiblingBtn, 'git-commit');
      addSiblingBtn.createSpan({ text: 'Irmão' });
      addSiblingBtn.onclick = () => this.addNode(this.selectedId, true);
    }

    const rightTools = toolbar.createDiv({ cls: 'romus-mindmap-tools-right' });

    const zoomOutBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { tabindex: '-1', title: 'Diminuir zoom (-)', 'aria-label': 'Zoom -' }
    });
    zoomOutBtn.tabIndex = -1;
    zoomOutBtn.onpointerdown = e => e.preventDefault();
    setIcon(zoomOutBtn, 'minus');
    zoomOutBtn.onclick = () => this.zoom(0.85);

    const fitBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn',
      attr: { tabindex: '-1', title: 'Alternar entre 100% e enquadrar', 'aria-label': 'Enquadrar' }
    });
    fitBtn.tabIndex = -1;
    fitBtn.onpointerdown = e => e.preventDefault();
    setIcon(fitBtn, 'maximize-2');
    const zoomDisplay = this.zoomDisplay = fitBtn.createSpan({ text: '100%' });
    fitBtn.onclick = () => {
      if (Math.abs(this.camera.z - 1.0) < 0.05) {
        this.fitToView();
      } else {
        this.centerView();
      }
    };

    const zoomInBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { tabindex: '-1', title: 'Aumentar zoom (+)', 'aria-label': 'Zoom +' }
    });
    zoomInBtn.tabIndex = -1;
    zoomInBtn.onpointerdown = e => e.preventDefault();
    setIcon(zoomInBtn, 'plus');
    zoomInBtn.onclick = () => this.zoom(1.18);

    // Fullscreen Toggle Button
    const fullscreenBtn = this.fullscreenBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { tabindex: '-1', title: 'Expandir / Tela cheia', 'aria-label': 'Tela cheia' }
    });
    fullscreenBtn.tabIndex = -1;
    fullscreenBtn.onpointerdown = e => e.preventDefault();
    setIcon(fullscreenBtn, 'expand');
    fullscreenBtn.onclick = () => this.toggleFullscreen();

    // Close Fullscreen Button (prominent in fullscreen)
    const closeFullscreenBtn = this.closeFullscreenBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn romus-mindmap-close-fullscreen-btn',
      attr: { tabindex: '-1', title: 'Sair da tela cheia (Esc)', 'aria-label': 'Sair da tela cheia' }
    });
    closeFullscreenBtn.tabIndex = -1;
    closeFullscreenBtn.onpointerdown = e => e.preventDefault();
    setIcon(closeFullscreenBtn, 'x');
    closeFullscreenBtn.createSpan({ text: 'Sair da tela cheia (Esc)' });
    closeFullscreenBtn.style.display = 'none';
    closeFullscreenBtn.onclick = () => this.exitFullscreen();

    const codeBtn = rightTools.createEl('button', {
      cls: 'romus-mindmap-btn icon-only',
      attr: { tabindex: '-1', title: 'Ver ou editar código JSON', 'aria-label': 'Código' }
    });
    codeBtn.tabIndex = -1;
    codeBtn.onpointerdown = e => e.preventDefault();
    setIcon(codeBtn, 'code');
    codeBtn.onclick = () => this.toggleCodeOverlay();

    // Delete Entire Mind Map from Note
    if (!this.readOnly && typeof this.options.onRemove === 'function') {
      const deleteMapBtn = rightTools.createEl('button', {
        cls: 'romus-mindmap-btn romus-mindmap-delete-btn icon-only',
        attr: { tabindex: '-1', title: 'Remover mapa mental da nota', 'aria-label': 'Remover mapa mental' }
      });
      deleteMapBtn.tabIndex = -1;
      deleteMapBtn.onpointerdown = e => e.preventDefault();
      setIcon(deleteMapBtn, 'trash-2');
      deleteMapBtn.onclick = () => {
        if (confirm('Deseja realmente remover este mapa mental da nota?')) {
          this.options.onRemove();
        }
      };
    }

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
    const applyBtn = btnWrap.createEl('button', { cls: 'mod-cta', text: 'Aplicar alterações', attr: { tabindex: '-1' } });
    applyBtn.tabIndex = -1;
    const closeBtn = btnWrap.createEl('button', { text: 'Fechar', attr: { tabindex: '-1' } });
    closeBtn.tabIndex = -1;

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
      this.setFocused(true);
      this.container.focus({ preventScroll: true });
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

    this.container.addEventListener('focus', () => this.setFocused(true));
  }

  initKeyboardShortcuts() {
    this.container.addEventListener('keydown', event => {
      this.handleWindowKeydown(event);
    }, true);
  }

  handleWindowKeydown(event) {
    if (!this.isFocused) return;

    // 1. If inline renaming input is open
    if (this.inlineRename) {
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const activeNodeId = String(this.inlineRename.nodeId);
        this.inlineRename.finish();
        this.addNode(activeNodeId, false);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const activeNodeId = String(this.inlineRename.nodeId);
        const currentNode = this.data.nodes.find(n => String(n.id) === activeNodeId);
        this.inlineRename.finish();
        if (currentNode && currentNode.parentId && String(currentNode.id) !== String(this.data.root)) {
          this.addNode(currentNode.id, true);
        } else if (currentNode) {
          this.addNode(currentNode.id, false);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        this.inlineRename.cancel();
        this.container?.focus({ preventScroll: true });
        return;
      }
      // While typing inside rename input: allow normal character input, but stop ProseMirror leak
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }

    // 2. If focus is inside a textarea or code overlay, let it handle its own typing
    if (event.target?.closest?.('.romus-mindmap-code-overlay, .romus-mindmap-subnote-modal, textarea')) {
      return;
    }

    // 3. Tab: Add child node to selected
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!this.selectedId) {
        this.selectedId = String(this.data.root || this.data.nodes[0]?.id);
        this.renderSelection();
      }
      const normSelectedId = String(this.selectedId);
      const targetNode = this.data.nodes.find(n => String(n.id) === normSelectedId)
        || this.data.nodes.find(n => String(n.id) === String(this.data.root))
        || this.data.nodes[0];
      if (targetNode) {
        this.addNode(targetNode.id, false);
      }
      return;
    }

    // 4. Enter: Add sibling node (or child if root)
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!this.selectedId) {
        this.selectedId = String(this.data.root || this.data.nodes[0]?.id);
        this.renderSelection();
      }
      const normSelectedId = String(this.selectedId);
      const targetNode = this.data.nodes.find(n => String(n.id) === normSelectedId)
        || this.data.nodes.find(n => String(n.id) === String(this.data.root))
        || this.data.nodes[0];
      if (targetNode) {
        if (targetNode.parentId && String(targetNode.id) !== String(this.data.root)) {
          this.addNode(targetNode.id, true);
        } else {
          this.addNode(targetNode.id, false);
        }
      }
      return;
    }

    // 5. Escape: Exit focus mode or exit fullscreen
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (this.isFullscreen || this.container.classList.contains('is-fullscreen')) {
        this.exitFullscreen();
      } else {
        this.setFocused(false);
      }
      return;
    }

    // 6. F2 or Space: Rename existing node keeping text
    if (event.key === 'F2' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!this.selectedId) {
        this.selectedId = this.data.root || this.data.nodes[0]?.id;
        this.renderSelection();
      }
      const selectedNode = this.data.nodes.find(n => n.id === this.selectedId) || this.data.nodes[0];
      if (selectedNode) this.renameNodeInline(selectedNode.id, false);
      return;
    }

    // 7. Single Character: direct typing on selected node
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!this.selectedId) {
        this.selectedId = this.data.root || this.data.nodes[0]?.id;
        this.renderSelection();
      }
      const selectedNode = this.data.nodes.find(n => n.id === this.selectedId) || this.data.nodes[0];
      if (selectedNode) {
        this.renameNodeInline(selectedNode.id, true);
        if (this.inlineRename && this.inlineRename.input) {
          this.inlineRename.input.value = event.key;
        }
      }
      return;
    }

    // 8. Delete / Backspace: Delete selected node (unless root)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (this.selectedId && this.selectedId !== this.data.root) {
        this.deleteNode(this.selectedId);
      }
      return;
    }

    // 9. Arrow keys: Tree navigation
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      this.navigateTree(event.key);
      return;
    }

    // 10. Zoom keys
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      this.zoom(1.15);
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      this.zoom(0.85);
      return;
    }

    if (event.key === '0') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      this.centerView();
      return;
    }
  }

  navigateTree(direction) {
    if (!this.selectedId) {
      this.selectNode(this.data.root || this.data.nodes[0]?.id);
      return;
    }
    const current = this.data.nodes.find(n => String(n.id) === String(this.selectedId));
    if (!current) return;

    if (direction === 'ArrowRight') {
      const children = this.data.nodes.filter(n => String(n.parentId) === String(current.id));
      if (children.length > 0) {
        current.collapsed = false;
        this.layoutAndRender();
        this.selectNode(children[0].id);
      }
    } else if (direction === 'ArrowLeft') {
      if (current.parentId) {
        this.selectNode(current.parentId);
      }
    } else if (direction === 'ArrowDown') {
      const siblings = this.data.nodes.filter(n => String(n.parentId) === String(current.parentId));
      const idx = siblings.findIndex(n => String(n.id) === String(current.id));
      if (idx !== -1 && idx < siblings.length - 1) {
        this.selectNode(siblings[idx + 1].id);
      }
    } else if (direction === 'ArrowUp') {
      const siblings = this.data.nodes.filter(n => String(n.parentId) === String(current.parentId));
      const idx = siblings.findIndex(n => String(n.id) === String(current.id));
      if (idx > 0) {
        this.selectNode(siblings[idx - 1].id);
      }
    }
  }

  zoom(factor, pivotX, pivotY) {
    const stage = this.stage;
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    const px = typeof pivotX === 'number' ? pivotX : w / 2;
    const py = typeof pivotY === 'number' ? pivotY : h / 2;

    const oldZ = this.camera.z;
    const newZ = Math.min(2.5, Math.max(0.25, Math.round(oldZ * factor * 100) / 100));
    if (newZ === oldZ) return;

    this.camera.x = px - (px - this.camera.x) * (newZ / oldZ);
    this.camera.y = py - (py - this.camera.y) * (newZ / oldZ);
    this.camera.z = newZ;
    this.applyCamera();
  }

  centerView() {
    if (!this.lastLayoutResult) return;
    const stageW = this.stage.offsetWidth || this.container.offsetWidth || 600;
    const stageH = this.stage.offsetHeight || this.container.offsetHeight || 400;

    const rootPos = this.lastLayoutResult.positions.get(this.data.root);
    if (rootPos) {
      const rootCenterX = rootPos.x + rootPos.w / 2;
      const rootCenterY = rootPos.y + rootPos.h / 2;
      this.camera = {
        x: Math.round(stageW * 0.28 - rootCenterX),
        y: Math.round(stageH * 0.5 - rootCenterY),
        z: 1.0
      };
    } else {
      const { bbox } = this.lastLayoutResult;
      this.camera = {
        x: Math.round((stageW - bbox.width) / 2 - bbox.minX),
        y: Math.round((stageH - bbox.height) / 2 - bbox.minY),
        z: 1.0
      };
    }
    this.applyCamera();
  }

  fitToView(silent = false) {
    if (!this.lastLayoutResult) return;
    const { bbox } = this.lastLayoutResult;
    const stageW = this.stage.offsetWidth || this.container.offsetWidth || 600;
    const stageH = this.stage.offsetHeight || this.container.offsetHeight || 400;

    const pad = 48;
    const availW = Math.max(100, stageW - pad * 2);
    const availH = Math.max(100, stageH - pad * 2);
    const scaleX = availW / Math.max(1, bbox.width);
    const scaleY = availH / Math.max(1, bbox.height);

    let z = 1.0;
    if (bbox.width > availW || bbox.height > availH) {
      z = Math.min(1.0, Math.max(0.35, Math.min(scaleX, scaleY)));
      z = Math.round(z * 100) / 100;
    }

    const x = Math.round((stageW - bbox.width * z) / 2 - (bbox.minX - 32) * z);
    const y = Math.round((stageH - bbox.height * z) / 2 - (bbox.minY - 32) * z);

    this.camera = { x, y, z };
    this.applyCamera();
  }

  applyCamera() {
    const x = Math.round(this.camera.x);
    const y = Math.round(this.camera.y);
    const z = Math.round(this.camera.z * 1000) / 1000;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = `${Math.round(z * 100)}%`;
    }
  }

  toggleFullscreen(forceState) {
    const isFull = typeof forceState === 'boolean'
      ? this.container.classList.toggle('is-fullscreen', forceState)
      : this.container.classList.toggle('is-fullscreen');

    if (isFull) {
      if (this.closeFullscreenBtn) this.closeFullscreenBtn.style.display = 'inline-flex';
      if (this.fullscreenBtn) {
        setIcon(this.fullscreenBtn, 'minimize-2');
        this.fullscreenBtn.title = 'Restaurar tamanho normal (Esc)';
      }
      if (!this._fullscreenEscHandler) {
        this._fullscreenEscHandler = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.exitFullscreen();
          }
        };
        window.addEventListener('keydown', this._fullscreenEscHandler, true);
      }
    } else {
      if (this.closeFullscreenBtn) this.closeFullscreenBtn.style.display = 'none';
      if (this.fullscreenBtn) {
        setIcon(this.fullscreenBtn, 'expand');
        this.fullscreenBtn.title = 'Expandir / Tela cheia';
      }
      if (this._fullscreenEscHandler) {
        window.removeEventListener('keydown', this._fullscreenEscHandler, true);
        this._fullscreenEscHandler = null;
      }
    }

    setTimeout(() => this.fitToView(), 60);
  }

  exitFullscreen() {
    this.toggleFullscreen(false);
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
    el.dataset.nodeId = String(node.id);

    const head = el.createDiv({ cls: 'ia-card-head' });

    // Title label
    head.createSpan({ cls: 'ia-card-title', text: node.title });

    // Controls wrapper (aligned to right)
    const controls = head.createDiv({ cls: 'romus-mind-node-controls' });

    // Subnote (+ Nota) button
    const noteBadge = controls.createSpan({ cls: 'ia-mind-note-badge', attr: { tabindex: '-1' } });
    noteBadge.tabIndex = -1;
    noteBadge.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); };
    setIcon(noteBadge, 'file-text');
    noteBadge.createSpan({ text: node.body ? 'Nota' : '+ Nota' });
    noteBadge.title = node.body ? 'Ver/editar subnota' : 'Adicionar subnota/caixa de texto';

    // Collapse toggle button
    const collapseBtn = controls.createEl('button', { cls: 'ia-mind-collapse-btn', attr: { tabindex: '-1' } });
    collapseBtn.tabIndex = -1;
    collapseBtn.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); };
    setIcon(collapseBtn, 'chevron-down');

    // Add child button
    const addChildBtn = controls.createEl('button', { cls: 'ia-mind-add-btn', attr: { tabindex: '-1', title: 'Adicionar filho (Tab)' } });
    addChildBtn.tabIndex = -1;
    addChildBtn.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); };
    setIcon(addChildBtn, 'plus');

    // Subnote body container
    const subnoteBox = el.createDiv({ cls: 'ia-mind-subnote' });
    subnoteBox.createDiv({ cls: 'ia-mind-subnote-text' });

    // Events: click or pointerdown anywhere on the card or head selects this node immediately
    const selectThisNode = (e) => {
      e?.stopPropagation?.();
      this.setFocused(true);
      this.selectNode(node.id, true);
    };

    el.onpointerdown = selectThisNode;
    el.onclick = selectThisNode;

    head.onpointerdown = e => {
      if (e.target?.closest?.('.romus-mind-node-controls, input')) return;
      selectThisNode(e);
    };
    head.onclick = e => {
      if (e.target?.closest?.('.romus-mind-node-controls, input')) return;
      selectThisNode(e);
    };

    el.ondblclick = e => {
      e.stopPropagation();
      e.preventDefault();
      this.renameNodeInline(node.id, false);
    };

    el.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      this.selectNode(node.id, true);
      this.showContextMenu(node.id, e);
    };

    noteBadge.onclick = e => {
      e.stopPropagation();
      this.selectNode(node.id, true);
      this.editSubnote(node.id);
    };

    collapseBtn.onclick = e => {
      e.stopPropagation();
      this.selectNode(node.id, true);
      this.toggleCollapse(node.id);
    };

    addChildBtn.onclick = e => {
      e.stopPropagation();
      this.selectNode(node.id, true);
      this.addNode(node.id, false);
    };

    subnoteBox.ondblclick = e => {
      e.stopPropagation();
      this.editSubnote(node.id);
    };

    return el;
  }

  updateNodeElement(el, pos) {
    const node = pos.node;
    const normSelectedId = String(this.selectedId);
    const normNodeId = String(node.id);
    const normRootId = String(this.data.root);

    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.width = `${pos.w}px`;
    el.style.setProperty('--ia-mind-color', node.color || MINDMAP_COLORS[0]);

    el.classList.toggle('is-selected', normSelectedId === normNodeId);
    el.classList.toggle('is-root', normNodeId === normRootId);
    el.classList.toggle('has-subnote', Boolean(node.body));
    el.classList.toggle('is-relation', Boolean(node.relation));

    const head = el.querySelector('.ia-card-head');
    if (head) {
      head.style.height = `${pos.pillH}px`;
      const titleSpan = head.querySelector('.ia-card-title');
      if (titleSpan) titleSpan.textContent = node.title || (node.relation ? 'Relação' : 'Novo tópico');

      const controls = head.querySelector('.romus-mind-node-controls');
      const noteBadge = controls ? controls.querySelector('.ia-mind-note-badge') : head.querySelector('.ia-mind-note-badge');
      if (noteBadge) {
        noteBadge.classList.toggle('is-linked', Boolean(node.body));
        const badgeLabel = noteBadge.querySelector('span:last-child');
        if (badgeLabel) badgeLabel.textContent = node.body ? 'Nota' : '+ Nota';
      }

      const hasChildren = this.data.nodes.some(n => String(n.parentId) === normNodeId);
      const collapseBtn = controls ? controls.querySelector('.ia-mind-collapse-btn') : head.querySelector('.ia-mind-collapse-btn');
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

  selectNode(id, focusContainer = true) {
    const normId = String(id);
    if (this.inlineRename && String(this.inlineRename.nodeId) !== normId) {
      this.inlineRename.finish();
    }
    this.selectedId = normId;
    for (const [nodeId, el] of this.nodeElements.entries()) {
      el.classList.toggle('is-selected', String(nodeId) === normId);
    }
    if (focusContainer) {
      this.setFocused(true);
      if (this.container && !this.inlineRename) {
        this.container.focus({ preventScroll: true });
      }
    }
    this.ensureNodeVisible(normId);
  }

  findSubtreeEndIndex(node) {
    const descendantIds = new Set([String(node.id)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of this.data.nodes) {
        if (n.parentId && descendantIds.has(String(n.parentId)) && !descendantIds.has(String(n.id))) {
          descendantIds.add(String(n.id));
          changed = true;
        }
      }
    }
    let lastIdx = this.data.nodes.findIndex(n => String(n.id) === String(node.id));
    for (let i = this.data.nodes.length - 1; i >= 0; i--) {
      if (descendantIds.has(String(this.data.nodes[i].id))) {
        return i;
      }
    }
    return lastIdx !== -1 ? lastIdx : this.data.nodes.length - 1;
  }

  ensureNodeVisible(nodeId) {
    if (!this.lastLayoutResult || !this.stage) return;
    const pos = this.lastLayoutResult.positions.get(String(nodeId));
    if (!pos) return;

    const stageW = this.stage.offsetWidth || this.container?.offsetWidth || 600;
    const stageH = this.stage.offsetHeight || this.container?.offsetHeight || 400;
    const z = this.camera?.z || 1.0;

    const screenX = this.camera.x + pos.x * z;
    const screenY = this.camera.y + pos.y * z;
    const screenW = pos.w * z;
    const screenH = pos.h * z;

    const pad = 40;
    let dx = 0;
    let dy = 0;

    if (screenY + screenH > stageH - pad) {
      dy = (stageH - pad) - (screenY + screenH);
    } else if (screenY < pad + 36) {
      dy = (pad + 36) - screenY;
    }

    if (screenX + screenW > stageW - pad) {
      dx = (stageW - pad) - (screenX + screenW);
    } else if (screenX < pad) {
      dx = pad - screenX;
    }

    if (dx !== 0 || dy !== 0) {
      this.camera.x += dx;
      this.camera.y += dy;
      this.applyCamera();
    }
  }

  addNode(parentId, sibling = false, relation = false) {
    if (this.readOnly) return;
    this.inlineRename?.finish();

    const targetRefId = String(parentId || this.selectedId || this.data.root);
    const current = this.data.nodes.find(n => String(n.id) === targetRefId)
      || this.data.nodes.find(n => String(n.id) === String(this.data.root))
      || this.data.nodes[0];

    if (!current) return;

    const isRoot = String(current.id) === String(this.data.root);
    let actualParent = null;

    if (sibling) {
      if (!isRoot && current.parentId) {
        actualParent = this.data.nodes.find(n => String(n.id) === String(current.parentId));
      }
      if (!actualParent) {
        // Root has no sibling; add child of root instead
        actualParent = this.data.nodes.find(n => String(n.id) === String(this.data.root)) || current;
      }
    } else {
      actualParent = current;
    }

    if (!actualParent) return;

    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    let color;
    if (String(actualParent.id) === String(this.data.root)) {
      const childCount = this.data.nodes.filter(n => String(n.parentId) === String(actualParent.id)).length;
      color = MINDMAP_COLORS[(childCount) % MINDMAP_COLORS.length];
    } else {
      color = actualParent.color || MINDMAP_COLORS[0];
    }

    const defaultTitle = relation ? 'Relação' : 'Novo tópico';
    const newNode = {
      id: newId,
      parentId: String(actualParent.id),
      title: defaultTitle,
      color,
      body: '',
      collapsed: false,
      relation: Boolean(relation)
    };

    actualParent.collapsed = false;

    if (sibling && !isRoot) {
      const insertIdx = this.findSubtreeEndIndex(current) + 1;
      this.data.nodes.splice(insertIdx, 0, newNode);
    } else {
      const insertIdx = this.findSubtreeEndIndex(actualParent) + 1;
      this.data.nodes.splice(insertIdx, 0, newNode);
    }

    this.selectedId = String(newId);
    this.layoutAndRender();
    this.ensureNodeVisible(newId);

    // Immediately open inline rename with input focused and ready to type
    this.renameNodeInline(newId, true);

    return newNode;
  }

  renameNodeInline(nodeId, isFresh = false) {
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

    const defaultPlaceholder = node.relation ? 'Relação' : 'Novo tópico';
    const initialValue = isFresh ? '' : (node.title || defaultPlaceholder);

    const input = head.createEl('input', {
      cls: node.relation ? 'ia-mind-rename ia-relation-rename' : 'ia-mind-rename',
      type: 'text',
      value: initialValue,
      attr: {
        'aria-label': node.relation ? 'Rótulo da relação' : 'Título do nó',
        placeholder: defaultPlaceholder
      }
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
        const finalTitle = val || (isFresh ? defaultPlaceholder : (node.title || defaultPlaceholder));
        node.title = finalTitle;
        label.textContent = finalTitle;
        this.layoutAndRender();
        this.emitChange();
      } else if (isFresh) {
        node.title = defaultPlaceholder;
        label.textContent = defaultPlaceholder;
        this.layoutAndRender();
        this.emitChange();
      }
      this.inlineRename = null;
    };

    this.inlineRename = { nodeId, input, finish: commit, cancel: () => commit(true) };

    input.onpointerdown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.ondblclick = e => e.stopPropagation();

    input.onkeydown = e => {
      e.stopPropagation();
      if (e.isComposing) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commit();
        if (node.parentId && String(node.id) !== String(this.data.root)) {
          this.addNode(node.id, true);
        } else {
          this.addNode(node.id, false);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        commit();
        this.addNode(node.id, false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        commit(true);
        this.container.focus({ preventScroll: true });
      }
    };

    input.onblur = () => {
      setTimeout(() => {
        if (!finished && document.activeElement !== input) {
          commit();
        }
      }, 50);
    };

    const setFocus = () => {
      if (!input.isConnected) return;
      input.focus({ preventScroll: true });
      if (!isFresh) {
        input.select();
        try {
          input.setSelectionRange(0, input.value.length);
        } catch (_) {}
      }
    };
    setFocus();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(setFocus);
    }
    setTimeout(setFocus, 20);
  }

  editSubnote(nodeId) {
    if (this.readOnly) return;
    const normId = String(nodeId);
    const node = this.data.nodes.find(n => String(n.id) === normId);
    if (!node) return;

    new MindSubnoteModal(this.app, node, newBody => {
      node.body = newBody;
      this.layoutAndRender();
      this.emitChange();
    }).open();
  }

  toggleCollapse(nodeId) {
    const normId = String(nodeId);
    const node = this.data.nodes.find(n => String(n.id) === normId);
    if (!node) return;
    node.collapsed = !node.collapsed;
    this.layoutAndRender();
    this.emitChange();
  }

  deleteNode(nodeId) {
    if (this.readOnly) return;
    const normId = String(nodeId);
    if (normId === String(this.data.root)) {
      new Notice('Não é possível excluir o tópico central.');
      return;
    }

    const node = this.data.nodes.find(n => String(n.id) === normId);
    if (!node) return;

    // Collect all descendants recursively
    const toDelete = new Set([normId]);
    let added = true;
    while (added) {
      added = false;
      for (const n of this.data.nodes) {
        if (n.parentId && toDelete.has(String(n.parentId)) && !toDelete.has(String(n.id))) {
          toDelete.add(String(n.id));
          added = true;
        }
      }
    }

    this.data.nodes = this.data.nodes.filter(n => !toDelete.has(String(n.id)));
    this.selectedId = String(node.parentId || this.data.root);
    this.layoutAndRender();
    this.emitChange();
  }

  showContextMenu(nodeId, event) {
    const normId = String(nodeId);
    const node = this.data.nodes.find(n => String(n.id) === normId);
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
    if (this._docTimer) {
      clearTimeout(this._docTimer);
      this._docTimer = null;
    }
    this.setFocused(false);
    this.inlineRename?.cancel();
    if (this._fullscreenEscHandler && typeof window !== 'undefined') {
      window.removeEventListener?.('keydown', this._fullscreenEscHandler, true);
      this._fullscreenEscHandler = null;
    }
    this.nodeElements.clear();
    this.container.empty?.();
  }
}
