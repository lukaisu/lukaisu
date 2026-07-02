/**
 * "Preferences" page entry for the bundled client.
 *
 * Replaces the server-rendered preferences form (`Modules/User/Views/
 * preferences.php`), which POSTs to `/profile/preferences` (a native PHP form,
 * not the API) and so cannot work offline. This is a purpose-built API-client
 * form (like `language-edit.ts`/`word.ts`) reached from the navbar's
 * "Preferences" link (`/profile/preferences`).
 *
 * Scope vs. the PHP form: it carries only the preferences the *bundled* client
 * actually honours. The vast majority of `preferences.php` (per-page pagination,
 * tooltip mode, review timings, sentence counts, translation delimiters, …) is
 * consumed by the PHP renderer at request time and has **no consumer in the
 * bundle** — porting those would ship dead controls — and the offline reader
 * config is hard-coded (`local/text-assembly.ts:buildReadingConfig`), so reader
 * behaviours don't read the settings store either. What's left, and genuinely
 * works here, is:
 *
 *   - **Default language** (`currentlanguage`) — fully on-device: the local-first
 *     router persists it (`setCurrentLanguageId`) and the library / new-text
 *     pages read it back. This is the one preference that takes effect offline.
 *   - **Interface language** (the UI locale) — works when a server is connected
 *     (it serves the chosen catalog from `GET /api/v1/i18n/{locale}`). Offline
 *     only English is bundled (`local/i18n.ts`), so the picker is disabled with a
 *     note — the same graceful degradation as language-edit's server-only fields.
 *
 * Everything is persisted through the API client, so the page works in both
 * modes: offline the calls are intercepted by the local-first router (zero
 * network); server-backed they hit `POST /api/v1/settings`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { SettingsApi } from '@modules/admin/api/settings_api';
import { loadI18nFromApi, getStoredLocale } from '@shared/i18n/translator';
import { getApiServer, setApiServer, setAuthToken } from '@shared/api/client';
import { setLocalFirst } from '@shared/offline/local/router';
import { setNlpServer, getNlpServerOverride } from '@shared/offline/nlp/endpoint';
import { pageUrl } from './router';

/** Default a bare host to https:// (matching the connect flow). */
function normalizeServerUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** The UI locales the catalog ships (`locale/<code>/`), with native names. */
const LOCALES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
];

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showError(target: HTMLElement | null, message: string): void {
  if (target) {
    target.textContent = message;
    target.style.display = '';
  }
}

/**
 * Render the optional "Server" section. Three states, distinguished without any
 * extra probing:
 *   - local-first (packaged app, no server)  -> offer "Connect a server"
 *   - a remote server is connected           -> show it + "Disconnect"
 *   - same-origin server mode (the bundle is a Lukaisu Server's own UI:
 *     `localFirst` is false yet no server URL is configured) -> hide the section
 *     entirely; connecting/disconnecting makes no sense there.
 */
function initServerSection(localFirst: boolean): boolean {
  const section = el<HTMLElement>('st-server-section');
  const disconnected = el<HTMLElement>('st-server-disconnected');
  const connected = el<HTMLElement>('st-server-connected');
  const server = getApiServer();
  // Visible for local-first (offer connect) and for a connected remote server;
  // hidden in same-origin server mode, where connect/disconnect makes no sense.
  const shown = localFirst || !!server;

  if (localFirst) {
    if (section) section.style.display = '';
    if (disconnected) disconnected.style.display = '';
    el<HTMLButtonElement>('st-connect-server')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else if (server) {
    if (section) section.style.display = '';
    if (connected) connected.style.display = '';
    const addr = el<HTMLElement>('st-server-addr');
    if (addr) addr.textContent = server.replace(/^https?:\/\//, '');
    el<HTMLButtonElement>('st-disconnect-server')?.addEventListener('click', () => {
      // Forget the server + token and go back to the on-device library.
      setApiServer(null);
      setAuthToken(null);
      setLocalFirst(true);
      window.location.assign(pageUrl.library());
    });
  }

  // Prefill the optional NLP-endpoint override (blank = use the connected
  // server). Only meaningful while the server section is visible.
  if (shown) {
    const nlp = el<HTMLInputElement>('st-nlp-server');
    if (nlp) nlp.value = getNlpServerOverride();
  }
  return shown;
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  const localFirst = await initDataMode();

  const loading = el<HTMLElement>('st-loading');
  const form = el<HTMLFormElement>('settings-form');
  const defaultLang = el<HTMLSelectElement>('st-default-lang');
  const locale = el<HTMLSelectElement>('st-locale');
  const localeNote = el<HTMLElement>('st-locale-note');
  const errorEl = el<HTMLElement>('st-error');
  const successEl = el<HTMLElement>('st-success');
  const submit = el<HTMLButtonElement>('st-submit');

  // 1. Default language — populate from the languages list and pre-select the
  //    current one (the same resolution library.ts uses).
  const res = await LanguagesApi.list();
  const languages = res.data?.languages ?? [];
  const currentLangId = res.data?.currentLanguageId ?? 0;
  if (defaultLang) {
    for (const lang of languages) {
      const option = document.createElement('option');
      option.value = String(lang.id);
      option.textContent = lang.name;
      option.selected = lang.id === currentLangId;
      defaultLang.appendChild(option);
    }
    if (languages.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No languages yet';
      defaultLang.appendChild(option);
      defaultLang.disabled = true;
    }
  }

  // 2. Interface language — pre-select the stored locale. Offline only English
  //    is bundled, so disable the picker and explain (server-backed gets the
  //    full set from GET /i18n/{locale}).
  const storedLocale = getStoredLocale() ?? 'en';
  if (locale) {
    for (const loc of LOCALES) {
      const option = document.createElement('option');
      option.value = loc.code;
      option.textContent = loc.name;
      option.selected = loc.code === storedLocale;
      locale.appendChild(option);
    }
    if (localFirst) {
      locale.disabled = true;
      if (localeNote) localeNote.style.display = '';
    }
  }

  // 3. Server section — the optional "Connect a server" / "Disconnect" action
  //    plus the NLP-endpoint field. `serverShown` gates persisting the latter.
  const serverShown = initServerSection(localFirst);

  if (loading) loading.style.display = 'none';
  if (form) form.style.display = '';

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';
    submit?.classList.add('is-loading');

    // Optional NLP-endpoint override. Synchronous (localStorage) and resets its
    // capability cache, so the next parse/lemmatize re-probes the new server.
    if (serverShown) {
      const raw = (el<HTMLInputElement>('st-nlp-server')?.value ?? '').trim();
      setNlpServer(raw ? normalizeServerUrl(raw) : null);
    }

    const newLangId = Number(defaultLang?.value) || 0;
    const newLocale = locale?.value ?? storedLocale;
    const localeChanged = !localFirst && newLocale !== storedLocale;

    // Finish the save: surface an error, apply a server-backed locale change (by
    // fetching its catalog and reloading — the page re-renders in the chosen
    // locale, its own confirmation), or just confirm inline. Offline the locale
    // picker is disabled, so the reload branch never runs.
    const finish = (errMsg?: string): void => {
      if (errMsg) {
        showError(errorEl, errMsg || 'Could not save your preferences.');
        submit?.classList.remove('is-loading');
        return;
      }
      if (localeChanged) {
        void loadI18nFromApi(newLocale).then(() => window.location.reload());
        return;
      }
      submit?.classList.remove('is-loading');
      if (successEl) successEl.style.display = '';
    };

    // Persist the default language through the API client (offline -> local
    // router's setCurrentLanguageId; server-backed -> POST /settings).
    if (newLangId > 0) {
      void SettingsApi.save('currentlanguage', String(newLangId)).then((r) => finish(r.error));
    } else {
      finish();
    }
  });

  await bootAppPage({ requireAuth: true });
}

void start();
