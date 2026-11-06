import {Modal,Notice,setIcon} from './compat.js';

export function parseWikipediaUrl(url) {
  try {
    const u = new URL(url.trim());
    const m = u.hostname.match(/^([a-z-]+)\.wikipedia\.org$/i);
    const pathMatch = u.pathname.match(/^\/wiki\/(.+)$/);
    if (m && pathMatch) {
      return {
        lang: m[1].toLowerCase(),
        title: decodeURIComponent(pathMatch[1].replace(/_/g, ' ')),
        url: u.href
      };
    }
  } catch {}
  return null;
}

export function wikiToMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^======\s*(.*?)\s*======/gm, (_, s) => '###### ' + s)
    .replace(/^=====\s*(.*?)\s*=====/gm, (_, s) => '##### ' + s)
    .replace(/^====\s*(.*?)\s*====/gm, (_, s) => '#### ' + s)
    .replace(/^===\s*(.*?)\s*===/gm, (_, s) => '### ' + s)
    .replace(/^==\s*(.*?)\s*==/gm, (_, s) => '## ' + s);
}

export async function searchWikipedia(query, lang = 'es') {
  if (window.atlasNative?.call) {
    return window.atlasNative.call('wikipedia:search', { query, lang });
  }
  const parsed = parseWikipediaUrl(query);
  if (parsed) {
    return [{ title: parsed.title, description: 'Link direto da Wikipedia', url: parsed.url, lang: parsed.lang }];
  }
  const target = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json&origin=*`;
  const res = await fetch(target);
  if (!res.ok) return [];
  const [, titles, descriptions, urls] = await res.json();
  return (titles || []).map((title, i) => ({
    title,
    description: descriptions?.[i] || '',
    url: urls?.[i] || '',
    lang
  }));
}

export async function fetchWikipediaArticle(title, lang = 'es', url = null) {
  if (window.atlasNative?.call) {
    return window.atlasNative.call('wikipedia:fetch', { title, lang, url });
  }
  let summary = {};
  try {
    const sRes = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (sRes.ok) summary = await sRes.json();
  } catch {}
  let fullContent = '';
  try {
    const fRes = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    if (fRes.ok) {
      const data = await fRes.json();
      const page = Object.values(data.query?.pages || {})[0];
      fullContent = page?.extract || '';
    }
  } catch {}
  return {
    title: summary.title || title,
    lang,
    url: url || summary.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    description: summary.description || '',
    thumbnail: summary.thumbnail?.source || '',
    summary: summary.extract || '',
    content: fullContent || summary.extract || '',
    updatedAt: Date.now()
  };
}

export function openWikipediaModal(app, options = {}) {
  const modal = new Modal(app);
  modal.setTitle('Vincular página da Wikipedia');
  modal.modalEl.addClass('romus-wiki-modal');
  modal.modalEl.addClass('romus-resource-dialog');

  const content = modal.contentEl;
  let currentLang = 'es';

  // Info label
  content.createEl('p', {
    cls: 'ia-muted',
    text: 'Busque um termo ou cole o link de uma página da Wikipedia para vincular a esta nota.'
  });

  // Search Bar with Language Selector
  const searchRow = content.createDiv({ cls: 'romus-wiki-modal-search' });
  const input = searchRow.createEl('input', {
    value: options.term || '',
    attr: {
      type: 'search',
      placeholder: 'Ex: Ramón Carrillo ou cole o link https://es.wikipedia.org/…',
      'aria-label': 'Termo ou link da Wikipedia'
    }
  });

  const langSelect = searchRow.createDiv({ cls: 'romus-wiki-lang-select' });
  const langButtons = {};
  for (const [code, label] of [['es', 'ES'], ['pt', 'PT'], ['en', 'EN']]) {
    const btn = langSelect.createEl('button', {
      cls: 'romus-wiki-lang-btn',
      text: label,
      attr: { type: 'button', 'aria-pressed': String(code === currentLang), title: code === 'es' ? 'Español' : code === 'pt' ? 'Português' : 'English' }
    });
    btn.onclick = () => {
      currentLang = code;
      for (const [c, b] of Object.entries(langButtons)) b.setAttribute('aria-pressed', String(c === currentLang));
      doSearch();
    };
    langButtons[code] = btn;
  }

  const status = content.createDiv({ cls: 'romus-form-error', attr: { role: 'status' } });
  const resultsContainer = content.createDiv({ cls: 'romus-wiki-results' });

  let debounceTimer = null;
  let searchAbort = null;

  async function doSearch() {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) {
      resultsContainer.empty();
      status.textContent = '';
      return;
    }
    status.textContent = 'Buscando na Wikipedia…';
    resultsContainer.empty();
    try {
      const results = await searchWikipedia(query, currentLang);
      status.textContent = '';
      resultsContainer.empty();
      if (!results.length) {
        status.textContent = 'Nenhum resultado encontrado na Wikipedia.';
        return;
      }
      for (const item of results) {
        const row = resultsContainer.createDiv({ cls: 'romus-wiki-item' });
        const info = row.createDiv({ cls: 'romus-wiki-item-info' });
        info.createEl('h4', { text: item.title });
        if (item.description) {
          info.createEl('p', { text: item.description });
        }
        const linkBtn = row.createEl('button', {
          cls: 'romus-wiki-link-btn',
          text: 'Vincular',
          attr: { type: 'button' }
        });
        linkBtn.onclick = async () => {
          linkBtn.disabled = true;
          linkBtn.textContent = 'Carregando…';
          try {
            const article = await fetchWikipediaArticle(item.title, item.lang || currentLang, item.url);
            modal.close();
            if (options.onLink) await options.onLink(article);
          } catch (err) {
            status.textContent = 'Erro ao vincular artigo: ' + err.message;
            linkBtn.disabled = false;
            linkBtn.textContent = 'Vincular';
          }
        };
      }
    } catch (err) {
      status.textContent = 'Erro ao buscar na Wikipedia: ' + err.message;
    }
  }

  input.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 280);
  };

  input.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      doSearch();
    }
  };

  modal.open();
  input.focus();
  if (input.value.trim()) {
    doSearch();
  }
}
