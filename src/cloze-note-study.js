import {Component, MarkdownRenderer, setIcon, Notice} from './compat.js';
import {splitNoteContent} from './note-content.js';

export class ClozeNoteStudy {
  constructor(view) {
    this.view = view;
    this.app = view.app;
    this.component = new Component();
    this.maskOtherCards = view.maskOtherCards ?? true;
    this.container = document.createElement('div');
    this.container.className = 'romus-cloze-note-study';
    this.answeredPills = view.answeredClozes || (view.answeredClozes = new Set());
  }

  async render(item) {
    this.component.unload();
    this.container.empty();
    if (!item) return this.container;

    const entry = item.entry;
    const notePath = entry.sourcePath || this.view.spec.notePath;
    const note = notePath && this.app.vault.getFileByPath(notePath);
    if (!note) {
      this.container.createEl('p', { cls: 'ia-muted', text: 'Nota correspondente não encontrada.' });
      return this.container;
    }

    // Top control bar
    const bar = this.container.createDiv({ cls: 'romus-cloze-study-bar' });
    const info = bar.createDiv({ cls: 'romus-cloze-study-info' });
    info.createSpan({ cls: 'romus-cloze-study-badge', text: 'CLOZE NA NOTA · REMNOTE' });
    info.createSpan({ cls: 'romus-cloze-study-title', text: note.basename });

    const tools = bar.createDiv({ cls: 'romus-cloze-study-tools' });
    const maskLabel = tools.createEl('label', { cls: 'romus-cloze-mask-toggle' });
    const maskCheck = maskLabel.createEl('input', { attr: { type: 'checkbox' } });
    maskCheck.checked = this.maskOtherCards;
    maskLabel.createSpan({ text: 'Ocultar outros flashcards' });
    maskCheck.onchange = () => {
      this.maskOtherCards = this.view.maskOtherCards = maskCheck.checked;
      this.applyMasking();
    };

    // Render full note body (stripping yaml frontmatter and managed flashcards block)
    const raw = await this.app.vault.read(note);
    const {text} = splitNoteContent(raw);
    const bodyHost = this.container.createDiv({ cls: 'romus-cloze-note-body markdown-rendered' });

    await MarkdownRenderer.render(this.app, text, bodyHost, note.path, this.component, { clozeStudy: true });

    // Wire clozes in the rendered note
    this.bodyHost = bodyHost;
    this.wireClozes(item, entry);
    this.applyMasking();

    return this.container;
  }

  wireClozes(item, entry) {
    const pills = [...this.bodyHost.querySelectorAll('.romus-cloze-pill')];
    if (!pills.length) return;

    const clozeEntries = (this.view.entries || []).filter(e => e.cardType === 'cloze' || e.isCloze);

    // Tag each pill with its document-order cloze index and card metadata
    pills.forEach((pill, idx) => {
      pill.dataset.clozeIndex = String(idx);
      const ce = clozeEntries[idx];
      if (ce) {
        pill.dataset.clozeCardId = ce.id || '';
        pill.dataset.clozeSourceId = ce.sourceCardId || '';
      }
    });

    const normalize = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const targetAnswer = normalize(entry.answer || entry.clozeText);

    // Exact match of entry to pill by position and identifiers
    let targetIdx = clozeEntries.findIndex(e => e.id === entry.id || e.sourceCardId === entry.sourceCardId || (e.recordId && e.recordId === entry.recordId) || e === entry);

    let activePill = null;
    if (targetIdx >= 0 && pills[targetIdx]) {
      const pAns = normalize(pills[targetIdx].dataset.clozeAnswer || pills[targetIdx].textContent);
      if (pAns === targetAnswer || pills[targetIdx].dataset.clozeRaw === (entry.clozeFull || entry.raw)) {
        activePill = pills[targetIdx];
      }
    }

    if (!activePill) {
      // Find candidate pills with matching answer
      const candidates = pills.filter(p => {
        if (entry.clozeFull && p.dataset.clozeRaw === entry.clozeFull) return true;
        return normalize(p.dataset.clozeAnswer || p.textContent) === targetAnswer;
      });

      if (candidates.length === 1) {
        activePill = candidates[0];
      } else if (candidates.length > 1 && targetIdx >= 0) {
        activePill = candidates.reduce((closest, curr) => {
          const cIdx = parseInt(curr.dataset.clozeIndex, 10);
          const clIdx = parseInt(closest.dataset.clozeIndex, 10);
          return Math.abs(cIdx - targetIdx) < Math.abs(clIdx - targetIdx) ? curr : closest;
        }, candidates[0]);
      } else {
        activePill = candidates[0] || (targetIdx >= 0 && pills[targetIdx]) || pills[0];
      }
    }

    this.allPills = pills;
    this.activePill = activePill;
    this.clozeEntries = clozeEntries;

    pills.forEach((pill, idx) => {
      const cardId = pill.dataset.clozeCardId;
      const sourceId = pill.dataset.clozeSourceId;
      const isAnswered = (cardId && this.answeredPills.has(cardId)) ||
                         (sourceId && this.answeredPills.has(sourceId)) ||
                         this.answeredPills.has('idx:' + idx);

      if (pill === activePill) {
        pill.classList.add('is-active-cloze');
        pill.classList.remove('romus-cloze-masked-other', 'is-answered-cloze');
        this.renderActiveClozeWidget(pill, item, entry);
      } else {
        pill.classList.remove('is-active-cloze');
        if (isAnswered) {
          pill.classList.add('is-answered-cloze');
          pill.classList.remove('romus-cloze-masked-other');
          const bodyEl = pill.querySelector('.romus-cloze-body');
          if (bodyEl) {
            bodyEl.textContent = pill.dataset.clozeAnswer || bodyEl.textContent;
          }
        }

        // Allow clicking on any other cloze to jump to that cloze directly
        pill.style.cursor = 'pointer';
        pill.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetCard = clozeEntries[idx];
          if (targetCard) {
            const qIdx = this.view.queue.findIndex(it => it.entry.id === targetCard.id || it.entry.sourceCardId === targetCard.sourceCardId || it.entry === targetCard);
            if (qIdx >= 0) {
              this.view.position = qIdx;
              this.view.show();
            }
          }
        };
      }
    });

    // Smooth scroll active cloze into view
    setTimeout(() => {
      if (activePill && activePill.isConnected) {
        activePill.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 40);
  }

  applyMasking() {
    if (!this.allPills) return;
    for (const pill of this.allPills) {
      if (pill === this.activePill) continue;
      const idx = pill.dataset.clozeIndex;
      const cardId = pill.dataset.clozeCardId;
      const sourceId = pill.dataset.clozeSourceId;
      const isAnswered = (cardId && this.answeredPills.has(cardId)) ||
                         (sourceId && this.answeredPills.has(sourceId)) ||
                         (idx != null && this.answeredPills.has('idx:' + idx));
      if (isAnswered) {
        pill.classList.remove('romus-cloze-masked-other');
        pill.classList.add('is-answered-cloze');
      } else {
        pill.classList.toggle('romus-cloze-masked-other', this.maskOtherCards);
      }
    }
  }

  renderActiveClozeWidget(pill, item, entry) {
    pill.empty();
    const wrapper = pill.createSpan({ cls: 'romus-cloze-active-inline' });

    // Optional inline badge only if an explicit label was provided by user
    const labelText = entry.label || pill.dataset.clozeLabel || '';
    const hintText = entry.hint || pill.dataset.clozeHint || '';

    if (labelText) {
      wrapper.createSpan({ cls: 'romus-cloze-inline-tag', text: labelText });
    }

    const placeholder = hintText ? `[${hintText}]` : '[digite a resposta…]';
    const input = wrapper.createEl('input', {
      cls: 'romus-cloze-inline-input',
      attr: {
        type: 'text',
        placeholder,
        'aria-label': 'Resposta da lacuna'
      }
    });
    input.value = item.draft || '';
    input.oninput = () => { item.draft = input.value; };

    const revealBtn = wrapper.createEl('button', {
      cls: 'romus-cloze-inline-reveal',
      attr: { type: 'button', title: 'Revelar resposta (Enter)' },
      text: '↵'
    });

    // Floating evaluation & rating popover (does not push surrounding text lines)
    const popover = wrapper.createDiv({ cls: 'romus-cloze-eval-popover' });
    popover.hidden = !item.revealed;

    const doReveal = () => {
      if (item.revealed) return;
      this.view.reveal();
      item.revealed = true;
      revealBtn.hidden = true;
      input.disabled = true;
      popover.hidden = false;
      this.renderEvaluation(popover, item, entry, input.value, input);
    };

    revealBtn.onclick = e => {
      e.stopPropagation();
      doReveal();
    };

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!item.revealed) doReveal();
      }
    };

    if (item.revealed) {
      revealBtn.hidden = true;
      input.disabled = true;
      popover.hidden = false;
      this.renderEvaluation(popover, item, entry, item.draft || '', input);
    } else {
      setTimeout(() => input.focus(), 60);
    }
  }

  renderEvaluation(popover, item, entry, typed, inputEl) {
    popover.empty();
    const answer = String(entry.answer || entry.clozeText || '').trim();
    const userTyped = String(typed || '').trim();

    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const isCorrect = userTyped && normalize(userTyped) === normalize(answer);

    if (inputEl) {
      if (isCorrect) {
        inputEl.classList.add('is-correct');
        inputEl.value = '✓ ' + answer;
      } else {
        inputEl.classList.add('is-wrong');
        inputEl.value = (userTyped ? userTyped + ' ➔ ' : '') + answer;
      }
    }

    const header = popover.createDiv({ cls: 'romus-eval-header' });
    if (userTyped) {
      if (isCorrect) {
        header.createSpan({ cls: 'romus-cloze-badge-correct', text: '✓ Resposta Correta' });
      } else {
        const diff = header.createDiv({ cls: 'romus-cloze-diff' });
        diff.createDiv({ cls: 'romus-cloze-user-wrong', text: `Sua resposta: ${userTyped}` });
        diff.createDiv({ cls: 'romus-cloze-correct-answer', text: `Correta: ${answer}` });
      }
    } else {
      header.createSpan({ cls: 'romus-cloze-correct-answer', text: `Resposta: ${answer}` });
    }

    // FSRS grading buttons: apenas 1. Errei e 2. Acertei
    const gradeRow = popover.createDiv({ cls: 'romus-cloze-grade-row' });
    gradeRow.createSpan({ cls: 'ia-eyebrow', text: 'AVALIAÇÃO FSRS' });

    const btnGroup = gradeRow.createDiv({ cls: 'romus-cloze-fsrs-buttons' });
    item.preview = this.view.store.preview(item.entry);

    const ratings = [
      { id: 1, label: '1. Errei', cls: 'ia-fsrs-rating-1' },
      { id: 3, label: '2. Acertei', cls: 'ia-fsrs-rating-3' }
    ];

    const choose = (gradeId) => {
      if (entry.id) this.answeredPills.add(entry.id);
      if (entry.sourceCardId) this.answeredPills.add(entry.sourceCardId);
      const pillIdx = this.activePill?.dataset?.clozeIndex;
      if (pillIdx != null) this.answeredPills.add('idx:' + pillIdx);
      this.view.grade(gradeId);
    };

    for (const r of ratings) {
      const btn = btnGroup.createEl('button', { cls: `romus-cloze-rate-btn ${r.cls}` });
      btn.createSpan({ text: r.label, cls: 'romus-rate-name' });
      const due = item.preview?.[r.id]?.card?.due;
      if (due) {
        const ms = Math.max(0, new Date(due).getTime() - Date.now());
        let label = '<1 min';
        if (ms >= 86400000 * 30) label = `${Math.round(ms / (86400000 * 30))}m`;
        else if (ms >= 86400000) label = `${Math.round(ms / 86400000)}d`;
        else if (ms >= 3600000) label = `${Math.round(ms / 3600000)}h`;
        else if (ms >= 60000) label = `${Math.round(ms / 60000)}min`;
        btn.createSpan({ text: label, cls: 'romus-rate-interval' });
      }
      btn.onclick = () => choose(r.id);
      if (r.id === 3) setTimeout(() => btn.focus(), 40);
    }
  }

  dispose() {
    this.component.unload();
    this.container.remove();
  }
}
