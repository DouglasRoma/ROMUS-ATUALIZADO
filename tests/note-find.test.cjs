const test = require('node:test');
const assert = require('node:assert/strict');

test('note-find: fold handles case and accent normalization', async () => {
  const { fold } = await import('../src/note-find.js');
  assert.equal(fold('ACV'), 'acv');
  assert.equal(fold('Isquêmico'), 'isquemico');
  assert.equal(fold('Coração'), 'coracao');
  assert.equal(fold('HEMORRÁGICO'), 'hemorragico');
});

test('note-find: findTextOccurrences finds exact, accent-insensitive and case-insensitive matches', async () => {
  const { findTextOccurrences } = await import('../src/note-find.js');
  const text = `# Acidente Cerebrovascular\nO ACV isquêmico é o mais frequente.\nO acv hemorrágico tem cefaleia intensa.`;
  
  // Search uppercase/lowercase
  const matchesAcv = findTextOccurrences(text, 'acv');
  assert.equal(matchesAcv.length, 2);
  assert.equal(matchesAcv[0].text, 'ACV');
  assert.equal(matchesAcv[1].text, 'acv');

  // Search unaccented term
  const matchesIsqu = findTextOccurrences(text, 'isquemico');
  assert.equal(matchesIsqu.length, 1);
  assert.equal(matchesIsqu[0].text, 'isquêmico');
  assert.match(matchesIsqu[0].snippet, /isquêmico/);

  // Search non-existent
  const matchesNone = findTextOccurrences(text, 'inexistente');
  assert.equal(matchesNone.length, 0);
});

test('note-find: collectNoteAndFlashcardMatches finds words in note body and flashcard block', async () => {
  const { collectNoteAndFlashcardMatches } = await import('../src/note-find.js');

  const noteBody = `# Doença Vascular Cerebral\nO infarto cerebral agudo causa perda neurológica súbita.`;
  const flashcardBlock = `<!-- image-atlas-flashcards:start -->\n- O que causa o infarto cerebral? >> Obstrução arterial.\n- AVC isquêmico :: Tipo mais comum de acidente vascular.\n<!-- image-atlas-flashcards:end -->`;
  const fullContent = `${noteBody}\n\n${flashcardBlock}`;

  const mockEditor = {
    editorMode: 'source',
    sourceInput: { value: noteBody },
    input: { value: fullContent },
    showStudy: false,
    file: { path: 'Notas/DVC.md' }
  };

  // Search "infarto" -> exists 1 in note, 1 in flashcards
  const res1 = collectNoteAndFlashcardMatches(mockEditor, 'infarto');
  assert.equal(res1.matches.length, 2);
  assert.equal(res1.noteCount, 1);
  assert.equal(res1.flashcardCount, 1);
  assert.equal(res1.matches[0].section, 'note');
  assert.equal(res1.matches[1].section, 'flashcard');

  // Search "isquêmico" without accent -> exists only in flashcards
  const res2 = collectNoteAndFlashcardMatches(mockEditor, 'isquemico');
  assert.equal(res2.matches.length, 1);
  assert.equal(res2.noteCount, 0);
  assert.equal(res2.flashcardCount, 1);
  assert.equal(res2.matches[0].section, 'flashcard');
  assert.match(res2.matches[0].snippet, /isquêmico/i);

  // Search "súbita" -> exists only in note
  const res3 = collectNoteAndFlashcardMatches(mockEditor, 'subita');
  assert.equal(res3.matches.length, 1);
  assert.equal(res3.noteCount, 1);
  assert.equal(res3.flashcardCount, 0);
  assert.equal(res3.matches[0].section, 'note');
});

test('note-find: jumpToNoteMatch auto-reveals flashcard panel if hidden', async () => {
  const { jumpToNoteMatch } = await import('../src/note-find.js');

  let refreshed = false;
  let focusedTextarea = false;

  const mockEditor = {
    showStudy: false,
    studyPanel: {
      hidden: true,
      scrollIntoView() {}
    },
    studyToggle: {
      setAttribute() {},
      title: ''
    },
    studyTextarea: {
      value: '- Pergunta >> Resposta',
      focus() { focusedTextarea = true; },
      setSelectionRange(s, e) {}
    },
    refreshContent: async () => {
      refreshed = true;
      mockEditor.studyPanel.hidden = false;
    }
  };

  const flashcardMatch = {
    section: 'flashcard',
    start: 2,
    end: 10,
    text: 'Pergunta'
  };

  // By default, does not steal focus (so typing in search input is never interrupted)
  await jumpToNoteMatch(mockEditor, flashcardMatch);
  assert.equal(mockEditor.showStudy, true, 'showStudy should be toggled to true');
  assert.equal(refreshed, true, 'refreshContent should have been called');
  assert.equal(focusedTextarea, false, 'studyTextarea should NOT steal focus by default');

  // When focusTarget is true, it focuses the target
  await jumpToNoteMatch(mockEditor, flashcardMatch, { focusTarget: true });
  assert.equal(focusedTextarea, true, 'studyTextarea receives focus when focusTarget is true');
});
