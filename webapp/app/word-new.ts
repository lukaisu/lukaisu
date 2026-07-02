/**
 * "New term" page entry for the bundled client.
 *
 * Replaces the server-rendered new-term form (Vocabulary/Views/form_new.php),
 * which posts natively. This is a purpose-built API-client form reached from the
 * terms list's "Create a new term" link and the navbar "+" (/words/new): it
 * picks a language, fills every field, and creates the term via
 * TermsApi.createStandalone — served on-device by the local-first router
 * (IndexedDB) offline, and by POST /api/v1/terms/standalone when server-backed.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { TermsApi } from '@modules/vocabulary/api/terms_api';
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

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

/** The preferred language id from `?lang=N`, or null if missing/invalid. */
function getLangParam(): number | null {
  const raw = new URLSearchParams(window.location.search).get('lang');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const loading = el<HTMLElement>('wn-loading');
  const noLang = el<HTMLElement>('wn-nolang');
  const form = el<HTMLFormElement>('word-new-form');
  const langSelect = el<HTMLSelectElement>('wn-language');

  const res = await LanguagesApi.list();
  const languages = res.data?.languages ?? [];

  if (res.error || languages.length === 0 || !langSelect) {
    if (loading) loading.style.display = 'none';
    if (noLang) noLang.style.display = '';
    await bootAppPage({ requireAuth: true });
    return;
  }

  for (const lang of languages) {
    const option = document.createElement('option');
    option.value = String(lang.id);
    option.textContent = lang.name;
    langSelect.appendChild(option);
  }
  const preferred = getLangParam() ?? res.data?.currentLanguageId ?? languages[0].id;
  langSelect.value = String(preferred);

  const text = el<HTMLInputElement>('wn-text');
  const status = el<HTMLSelectElement>('wn-status');
  const translation = el<HTMLTextAreaElement>('wn-translation');
  const romanization = el<HTMLInputElement>('wn-romanization');
  const lemma = el<HTMLInputElement>('wn-lemma');
  const sentence = el<HTMLTextAreaElement>('wn-sentence');
  const notes = el<HTMLTextAreaElement>('wn-notes');
  const tags = el<HTMLInputElement>('wn-tags');
  const errorEl = el<HTMLElement>('wn-error');
  const submit = el<HTMLButtonElement>('wn-submit');

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = '';
  text?.focus();

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';

    const termText = text?.value.trim() ?? '';
    if (termText === '') {
      showError(errorEl, 'Please enter a term.');
      return;
    }

    submit?.classList.add('is-loading');
    void TermsApi.createStandalone({
      langId: Number(langSelect.value),
      text: termText,
      status: Number(status?.value ?? '1'),
      translation: translation?.value.trim() ?? '',
      romanization: romanization?.value.trim() ?? '',
      sentence: sentence?.value.trim() ?? '',
      notes: notes?.value.trim() ?? '',
      lemma: lemma?.value.trim() || undefined,
      tags: parseTags(tags?.value ?? ''),
    }).then((r) => {
      if (r.error || !r.data || r.data.error || !r.data.success) {
        showError(errorEl, r.data?.error || r.error || 'Could not create the term.');
        submit?.classList.remove('is-loading');
        return;
      }
      window.location.assign(pageUrl.words());
    });
  });

  await bootAppPage({ requireAuth: true });
}

void start();
