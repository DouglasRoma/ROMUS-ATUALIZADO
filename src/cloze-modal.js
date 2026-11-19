import {Modal, Notice} from './compat.js';

export class ClozeCreationModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.text = options.text || '';
    this.onApply = options.onApply;
  }

  onOpen() {
    this.setTitle('Criar Cloze Flashcard na Nota');
    this.modalEl.addClass('romus-cloze-modal');

    const desc = this.contentEl.createEl('p', {
      cls: 'ia-muted',
      text: 'Oculta o trecho selecionado para gerar um cartão de lacuna com repetição espaçada (FSRS).'
    });

    const quote = this.contentEl.createDiv({ cls: 'romus-cloze-preview-quote' });
    quote.createSpan({ cls: 'romus-cloze-quote-label', text: 'Texto selecionado: ' });
    quote.createSpan({ cls: 'romus-cloze-quote-text', text: `"${this.text}"` });

    const form = this.contentEl.createDiv({ cls: 'romus-cloze-form' });

    // 1. Etiqueta (Label)
    form.createEl('label', { text: 'Etiqueta do Cloze (Título / Categoria)', cls: 'romus-cloze-label' });
    const labelInput = form.createEl('input', {
      attr: {
        type: 'text',
        placeholder: 'Ex: Localización, Diagnóstico, Mecanismo...',
        'aria-label': 'Etiqueta do cloze'
      }
    });

    // 2. Descrição da Etiqueta (Hint / Pergunta)
    form.createEl('label', { text: 'Descrição / Dica da Etiqueta (Pergunta ao revisar)', cls: 'romus-cloze-label' });
    const hintInput = form.createEl('textarea', {
      attr: {
        rows: '2',
        placeholder: 'Ex: me diga as 3 localizaciones de la pediculosis pubiana...',
        'aria-label': 'Descrição ou dica do cloze'
      }
    });

    // 3. Multi-item segmentation option (se houver vírgulas ou ' e ' ou ' y ')
    const parts = this.text.split(/,|;|\s+y\s+|\s+e\s+/i).map(s => s.trim()).filter(Boolean);
    let splitMode = 'single';

    if (parts.length > 1) {
      const segGroup = form.createDiv({ cls: 'romus-cloze-segment-group' });
      segGroup.createEl('label', { text: 'Como você deseja ocultar?', cls: 'romus-cloze-label' });

      const optSingle = segGroup.createDiv({ cls: 'romus-cloze-radio-row' });
      const r1 = optSingle.createEl('input', { attr: { type: 'radio', name: 'cloze-mode', id: 'cloze-single', checked: 'true' } });
      optSingle.createEl('label', { attr: { for: 'cloze-single' }, text: `1 único cartão (c1): ocultar todo o trecho junto` });

      const optMulti = segGroup.createDiv({ cls: 'romus-cloze-radio-row' });
      const r2 = optMulti.createEl('input', { attr: { type: 'radio', name: 'cloze-mode', id: 'cloze-multi' } });
      optMulti.createEl('label', { attr: { for: 'cloze-multi' }, text: `${parts.length} cartões separados (c1, c2, ...): testar cada item individualmente` });

      r1.onchange = () => { if (r1.checked) splitMode = 'single'; };
      r2.onchange = () => { if (r2.checked) splitMode = 'multi'; };
    }

    const actions = this.contentEl.createDiv({ cls: 'ia-modal-actions' });
    this.app.uiButton(actions, 'Cancelar', 'x', () => this.close());
    const confirmBtn = this.app.uiButton(actions, 'Criar Flashcard Cloze', 'check', () => {
      const label = labelInput.value.trim();
      const hint = hintInput.value.trim();
      let markup = '';

      if (splitMode === 'single' || parts.length <= 1) {
        if (label && hint) {
          markup = `{{${this.text}::${label}::${hint}}}`;
        } else if (label) {
          markup = `{{${this.text}::${label}}}`;
        } else if (hint) {
          markup = `{{${this.text}::${hint}}}`;
        } else {
          markup = `{{${this.text}}}`;
        }
      } else {
        markup = parts.map((part, idx) => {
          const cId = `c${idx + 1}`;
          if (label && hint) return `{{${cId}::${part}::${label}::${hint}}}`;
          if (label) return `{{${cId}::${part}::${label}}}`;
          if (hint) return `{{${cId}::${part}::${hint}}}`;
          return `{{${cId}::${part}}}`;
        }).join(', ');
      }

      this.close();
      this.onApply?.(markup);
    });
    confirmBtn.addClass('mod-cta');

    labelInput.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hintInput.focus();
      }
    };
    hintInput.onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    };

    labelInput.focus();
  }
}

export class ClozeEditModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.raw = options.raw || '';
    this.cId = options.cId || '';
    this.answer = options.answer || '';
    this.label = options.label || '';
    this.hint = options.hint || '';
    this.notePath = options.notePath || '';
    this.onApply = options.onApply;
    this.onRemove = options.onRemove;
  }

  onOpen() {
    this.setTitle('Editar Flashcard Cloze na Nota');
    this.modalEl.addClass('romus-cloze-modal');

    const desc = this.contentEl.createEl('p', {
      cls: 'ia-muted',
      text: 'Edite o texto ocultado, a etiqueta ou a pergunta de revisão deste cloze.'
    });

    const form = this.contentEl.createDiv({ cls: 'romus-cloze-form' });

    // 1. Texto ocultado (Resposta)
    form.createEl('label', { text: 'Texto ocultado (Resposta a ser lembrada)', cls: 'romus-cloze-label' });
    const answerInput = form.createEl('input', {
      attr: {
        type: 'text',
        value: this.answer,
        placeholder: 'Ex: Piojo Pubiano...',
        'aria-label': 'Texto ocultado'
      }
    });

    // 2. Etiqueta (Label)
    form.createEl('label', { text: 'Etiqueta do Cloze (Título / Categoria)', cls: 'romus-cloze-label' });
    const labelInput = form.createEl('input', {
      attr: {
        type: 'text',
        value: this.label,
        placeholder: 'Ex: Localización, Diagnóstico...',
        'aria-label': 'Etiqueta do cloze'
      }
    });

    // 3. Descrição da Etiqueta (Hint / Pergunta)
    form.createEl('label', { text: 'Descrição / Dica da Etiqueta (Pergunta ao revisar)', cls: 'romus-cloze-label' });
    const hintInput = form.createEl('textarea', {
      attr: {
        rows: '2',
        placeholder: 'Ex: Como se llama clásicamente el Pthirus Pubis?...',
        'aria-label': 'Descrição ou dica do cloze'
      }
    });
    hintInput.value = this.hint;

    const actions = this.contentEl.createDiv({ cls: 'ia-modal-actions' });
    
    // Botão Remover Cloze
    this.app.uiButton(actions, 'Remover Cloze', 'trash-2', () => {
      this.close();
      const plainText = answerInput.value.trim() || this.answer;
      this.onRemove?.(plainText);
    });

    this.app.uiButton(actions, 'Cancelar', 'x', () => this.close());

    const saveBtn = this.app.uiButton(actions, 'Salvar Alterações', 'check', () => {
      const newAnswer = answerInput.value.trim() || this.answer;
      const newLabel = labelInput.value.trim();
      const newHint = hintInput.value.trim();

      let newMarkup = '';
      if (this.cId) {
        if (newLabel && newHint) newMarkup = `{{${this.cId}::${newAnswer}::${newLabel}::${newHint}}}`;
        else if (newLabel) newMarkup = `{{${this.cId}::${newAnswer}::${newLabel}}}`;
        else if (newHint) newMarkup = `{{${this.cId}::${newAnswer}::${newHint}}}`;
        else newMarkup = `{{${this.cId}::${newAnswer}}}`;
      } else {
        if (newLabel && newHint) newMarkup = `{{${newAnswer}::${newLabel}::${newHint}}}`;
        else if (newLabel) newMarkup = `{{${newAnswer}::${newLabel}}}`;
        else if (newHint) newMarkup = `{{${newAnswer}::${newHint}}}`;
        else newMarkup = `{{${newAnswer}}}`;
      }

      this.close();
      this.onApply?.(newMarkup, newAnswer);
    });
    saveBtn.addClass('mod-cta');

    answerInput.focus();
    answerInput.select();

    answerInput.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        labelInput.focus();
      }
    };
    labelInput.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hintInput.focus();
      }
    };
    hintInput.onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    };
  }
}

export function openClozeCreationModal(app, options) {
  new ClozeCreationModal(app, options).open();
}

export function openClozeEditModal(app, options) {
  new ClozeEditModal(app, options).open();
}
