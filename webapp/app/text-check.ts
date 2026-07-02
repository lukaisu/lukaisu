/**
 * "Check a text" page entry for the bundled client.
 *
 * Replaces the server-rendered parse-preview form (`Modules/Text/Views/
 * check_form.php`), which submits with a native POST to `/text/check` and so
 * cannot run offline. This is a purpose-built API-client page: pick a language,
 * paste a text, and `TextsApi.check` parses it on-device (the local-first router
 * serves `POST /texts/check` from the on-device tokenizer) and returns the
 * sentences + distinct word / non-word tokens with counts. Known words (those
 * already saved with a translation) are highlighted, mirroring the server's
 * "red = already saved" preview. Nothing is persisted — it is a diagnostic.
 *
 * Local-first only, like the other parse-related arms: there is no remote
 * `/api/v1/text/check` (PHP exposes it only as a web-route form), so in
 * server-backed mode the navbar's "Check" link still reaches the server's own
 * form. Multi-word expression matching stays server-enhanced. The offline E2E
 * asserts `apiAttempts === 0`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { TextsApi, type TextCheckResult } from '@modules/text/api/texts_api';
import { LanguagesApi } from '@modules/language/api/languages_api';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showError(target: HTMLElement | null, message: string): void {
  if (target) {
    target.textContent = message;
    target.style.display = '';
  }
}

/** A `<h4>` section heading; optional muted suffix (the word-list legend). */
function heading(title: string, legend?: string): HTMLElement {
  const h = document.createElement('h4');
  h.textContent = title;
  if (legend !== undefined) {
    const span = document.createElement('span');
    span.className = 'has-text-danger has-text-weight-bold';
    span.textContent = ` ${legend}`;
    h.appendChild(span);
  }
  return h;
}

/** A `TOTAL: n` paragraph closing a list. */
function total(n: number): HTMLElement {
  const p = document.createElement('p');
  p.textContent = `TOTAL: ${n}`;
  return p;
}

/** One `[token] — count[ — translation]` row; highlighted when known. */
function tokenRow(token: string, count: number, translation: string): HTMLElement {
  const li = document.createElement('li');
  const span = document.createElement('span');
  if (translation !== '') {
    span.className = 'has-text-danger has-text-weight-bold';
  }
  span.textContent =
    `[${token}] — ${count}` + (translation !== '' ? ` — ${translation}` : '');
  li.appendChild(span);
  return li;
}

/** Render the on-device parse preview into the results container. */
function renderResults(container: HTMLElement, result: TextCheckResult): void {
  container.replaceChildren();
  container.dir = result.rtlScript ? 'rtl' : '';

  // Sentences.
  container.appendChild(heading('Sentences'));
  const ol = document.createElement('ol');
  for (const sentence of result.sentences) {
    const li = document.createElement('li');
    li.textContent = sentence;
    ol.appendChild(li);
  }
  container.appendChild(ol);

  // Word list (known words highlighted).
  container.appendChild(heading('Word List', '(red = already saved)'));
  const wordList = document.createElement('ul');
  wordList.className = 'wordlist';
  for (const [word, count, translation] of result.words) {
    wordList.appendChild(tokenRow(word, count, translation));
  }
  container.appendChild(wordList);
  container.appendChild(total(result.words.length));

  // Expression list (always empty offline — multi-word matching stays server-side).
  container.appendChild(heading('Expression List'));
  const exprList = document.createElement('ul');
  exprList.className = 'expressionlist';
  for (const [word, count, translation] of result.multiWords) {
    exprList.appendChild(tokenRow(word, count, translation));
  }
  container.appendChild(exprList);
  container.appendChild(total(result.multiWords.length));

  // Non-word list.
  container.appendChild(heading('Non-Word List'));
  const nonWordList = document.createElement('ul');
  nonWordList.className = 'nonwordlist';
  for (const [text, count] of result.nonWords) {
    const li = document.createElement('li');
    li.textContent = `[${text}] — ${count}`;
    nonWordList.appendChild(li);
  }
  container.appendChild(nonWordList);
  container.appendChild(total(result.nonWords.length));

  container.style.display = '';
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const form = el<HTMLFormElement>('text-check-form');
  const language = el<HTMLSelectElement>('tc-language');
  const text = el<HTMLTextAreaElement>('tc-text');
  const errorEl = el<HTMLElement>('tc-error');
  const submit = el<HTMLButtonElement>('tc-submit');
  const results = el<HTMLElement>('tc-results');

  // Populate the language picker from on-device languages, defaulting to the
  // current language the same way the library and "add a text" pages do.
  const langs = await LanguagesApi.list();
  const languages = langs.data?.languages ?? [];
  const current = langs.data?.currentLanguageId ?? 0;
  if (language) {
    for (const lang of languages) {
      const option = document.createElement('option');
      option.value = String(lang.id);
      option.textContent = lang.name;
      if (lang.id === current) option.selected = true;
      language.appendChild(option);
    }
  }
  if (languages.length === 0) {
    showError(errorEl, 'Add a language first, then you can check a text.');
    if (submit) submit.disabled = true;
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    const langId = Number(language?.value) || 0;
    const body = text?.value ?? '';
    if (langId <= 0) {
      showError(errorEl, 'Please choose a language.');
      return;
    }
    if (body.trim() === '') {
      showError(errorEl, 'Please paste some text to check.');
      return;
    }
    submit?.classList.add('is-loading');
    void TextsApi.check(langId, body).then((r) => {
      submit?.classList.remove('is-loading');
      if (r.error || !r.data || r.data.error) {
        showError(errorEl, r.data?.error || r.error || 'Could not check the text.');
        if (results) results.style.display = 'none';
        return;
      }
      if (results) renderResults(results, r.data);
    });
  });

  await bootAppPage({ requireAuth: true });
}

void start();
