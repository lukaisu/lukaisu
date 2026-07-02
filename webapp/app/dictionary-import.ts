/**
 * Dictionary-import page entry for the bundled client — server-enhanced (Job B,
 * surface 3), backed by the Svelte 5 `DictionaryImportPage` island (the
 * Alpine->Svelte port of `import.php`).
 *
 * Dictionary import needs a connected server: the file upload is parsed and
 * stored server-side, curated imports are downloaded by the server, and the
 * local-dictionaries API lives on it. So this page is **gated** exactly like
 * feeds:
 *
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the language list, then mount the island into `#dictionary-import-root`.
 *   - **local-first** (packaged app, no server): mount nothing — nothing calls
 *     `/api/v1/local-dictionaries*` — and reveal a "connect a server" notice.
 *
 * Mirrors `feeds.ts` gating + `dictionaries.ts` config-fetch (LanguagesApi.list
 * for the language picker, the bundled curated registry for the browser). The
 * file-upload form posts natively to the kept `/dictionaries/import` server
 * route, so we surface the CSRF token + base path the shell injected.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import DictionaryImportPage from '@modules/dictionary/pages/DictionaryImportPage.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';
import { initIcons } from '@shared/icons/lucide_icons';
import { getCsrfToken } from '@shared/api/client';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { CURATED_DICTIONARIES } from '@/dictionaries/curated_dictionaries';
import type { CuratedDictGroup } from '@modules/vocabulary/api/word_upload_api';

/** The server's base path (`<meta name="lukaisu-base-path">`), '' at the root. */
function basePath(): string {
  const meta = document.querySelector('meta[name="lukaisu-base-path"]');
  return meta?.getAttribute('content') ?? '';
}

/**
 * Normalise the bundled curated registry (optional fields) into the shape
 * CuratedDictBrowser expects (required strings), so the import island can reuse
 * the same component the word-upload page (D3a) mounts.
 */
function toCuratedGroups(): CuratedDictGroup[] {
  return CURATED_DICTIONARIES.map((group) => ({
    language: group.language,
    languageName: group.languageName,
    sources: group.sources.map((source) => ({
      name: source.name,
      url: source.url,
      format: source.format,
      entries: source.entries ?? '',
      license: source.license ?? '',
      notes: source.notes ?? '',
      directDownload: source.directDownload,
      dictType: source.dictType,
      targetLanguage: source.targetLanguage
    }))
  }));
}

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing.
    document.getElementById('dict-import-offline')?.removeAttribute('hidden');
    document.getElementById('dict-import-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
    await bootAppPage({ requireAuth: true });
    return;
  }

  // Server connected: load translations, then the language list, then mount.
  await bootI18n();

  const res = await LanguagesApi.list();
  const languages = (res.data?.languages ?? []).map((lang) => ({ id: lang.id, name: lang.name }));

  const params = new URLSearchParams(window.location.search);
  const urlLang = Number(params.get('lang')) || 0;
  const initialLangId = urlLang || res.data?.currentLanguageId || languages[0]?.id || 0;
  const dictIdParam = Number(params.get('dict_id')) || 0;
  const initialDictId = dictIdParam > 0 ? dictIdParam : null;
  const initialError = params.get('error') ?? '';

  const target = document.getElementById('dictionary-import-root');
  if (target) {
    mount(DictionaryImportPage, {
      target,
      props: {
        languages,
        curatedGroups: toCuratedGroups(),
        initialLangId,
        initialDictId,
        initialError,
        csrfToken: getCsrfToken(),
        basePath: basePath()
      }
    });
    initIcons();
  }

  await bootAppPage({ requireAuth: true });
}

void start();
