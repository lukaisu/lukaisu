/**
 * "Edit a term" page entry for the bundled client.
 *
 * Replaces the server-rendered term-edit form (`Vocabulary/Views/form_edit_*`),
 * which posts natively and renders `*_result` fragments — neither works offline.
 * This is a purpose-built API-client form reached from the terms list's per-row
 * Edit link (`/words/{id}/edit`): it loads the term (`GET /terms/{id}`), edits
 * every field, and saves (`PUT /terms/{id}` → `updateFull`) or deletes
 * (`DELETE /terms/{id}`), all served on-device by the local-first router.
 *
 * Notes & tags: offline the local `GET /terms/{id}` returns them, so they
 * prefill. In server-backed mode the server omits them *and* its PUT ignores
 * them, so they show blank but are never clobbered (graceful degradation). The
 * standalone "new term" form (`/words/new`) is intentionally NOT bundled — there
 * is no clean offline/`/api/v1` contract for creating a full term outside a text
 * (`/terms/full` needs a text occurrence); it stays server-only for now.
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

/** The term id from `?id=N`, or null if missing/invalid. */
function getTermId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('id');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const loading = el<HTMLElement>('we-loading');
  const notFound = el<HTMLElement>('we-notfound');
  const form = el<HTMLFormElement>('word-edit-form');

  const fail = (): void => {
    if (loading) loading.style.display = 'none';
    if (notFound) notFound.style.display = '';
  };

  const id = getTermId();
  if (id === null) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const res = await TermsApi.get(id);
  const term = res.data;
  if (res.error || !term || !term.id) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const termLabel = el<HTMLElement>('we-term');
  const status = el<HTMLSelectElement>('we-status');
  const translation = el<HTMLTextAreaElement>('we-translation');
  const romanization = el<HTMLInputElement>('we-romanization');
  const romanizationField = el<HTMLElement>('we-romanization-field');
  const lemma = el<HTMLInputElement>('we-lemma');
  const sentence = el<HTMLTextAreaElement>('we-sentence');
  const notes = el<HTMLTextAreaElement>('we-notes');
  const tags = el<HTMLInputElement>('we-tags');
  const errorEl = el<HTMLElement>('we-error');
  const submit = el<HTMLButtonElement>('we-submit');
  const deleteBtn = el<HTMLButtonElement>('we-delete');

  if (termLabel) termLabel.textContent = term.text;
  document.title = `Lukaisu — Edit ${term.text}`;
  if (status) status.value = String(term.status);
  // '*' is the placeholder for an empty translation; show it as blank.
  if (translation) translation.value = term.translation === '*' ? '' : term.translation;
  if (romanization) romanization.value = term.romanization ?? '';
  if (lemma) lemma.value = term.lemma ?? '';
  if (sentence) sentence.value = term.sentence ?? '';
  if (notes) notes.value = term.notes ?? '';
  if (tags) tags.value = (term.tags ?? []).join(', ');

  // Hide romanization for languages that don't use it (mirrors the list column).
  try {
    const lang = await LanguagesApi.get(term.langId);
    if (lang.data?.language.showRomanization === false && romanizationField) {
      romanizationField.style.display = 'none';
    }
  } catch {
    // Keep the field visible if the language can't be resolved.
  }

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = '';

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    submit?.classList.add('is-loading');
    void TermsApi.updateFull(id, {
      translation: translation?.value.trim() ?? '',
      romanization: romanization?.value.trim() ?? '',
      sentence: sentence?.value.trim() ?? '',
      notes: notes?.value.trim() ?? '',
      lemma: lemma?.value.trim() || undefined,
      status: Number(status?.value ?? term.status),
      tags: parseTags(tags?.value ?? ''),
    }).then((r) => {
      if (r.error || !r.data || r.data.error) {
        showError(errorEl, r.data?.error || r.error || 'Could not save the term.');
        submit?.classList.remove('is-loading');
        return;
      }
      window.location.assign(pageUrl.words());
    });
  });

  deleteBtn?.addEventListener('click', () => {
    if (!confirm(`Delete the term "${term.text}"? This cannot be undone.`)) {
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    deleteBtn.classList.add('is-loading');
    void TermsApi.delete(id).then((r) => {
      if (r.error || r.data?.error || !r.data?.deleted) {
        showError(errorEl, r.data?.error || r.error || 'Could not delete the term.');
        deleteBtn.classList.remove('is-loading');
        return;
      }
      window.location.assign(pageUrl.words());
    });
  });

  await bootAppPage({ requireAuth: true });
}

void start();
