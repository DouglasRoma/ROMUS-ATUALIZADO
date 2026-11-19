import {setIcon} from './compat.js';
import {noteFlashcardBlock, normalizeFlashcardsToBullets} from './note-content.js';

export const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

/**
 * Searches for all occurrences of query in plain source text, returning start/end positions and line snippets.
 */
export function findTextOccurrences(source, query) {
  if (!source || !query) return [];
  const foldedSource = fold(source);
  const foldedQuery = fold(query.trim());
  if (!foldedQuery) return [];

  const results = [];
  let at = 0;
  const qLen = foldedQuery.length;

  while ((at = foldedSource.indexOf(foldedQuery, at)) >= 0) {
    const lineStart = source.lastIndexOf('\n', at - 1) + 1;
    let lineEnd = source.indexOf('\n', at);
    if (lineEnd === -1) lineEnd = source.length;

    const snippetStart = Math.max(lineStart, at - 35);
    const snippetEnd = Math.min(lineEnd, at + qLen + 40);
    const snippet = (snippetStart > lineStart ? '…' : '') +
      source.slice(snippetStart, snippetEnd).trim() +
      (snippetEnd < lineEnd ? '…' : '');

    results.push({
      start: at,
      end: at + qLen,
      text: source.slice(at, at + qLen),
      lineText: source.slice(lineStart, lineEnd).trim(),
      snippet: snippet || source.slice(at, at + qLen)
    });
    at += Math.max(1, qLen);
  }
  return results;
}

/**
 * Searches for all occurrences of query in TipTap/ProseMirror formatted editor doc.
 */
export function findFormattedMatches(editor, query) {
  if (!editor?.state?.doc || !query) return [];
  const foldedQuery = fold(query.trim());
  if (!foldedQuery) return [];

  const matches = [];
  const qLen = foldedQuery.length;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text;
    const foldedText = fold(text);
    let at = 0;
    while ((at = foldedText.indexOf(foldedQuery, at)) >= 0) {
      const from = pos + at;
      const to = from + qLen;
      const snippetStart = Math.max(0, at - 35);
      const snippetEnd = Math.min(text.length, at + qLen + 40);
      const snippet = (snippetStart > 0 ? '…' : '') +
        text.slice(snippetStart, snippetEnd).trim() +
        (snippetEnd < text.length ? '…' : '');

      matches.push({
        from,
        to,
        start: from,
        end: to,
        text: text.slice(at, at + qLen),
        snippet: snippet || text.slice(at, at + qLen)
      });
      at += Math.max(1, qLen);
    }
  });
  return matches;
}

/**
 * Extracts current flashcard markdown source from note editor or note text.
 */
export function getFlashcardSource(owner) {
  if (owner.studyTextarea && owner.studyTextarea.isConnected) {
    return owner.studyTextarea.value;
  }
  const raw = owner.input?.value || '';
  const block = noteFlashcardBlock(raw);
  let source = block.source;
  if (!source) {
    const tools = owner.app?.plugin?.reviewSourceTools?.();
    const loose = tools?.parseNoteFlashcards?.(raw, owner.file?.path || '')?.cards || [];
    if (loose.length && tools?.serializeFlashcardRows) {
      source = tools.serializeFlashcardRows(loose);
    }
  }
  return normalizeFlashcardsToBullets(source || '');
}

/**
 * Collects all matches across note body AND flashcards.
 */
export function collectNoteAndFlashcardMatches(owner, query) {
  const q = (query || '').trim();
  if (!q) return { matches: [], noteCount: 0, flashcardCount: 0 };

  const noteMatches = [];
  if (owner.editorMode === 'formatted' && owner.formatted?.editor) {
    const raw = findFormattedMatches(owner.formatted.editor, q);
    for (const m of raw) {
      noteMatches.push({
        ...m,
        section: 'note',
        mode: 'formatted',
        icon: 'file-text',
        badge: 'Nota'
      });
    }
  } else if (owner.editorMode === 'source' && owner.sourceInput) {
    const raw = findTextOccurrences(owner.sourceInput.value, q);
    for (const m of raw) {
      noteMatches.push({
        ...m,
        section: 'note',
        mode: 'source',
        icon: 'file-text',
        badge: 'Nota'
      });
    }
  } else if (owner.rendered) {
    const text = owner.rendered.textContent || '';
    const raw = findTextOccurrences(text, q);
    for (const m of raw) {
      noteMatches.push({
        ...m,
        section: 'note',
        mode: 'preview',
        icon: 'file-text',
        badge: 'Nota'
      });
    }
  }

  const fcSource = getFlashcardSource(owner);
  const rawFc = findTextOccurrences(fcSource, q);
  const flashcardMatches = rawFc.map(m => ({
    ...m,
    section: 'flashcard',
    mode: 'flashcard',
    icon: 'layers',
    badge: 'Flashcard'
  }));

  const matches = [...noteMatches, ...flashcardMatches];
  return {
    matches,
    noteCount: noteMatches.length,
    flashcardCount: flashcardMatches.length
  };
}

/**
 * Navigates editor to selected match, auto-revealing flashcards if match is in flashcards.
 */
export async function jumpToNoteMatch(owner, match, options = {}) {
  if (!match) return;
  const focusTarget = options.focusTarget === true;

  if (match.section === 'note') {
    if (match.mode === 'formatted' && owner.formatted?.editor) {
      const editor = owner.formatted.editor;
      editor.commands.setTextSelection({ from: match.from, to: match.to });
      const dom = editor.view.domAtPos(match.from)?.node;
      const el = dom?.nodeType === 1 ? dom : dom?.parentElement;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (focusTarget) editor.view.dom.focus({ preventScroll: true });
    } else if (match.mode === 'source' && owner.sourceInput) {
      const input = owner.sourceInput;
      input.setSelectionRange(match.start, match.end);
      const height = (typeof getComputedStyle !== 'undefined' ? parseFloat(getComputedStyle(input).lineHeight) : 22) || 22;
      const line = input.value.slice(0, match.start).split('\n').length - 1;
      input.scrollTop = Math.max(0, line * height - input.clientHeight / 2);
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (focusTarget) input.focus({ preventScroll: true });
    } else if (match.mode === 'preview') {
      owner.rendered?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return;
  }

  if (match.section === 'flashcard') {
    if (!owner.showStudy || owner.studyPanel?.hidden) {
      owner.showStudy = true;
      owner.studyToggle?.setAttribute('aria-pressed', 'true');
      if (owner.studyToggle) owner.studyToggle.title = 'Ocultar flashcards e mapa mental · Ctrl+Alt+F';
      await owner.refreshContent();
    }

    owner.studyPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    if (owner.studyTextarea) {
      owner.studyTextarea.setSelectionRange(match.start, match.end);
      const height = (typeof getComputedStyle !== 'undefined' ? parseFloat(getComputedStyle(owner.studyTextarea).lineHeight) : 22) || 22;
      const line = owner.studyTextarea.value.slice(0, match.start).split('\n').length - 1;
      owner.studyTextarea.scrollTop = Math.max(0, line * height - owner.studyTextarea.clientHeight / 2);
      if (focusTarget) owner.studyTextarea.focus({ preventScroll: true });
    }
  }
}

/**
 * Installs interactive in-note Find bar and keyboard shortcuts on NoteEditor.
 */
export function installNoteFind(editor) {
  let root = null, input = null, status = null, list = null;
  let matches = [], selected = 0, noteCount = 0, flashcardCount = 0;
  let filtering = false;

  const close = () => {
    if (!root) return;
    root.remove();
    root = null;
    input = null;
    status = null;
    list = null;
    matches = [];
    if (editor.editorMode === 'formatted') {
      editor.formatted?.editor?.view?.dom?.focus({ preventScroll: true });
    } else if (editor.editorMode === 'source') {
      editor.sourceInput?.focus({ preventScroll: true });
    }
  };

  const updateStatus = () => {
    if (!status) return;
    const q = input?.value?.trim() || '';
    if (!q) {
      status.textContent = '';
      return;
    }
    if (!matches.length) {
      status.textContent = 'Nenhum resultado';
      return;
    }
    const current = selected + 1;
    let detail = '';
    if (noteCount > 0 && flashcardCount > 0) {
      detail = ` (${noteCount} na nota, ${flashcardCount} nos flashcards)`;
    } else if (flashcardCount > 0 && noteCount === 0) {
      detail = ' (nos flashcards)';
    } else if (noteCount > 0 && flashcardCount === 0) {
      detail = ' (na nota)';
    }
    status.textContent = `${current} de ${matches.length}${detail}`;
  };

  const paint = () => {
    if (!list) return;
    list.replaceChildren();
    updateStatus();

    const start = Math.max(0, Math.min(selected - 10, matches.length - 30));
    for (let i = start; i < Math.min(matches.length, start + 30); i++) {
      const item = matches[i];
      const btn = list.createEl('button', {
        cls: 'romus-find-result atlas-note-find-result',
        attr: {
          role: 'option',
          'aria-selected': String(selected === i),
          id: 'atlas-find-result-' + i
        }
      });
      const icon = btn.createSpan();
      setIcon(icon, item.icon);

      const snippetSpan = btn.createSpan({ cls: 'atlas-find-snippet' });
      const queryFolded = fold(input.value.trim());
      const foldedSnippet = fold(item.snippet);
      const at = foldedSnippet.indexOf(queryFolded);
      if (at >= 0) {
        snippetSpan.append(document.createTextNode(item.snippet.slice(0, at)));
        snippetSpan.createEl('mark', { text: item.snippet.slice(at, at + queryFolded.length) });
        snippetSpan.append(document.createTextNode(item.snippet.slice(at + queryFolded.length)));
      } else {
        snippetSpan.textContent = item.snippet;
      }

      btn.createEl('small', { cls: `atlas-find-tag atlas-find-tag-${item.section}`, text: item.badge });

      btn.onclick = () => {
        selected = i;
        choose(false);
        input?.focus({ preventScroll: true });
      };
    }
    input.setAttribute('aria-expanded', String(!!matches.length));
    if (matches.length) input.setAttribute('aria-activedescendant', 'atlas-find-result-' + selected);
    else input.removeAttribute('aria-activedescendant');
  };

  const choose = async (focusTarget = false) => {
    const item = matches[selected];
    if (!item) return;
    paint();
    await jumpToNoteMatch(editor, item, { focusTarget });
    if (!focusTarget && input && document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  };

  const step = delta => {
    if (!matches.length) return;
    selected = (selected + delta + matches.length) % matches.length;
    choose(false);
    input?.focus({ preventScroll: true });
  };

  const filter = () => {
    if (filtering) return;
    filtering = true;
    try {
      const query = input?.value || '';
      const res = collectNoteAndFlashcardMatches(editor, query);
      matches = res.matches;
      noteCount = res.noteCount;
      flashcardCount = res.flashcardCount;
      selected = 0;
      paint();
      if (matches.length && query.trim()) {
        choose(false);
      }
    } finally {
      filtering = false;
      if (input && document.activeElement !== input) {
        input.focus({ preventScroll: true });
      }
    }
  };

  editor.openNoteFind = () => {
    if (root?.isConnected) {
      input.focus();
      input.select();
      return;
    }

    root = editor.contentEl.createDiv({
      cls: 'romus-board-find atlas-note-find',
      attr: { role: 'search', 'aria-label': 'Buscar nesta nota e flashcards' }
    });

    const bar = root.createDiv({ cls: 'romus-board-find-bar atlas-note-find-bar' });
    const icon = bar.createSpan();
    setIcon(icon, 'search');

    input = bar.createEl('input', {
      attr: {
        type: 'search',
        placeholder: 'Buscar na nota e flashcards…',
        'aria-label': 'Buscar na nota e flashcards',
        role: 'combobox',
        'aria-autocomplete': 'list'
      }
    });

    status = bar.createSpan({
      cls: 'romus-board-find-count atlas-note-find-count',
      attr: { role: 'status', 'aria-live': 'polite' }
    });

    for (const [label, iconName, run] of [
      ['Resultado anterior (Shift+Enter)', 'chevron-up', () => step(-1)],
      ['Próximo resultado (Enter)', 'chevron-down', () => step(1)],
      ['Fechar busca (Esc)', 'x', close]
    ]) {
      const b = bar.createEl('button', {
        attr: { type: 'button', 'aria-label': label, title: label }
      });
      setIcon(b, iconName);
      b.onclick = run;
    }

    list = root.createDiv({
      cls: 'romus-board-find-list atlas-note-find-list',
      attr: { role: 'listbox', 'aria-label': 'Resultados da busca na nota' }
    });

    root.addEventListener('pointerdown', e => e.stopPropagation());
    root.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

    input.oninput = filter;
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) step(-1);
        else step(1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        step(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };

    filter();
    input.focus();
  };

  const toggleFlashcards = async () => {
    await editor.toggleStudyContent();
    if (editor.showStudy) {
      editor.studyPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      editor.studyTextarea?.focus({ preventScroll: true });
    } else {
      if (editor.editorMode === 'formatted') {
        editor.formatted?.editor?.view?.dom?.focus({ preventScroll: true });
      } else if (editor.editorMode === 'source') {
        editor.sourceInput?.focus({ preventScroll: true });
      }
    }
  };

  editor.toggleFlashcardSection = toggleFlashcards;

  const onKeydown = event => {
    if (event.defaultPrevented) return;
    const isMod = event.ctrlKey || event.metaKey;

    // Check Ctrl+F (Find in note + flashcards)
    if (isMod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
      if (document.querySelector('.modal-container:not(.atlas-docked-modal)')) return;
      const inThis = editor.contentEl && editor.contentEl.contains(event.target);
      const isActive = editor.leaf && editor.app.workspace.activeLeaf === editor.leaf;
      if (!inThis && !isActive) return;
      const other = event.target.closest?.('.note-editor');
      if (other && other !== editor.contentEl) return;

      event.preventDefault();
      event.stopPropagation();
      editor.openNoteFind();
      return;
    }

    // Check shortcut to toggle flashcard section:
    // Ctrl+Alt+F OR Ctrl+Shift+C OR Alt+Shift+F
    const isToggleFlashcard =
      (isMod && event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') ||
      (isMod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') ||
      (!isMod && event.altKey && event.shiftKey && event.key.toLowerCase() === 'f');

    if (isToggleFlashcard) {
      if (document.querySelector('.modal-container:not(.atlas-docked-modal)')) return;
      const inThis = editor.contentEl && editor.contentEl.contains(event.target);
      const isActive = editor.leaf && editor.app.workspace.activeLeaf === editor.leaf;
      if (!inThis && !isActive) return;
      const other = event.target.closest?.('.note-editor');
      if (other && other !== editor.contentEl) return;

      event.preventDefault();
      event.stopPropagation();
      toggleFlashcards();
      return;
    }
  };

  editor.registerDomEvent(document, 'keydown', onKeydown);

  const leafId = editor.leaf?.id || Math.random().toString(36).slice(2);
  const findCommand = {
    id: 'find-in-note-' + leafId,
    name: 'Buscar nesta nota e flashcards · Ctrl+F',
    checkCallback: checking => {
      const active = editor.leaf ? editor.app.workspace.activeLeaf === editor.leaf : true;
      if (!active) return false;
      if (!checking) editor.openNoteFind();
      return true;
    }
  };
  const flashcardCommand = {
    id: 'toggle-note-flashcards-' + leafId,
    name: 'Mostrar / ocultar flashcards da nota · Ctrl+Alt+F',
    checkCallback: checking => {
      const active = editor.leaf ? editor.app.workspace.activeLeaf === editor.leaf : true;
      if (!active) return false;
      if (!checking) toggleFlashcards();
      return true;
    }
  };

  editor.app.commands.push(findCommand, flashcardCommand);

  return {
    close,
    dispose: () => {
      close();
      const i1 = editor.app.commands.indexOf(findCommand);
      if (i1 >= 0) editor.app.commands.splice(i1, 1);
      const i2 = editor.app.commands.indexOf(flashcardCommand);
      if (i2 >= 0) editor.app.commands.splice(i2, 1);
    }
  };
}
