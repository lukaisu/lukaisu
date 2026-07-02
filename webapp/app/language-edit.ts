/**
 * "Edit a language" page entry for the bundled client.
 *
 * Replaces the server-rendered language settings form (`Modules/Language/Views/
 * form.php`), which submits with a native POST (`op=Change`) and so cannot work
 * offline. This is a purpose-built API-client form reached from the languages
 * list's Edit links (`/languages/{id}/edit`): it loads the language
 * (`GET /languages/{id}`), edits every field that round-trips through the API,
 * and saves (`PUT /languages/{id}` → `updateLanguage`, which also re-parses the
 * language's texts), all served on-device by the local-first router.
 *
 * Scope vs. the PHP form: it carries the fields in `LanguageFull` / the
 * update request. The genuinely server-enhanced bits are left out — the local
 * dictionaries table + import (Job B), the parser-type picker and local-dict
 * lookup mode (no on-device contract), and the live TTS check/test buttons
 * (outbound network). Dictionary popups and the target-language code are sent
 * and persist in server-backed mode, but the offline store drops them (they
 * load blank and aren't clobbered — the same graceful degradation as word.ts).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { LanguagesApi } from '@modules/language/api/languages_api';
import type { LanguageUpdateRequest } from '@modules/language/api/languages_api';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showError(target: HTMLElement | null, message: string): void {
  if (target) {
    target.textContent = message;
    target.style.display = '';
  }
}

/** The language id from `?id=N`, or null if missing/invalid. */
function getLanguageId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('id');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  const localFirst = await initDataMode();

  const loading = el<HTMLElement>('le-loading');
  const notFound = el<HTMLElement>('le-notfound');
  const form = el<HTMLFormElement>('language-edit-form');

  const fail = (): void => {
    if (loading) loading.style.display = 'none';
    if (notFound) notFound.style.display = '';
  };

  const id = getLanguageId();
  if (id === null) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const res = await LanguagesApi.get(id);
  const lang = res.data?.language;
  if (res.error || !lang || !lang.id) {
    fail();
    await bootAppPage({ requireAuth: true });
    return;
  }

  const name = el<HTMLInputElement>('le-name');
  const nameTitle = el<HTMLElement>('le-name-title');
  const dict1Uri = el<HTMLInputElement>('le-dict1-uri');
  const dict1Popup = el<HTMLInputElement>('le-dict1-popup');
  const dict2Uri = el<HTMLInputElement>('le-dict2-uri');
  const dict2Popup = el<HTMLInputElement>('le-dict2-popup');
  const translatorUri = el<HTMLInputElement>('le-translator-uri');
  const translatorPopup = el<HTMLInputElement>('le-translator-popup');
  const sourceLang = el<HTMLInputElement>('le-source-lang');
  const targetLang = el<HTMLInputElement>('le-target-lang');
  const textSize = el<HTMLInputElement>('le-text-size');
  const textSizeExample = el<HTMLInputElement>('le-text-size-example');
  const charSubst = el<HTMLInputElement>('le-char-subst');
  const regexpSplit = el<HTMLInputElement>('le-regexp-split');
  const exceptionsSplit = el<HTMLInputElement>('le-exceptions-split');
  const regexpWordChar = el<HTMLInputElement>('le-regexp-wordchar');
  const splitEachChar = el<HTMLInputElement>('le-split-each-char');
  const removeSpaces = el<HTMLInputElement>('le-remove-spaces');
  const rtl = el<HTMLInputElement>('le-rtl');
  const showRomanization = el<HTMLInputElement>('le-show-romanization');
  const exportTemplate = el<HTMLInputElement>('le-export-template');
  const ttsVoiceApi = el<HTMLTextAreaElement>('le-tts-voice-api');
  const errorEl = el<HTMLElement>('le-error');
  const submit = el<HTMLButtonElement>('le-submit');

  if (nameTitle) nameTitle.textContent = lang.name;
  document.title = `Lukaisu — Edit ${lang.name}`;

  // Server-enhanced: the local-dictionaries page only works connected, so reveal
  // its link only then (offline it would just show a "connect a server" notice).
  if (!localFirst) {
    el<HTMLAnchorElement>('le-local-dicts')?.setAttribute('href', `/languages/${id}/dictionaries`);
    el<HTMLElement>('le-local-dicts-wrap')?.removeAttribute('hidden');
  }
  if (name) name.value = lang.name;
  if (dict1Uri) dict1Uri.value = lang.dict1Uri;
  if (dict1Popup) dict1Popup.checked = lang.dict1PopUp;
  if (dict2Uri) dict2Uri.value = lang.dict2Uri;
  if (dict2Popup) dict2Popup.checked = lang.dict2PopUp;
  if (translatorUri) translatorUri.value = lang.translatorUri;
  if (translatorPopup) translatorPopup.checked = lang.translatorPopUp;
  if (sourceLang) sourceLang.value = lang.sourceLang ?? '';
  if (targetLang) targetLang.value = lang.targetLang ?? '';
  if (textSize) textSize.value = String(lang.textSize);
  if (charSubst) charSubst.value = lang.characterSubstitutions;
  if (regexpSplit) regexpSplit.value = lang.regexpSplitSentences;
  if (exceptionsSplit) exceptionsSplit.value = lang.exceptionsSplitSentences;
  if (regexpWordChar) regexpWordChar.value = lang.regexpWordCharacters;
  if (splitEachChar) splitEachChar.checked = lang.splitEachChar;
  if (removeSpaces) removeSpaces.checked = lang.removeSpaces;
  if (rtl) rtl.checked = lang.rightToLeft;
  if (showRomanization) showRomanization.checked = lang.showRomanization;
  if (exportTemplate) exportTemplate.value = lang.exportTemplate;
  if (ttsVoiceApi) ttsVoiceApi.value = lang.ttsVoiceApi;

  // Live preview: the example text mirrors the chosen size (as the PHP form did).
  const syncExample = (): void => {
    if (textSizeExample) textSizeExample.style.fontSize = `${textSize?.value ?? '100'}%`;
  };
  syncExample();
  textSize?.addEventListener('input', syncExample);

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = '';

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    const newName = name?.value.trim() ?? '';
    if (newName === '') {
      showError(errorEl, 'Please enter a display name.');
      return;
    }
    submit?.classList.add('is-loading');
    const request: LanguageUpdateRequest = {
      name: newName,
      dict1Uri: dict1Uri?.value.trim() ?? '',
      dict2Uri: dict2Uri?.value.trim() ?? '',
      translatorUri: translatorUri?.value.trim() ?? '',
      dict1PopUp: dict1Popup?.checked ?? false,
      dict2PopUp: dict2Popup?.checked ?? false,
      translatorPopUp: translatorPopup?.checked ?? false,
      sourceLang: sourceLang?.value.trim() ?? '',
      targetLang: targetLang?.value.trim() ?? '',
      textSize: Number(textSize?.value) || lang.textSize,
      characterSubstitutions: charSubst?.value.trim() ?? '',
      regexpSplitSentences: regexpSplit?.value.trim() ?? '',
      exceptionsSplitSentences: exceptionsSplit?.value.trim() ?? '',
      regexpWordCharacters: regexpWordChar?.value.trim() ?? '',
      removeSpaces: removeSpaces?.checked ?? false,
      splitEachChar: splitEachChar?.checked ?? false,
      rightToLeft: rtl?.checked ?? false,
      showRomanization: showRomanization?.checked ?? false,
      exportTemplate: exportTemplate?.value.trim() ?? '',
      ttsVoiceApi: ttsVoiceApi?.value.trim() ?? '',
    };
    void LanguagesApi.update(id, request).then((r) => {
      if (r.error || !r.data || r.data.error || !r.data.success) {
        showError(errorEl, r.data?.error || r.error || 'Could not save the language.');
        submit?.classList.remove('is-loading');
        return;
      }
      window.location.assign(pageUrl.languages());
    });
  });

  await bootAppPage({ requireAuth: true });
}

void start();
