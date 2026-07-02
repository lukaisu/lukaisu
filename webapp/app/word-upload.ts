/**
 * Word-upload page entry for the bundled client — a *server-gated* (Job-B-style)
 * surface backed by the Svelte 5 `WordUpload` island (the Alpine→Svelte port of
 * the word import screen).
 *
 * The screen's work is done by a connected server: the frequency-word import +
 * Wiktionary enrichment are PHP form-POST endpoints, the curated-dictionary
 * import is `/api/v1/local-dictionaries/import-curated`, and the manual upload is
 * a native multipart POST to `/word/upload` (the kept file-import endpoint) —
 * none are served by the local-first router. So this page is gated exactly like
 * starter-vocab.ts / bulk-translate.ts:
 *
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the island's bootstrap config (`/word/upload/config`), then mount the
 *     island into `#word-upload-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no server-only endpoint is ever requested.
 *
 * Mirrors starter-vocab.ts / bulk-translate.ts ordering (`initDataMode` →
 * `bootI18n` → fetch/mount → `bootAppPage`).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import WordUpload from '@modules/vocabulary/pages/WordUpload.svelte';
import { fetchWordUploadConfig } from '@modules/vocabulary/api/word_upload_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

async function start(): Promise<void> {
  // Resolve local-first vs server mode before deciding whether to mount.
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // server-only word-upload endpoint is requested.
    document.getElementById('word-upload-offline')?.removeAttribute('hidden');
    document.getElementById('word-upload-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    // Server connected: load translations, fetch the server-only bootstrap config,
    // then mount the island. A failed config fetch bounces to the terms list.
    await bootI18n();
    const config = await fetchWordUploadConfig();
    if (!config) {
      window.location.replace(pageUrl.words());
      return;
    }
    const target = document.getElementById('word-upload-root');
    if (target) {
      mount(WordUpload, { target, props: { config } });
    }
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island is
  // mounted (server mode); the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
