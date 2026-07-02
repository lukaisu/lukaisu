/**
 * Starter-vocab page entry for the bundled client — a *server-gated* (Job-B-style)
 * surface backed by the Svelte 5 `StarterVocab` island (the Alpine→Svelte port of
 * the post-language-creation import flow).
 *
 * The flow's work is done by a connected server: frequency-word import and
 * Wiktionary enrichment are PHP form-POST endpoints, and curated-dictionary
 * import is `/api/v1/local-dictionaries/import-curated` — none are served by the
 * local-first router. So this page is gated exactly like feeds.ts:
 *
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the island's bootstrap config (`/languages/{id}/starter-vocab/config`), then
 *     mount the island into `#starter-vocab-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no server-only endpoint is ever requested.
 *
 * The language id comes from the URL (`starter-vocab.html?lang=2`), preserved by
 * the `/languages/{id}/starter-vocab` → bundle redirect (BundleController +
 * app/router.ts). Mirrors feeds.ts / read.ts ordering (`initDataMode` →
 * `bootI18n` → fetch/mount → `bootAppPage`).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import StarterVocab from '@modules/vocabulary/pages/StarterVocab.svelte';
import { fetchStarterVocabConfig } from '@modules/vocabulary/api/starter_vocab_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const params = new URLSearchParams(window.location.search);
const langId = parseInt(params.get('lang') ?? '0', 10) || 0;

async function start(): Promise<void> {
  // Resolve local-first vs server mode before deciding whether to mount.
  const localFirst = await initDataMode();

  if (langId <= 0) {
    // No language to seed vocabulary for — go to the languages list.
    window.location.replace(pageUrl.languages());
    return;
  }

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // server-only starter-vocab endpoint is requested.
    document.getElementById('starter-vocab-offline')?.removeAttribute('hidden');
    document.getElementById('starter-vocab-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    // Server connected: load translations, fetch the server-only bootstrap config,
    // then mount the island. A missing language (null config) bounces to the list.
    await bootI18n();
    const config = await fetchStarterVocabConfig(langId);
    if (!config) {
      window.location.replace(pageUrl.languages());
      return;
    }
    const target = document.getElementById('starter-vocab-root');
    if (target) {
      mount(StarterVocab, { target, props: { config } });
    }
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island is
  // mounted (server mode); the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
