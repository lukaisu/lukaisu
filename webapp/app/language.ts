/**
 * "Add a language" page entry for the bundled client.
 *
 * The server-rendered language form (`Modules/Language/Views/form.php`) submits
 * with a native multipart POST to `/languages/new`, so it cannot work without a
 * server. This is a purpose-built offline-first replacement: it starts from the
 * on-device language presets and creates the language through the API client
 * (`LanguagesApi.create` -> `POST /api/v1/languages`), which the local-first
 * router serves straight into IndexedDB.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { LanguagesApi } from '@modules/language/api/languages_api';
import type { LanguageCreateRequest } from '@modules/language/api/languages_api';
import {
  LANGUAGE_PRESETS,
  type LanguagePreset,
} from '@shared/offline/local/language-presets';

/** Map a preset to the language-create request the API expects. */
function presetToRequest(p: LanguagePreset): LanguageCreateRequest {
  return {
    name: p.name,
    sourceLang: p.code,
    dict1Uri: p.dict1Uri,
    dict2Uri: p.dict2Uri,
    translatorUri: p.translatorUri,
    textSize: p.textSize,
    characterSubstitutions: p.characterSubstitutions,
    regexpSplitSentences: p.regexpSplitSentences,
    exceptionsSplitSentences: p.exceptionsSplitSentences,
    regexpWordCharacters: p.regexpWordCharacters,
    removeSpaces: p.removeSpaces,
    splitEachChar: p.splitEachChar,
    rightToLeft: p.rightToLeft,
    showRomanization: p.showRomanization,
  };
}

function showError(el: HTMLElement | null, message: string): void {
  if (el) {
    el.textContent = message;
    el.style.display = '';
  }
}

function setupForm(): void {
  const select = document.getElementById('nl-preset') as HTMLSelectElement | null;
  const nameInput = document.getElementById('nl-name') as HTMLInputElement | null;
  const form = document.getElementById('new-language-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('nl-error');
  const submit = document.getElementById('nl-submit') as HTMLButtonElement | null;
  if (!select || !nameInput || !form) {
    return;
  }

  const presets = [...LANGUAGE_PRESETS].sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, preset] of presets.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = preset.name;
    select.appendChild(option);
  }

  const syncName = (): void => {
    nameInput.value = presets[Number(select.value)]?.name ?? '';
  };
  syncName();
  select.addEventListener('change', syncName);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) {
      errorEl.style.display = 'none';
    }
    const preset = presets[Number(select.value)];
    const name = nameInput.value.trim();
    if (!preset || name === '') {
      showError(errorEl, 'Please choose a language and enter a name.');
      return;
    }
    submit?.classList.add('is-loading');
    const request: LanguageCreateRequest = { ...presetToRequest(preset), name };
    void LanguagesApi.create(request).then((res) => {
      if (res.error || res.data?.error || !res.data?.id) {
        showError(errorEl, res.error || res.data?.error || 'Could not create the language.');
        submit?.classList.remove('is-loading');
        return;
      }
      // Created on-device: open the (now non-empty) library.
      window.location.assign(pageUrl.library());
    });
  });
}

async function start(): Promise<void> {
  // Become local-first (and seed on first run) before the form can POST, so the
  // create call is served on-device rather than reaching for a server.
  await initDataMode();
  setupForm();
  await bootAppPage({ requireAuth: true });
}

void start();
