/**
 * Feeds page entry for the bundled client — the first *server-enhanced* (Job B)
 * surface, now backed by the Svelte 5 `FeedsPage` island (the Alpine→Svelte port
 * of the feed-manager SPA).
 *
 * Unlike the Job-A pages (library/reader/words/…), feeds is **not** part of the
 * no-server milestone: RSS/Atom fetching and article extraction need a server's
 * network egress, and none of the `/api/v1/feeds*` endpoints the feed-manager
 * SPA calls are served by the local-first router. So this page is **gated**:
 *
 *   - **server-backed / same-origin** (a server is connected): boot i18n, then
 *     mount the Svelte feed-manager island into `#feeds-root`; its calls hit the
 *     connected server's `/api/v1/feeds*`, exactly as on the PHP web app.
 *   - **local-first** (packaged app, no server): the SPA's calls would otherwise
 *     fall through to a network that isn't there, so we **do not mount the
 *     island at all** — nothing requests `/api/v1/feeds*` — and reveal a "connect
 *     a server" notice instead.
 *
 * Mirrors `library.ts` / `review.ts` ordering (`initDataMode` → `bootI18n` →
 * `mount` → `bootAppPage`). The gating decision is made on the resolved data
 * mode (`localFirst`) before any feed API call is possible, since the island is
 * only mounted in the server-backed branch. The connect action mirrors Settings'
 * optional "Connect a server".
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import FeedsPage from '@modules/feed/pages/FeedsPage.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

async function start(): Promise<void> {
  // Resolve local-first vs server mode (and seed on first run) before deciding
  // whether to mount the feed-manager island.
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // /api/v1/feeds* calls fire.
    document.getElementById('feeds-offline')?.removeAttribute('hidden');
    document.getElementById('feeds-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    // Server connected: load translations before the island renders its labels,
    // then mount it into the bare #feeds-root div.
    await bootI18n();
    const target = document.getElementById('feeds-root');
    if (target) {
      mount(FeedsPage, { target });
    }
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted (server mode); the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
