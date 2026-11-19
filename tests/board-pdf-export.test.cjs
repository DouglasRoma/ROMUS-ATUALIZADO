const test = require('node:test');
const assert = require('node:assert/strict');

test('collectBoardNotes extrai todos os caminhos de notas incorporadas no quadro sem duplicar', async () => {
  const { collectBoardNotes } = await import('../src/board-pdf-export.js');
  const board = {
    nodes: [
      { id: '1', type: 'note', path: 'Notas/Malassezia furfur.md' },
      { id: '2', type: 'mind', path: 'Notas/Pitiriasis versicolor.md' },
      { id: '3', type: 'web', mediaNote: 'Notas/Dermatologia.md' },
      { id: '4', type: 'image', visualNote: 'Notas/Malassezia furfur.md' }, // duplicado
      { id: '5', type: 'note', pins: [{ notePath: 'Notas/Microbiologia.md' }] },
      { id: '6', type: 'mind', path: 'Subquadro.imageboard' } // não é markdown
    ]
  };
  const paths = collectBoardNotes(board, {});
  assert.deepEqual(paths, [
    'Notas/Malassezia furfur.md',
    'Notas/Pitiriasis versicolor.md',
    'Notas/Dermatologia.md',
    'Notas/Microbiologia.md'
  ]);
});

test('buildBoardPdfHtml formata corretamente capa, resumo da nota, Wikipedia e flashcards com hierarquia', async () => {
  const { buildBoardPdfHtml } = await import('../src/board-pdf-export.js');
  
  const notes = [
    {
      title: 'Malassezia furfur',
      path: 'Notas/Malassezia furfur.md',
      summary: 'A **Malassezia furfur** é uma levedura lipofílica comensal da pele.',
      wikipedia: null,
      cards: [
        {
          id: 'card1',
          question: 'Qual é a morfologia da Malassezia furfur?',
          answer: 'Levedura lipofílica.',
          cardType: 'concept'
        }
      ]
    },
    {
      title: 'Pitiriasis versicolor',
      path: 'Notas/Pitiriasis versicolor.md',
      summary: 'Infecção fúngica superficial da camada córnea.',
      wikipedia: {
        title: 'Pitiriasis versicolor',
        lang: 'es',
        description: 'Micosis superficial común causada por Malassezia.',
        content: 'La pitiriasis versicolor es una micosis superficial de distribución mundial...'
      },
      cards: [
        {
          id: 'card2',
          question: '¿Cuál es la lesión típica?',
          answer: 'Máculas hipopigmentadas o marrones descamativas.',
          cardType: 'basic'
        },
        {
          id: 'card3',
          question: '¿En qué consiste el signo?',
          answer: 'Al raspar la lesión, se desprende un fino polvillo.',
          cardType: 'basic',
          parentPrompt: '¿Cuál es la lesión típica?'
        }
      ]
    }
  ];

  const html = buildBoardPdfHtml({
    boardTitle: 'Quadro Micologia Médica',
    boardSummary: 'Resumo geral sobre fungos superficiais e leveduras cutâneas.',
    notes
  });

  // 1. Título do whiteboard e capa
  assert.ok(html.includes('Quadro Micologia Médica'));
  assert.ok(html.includes('Resumo geral sobre fungos superficiais'));
  assert.ok(html.includes('2 notas incorporadas'));
  assert.ok(html.includes('3 flashcards'));

  // 2. Nota 1
  assert.ok(html.includes('NOTA 1 DE 2'));
  assert.ok(html.includes('Malassezia furfur'));
  assert.ok(html.includes('Levedura lipofílica.'));
  assert.ok(html.includes(':: CONCEITO'));

  // 3. Nota 2 com Wikipedia e Callout hierárquico
  assert.ok(html.includes('NOTA 2 DE 2'));
  assert.ok(html.includes('Pitiriasis versicolor'));
  assert.ok(html.includes('WIKIPEDIA (ES)'));
  assert.ok(html.includes('Micosis superficial común causada por Malassezia.'));
  assert.ok(html.includes('↳'));
  assert.ok(html.includes('¿Cuál es la lesión típica?'));
  assert.ok(html.includes('Al raspar la lesión, se desprende un fino polvillo.'));

  // 4. Quebra de página entre notas
  assert.ok(html.includes('page-break-after: always'));
});
