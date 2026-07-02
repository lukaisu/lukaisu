/**
 * "Edit a text" page entry for the bundled client.
 *
 * Replaces the server-rendered text edit form (`Modules/Text/Views/edit_form.php`
 * and `archived_form.php`), which submit with a native POST and so cannot work
 * offline. This is a purpose-built API-client form reached from the texts lists'
 * Edit links — `/texts/{id}/edit` (active, from library.html) and
 * `/text/archived/{id}/edit` (archived, from texts.html). It loads the text
 * (`GET /texts/{id}`), edits title / language / body / source / audio / tags, and
 * saves (`PUT /texts/{id}` → `updateText`, which re-parses when the body or
 * language changed), all served on-device by the local-first router. The offline
 * E2E asserts `apiAttempts === 0`.
 *
 * Single page handles both the active and archived cases: the loaded record's
 * `archived` flag picks the post-save redirect (the active list vs the archived
 * page). The server's importers (file / URL / Gutenberg / GDL / transcription)
 * are genuinely server-side and stay on the server-rendered form — they are not
 * part of this offline editor. There is no remote `/api/v1/texts/{id}` GET/PUT
 * (PHP exposes single-text edit only as a web-route form), so this editor is a
 * local-first surface; in server-backed mode the lists' Edit links still reach
 * the server's own form.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { TextsApi } from '@modules/text/api/texts_api';
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

/** The text id from `?id=N`, or null if missing/invalid. */
function getTextId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('id');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const loading = el<HTMLElement>('te-loading');
  const notFound = el<HTMLElement>('te-notfound');
  const form = el<HTMLFormElement>('text-edit-form');

  const fail = (): void => {
    if (loading) loading.style.display = 'none';
    if (notFound) notFound.style.display = '';
  };

  const id = getTextId();
  if (id === null) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const res = await TextsApi.get(id);
  const text = res.data;
  if (res.error || !text || !text.id) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const title = el<HTMLInputElement>('te-title');
  const language = el<HTMLSelectElement>('te-language');
  const body = el<HTMLTextAreaElement>('te-text');
  const sourceUri = el<HTMLInputElement>('te-source-uri');
  const audioUri = el<HTMLInputElement>('te-audio-uri');
  const tags = el<HTMLInputElement>('te-tags');
  const errorEl = el<HTMLElement>('te-error');
  const submit = el<HTMLButtonElement>('te-submit');
  const cancel = el<HTMLAnchorElement>('te-cancel');

  // Populate the language select from on-device languages, selecting the text's.
  const langs = await LanguagesApi.list();
  if (language) {
    for (const lang of langs.data?.languages ?? []) {
      const option = document.createElement('option');
      option.value = String(lang.id);
      option.textContent = lang.name;
      if (lang.id === text.langId) option.selected = true;
      language.appendChild(option);
    }
  }

  if (title) title.value = text.title;
  if (body) body.value = text.text;
  if (sourceUri) sourceUri.value = text.sourceUri;
  if (audioUri) audioUri.value = text.audioUri;
  if (tags) tags.value = text.tags.join(', ');
  document.title = `Lukaisu — Edit ${text.title}`;

  // The archived list sent us here for an archived text; send the user back
  // there on cancel/save. Active texts return to the library.
  const listUrl = text.archived ? pageUrl.archivedTexts() : pageUrl.library();
  if (cancel) cancel.href = listUrl;

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = '';

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    const newTitle = title?.value.trim() ?? '';
    const newBody = body?.value ?? '';
    if (newTitle === '' || newBody.trim() === '') {
      showError(errorEl, 'Please enter a title and some text.');
      return;
    }
    submit?.classList.add('is-loading');
    void TextsApi.update(id, {
      title: newTitle,
      langId: Number(language?.value) || text.langId,
      text: newBody,
      sourceUri: sourceUri?.value.trim() ?? '',
      audioUri: audioUri?.value.trim() ?? '',
      tags: parseTags(tags?.value ?? ''),
    }).then((r) => {
      if (r.error || !r.data || r.data.error || !r.data.updated) {
        showError(errorEl, r.data?.error || r.error || 'Could not save the text.');
        submit?.classList.remove('is-loading');
        return;
      }
      window.location.assign(listUrl);
    });
  });

  await bootAppPage({ requireAuth: true });
}

void start();
