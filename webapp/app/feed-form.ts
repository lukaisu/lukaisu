/**
 * Feed-form page entry for the bundled client — the Svelte 5 `FeedFormPage`
 * island (the Alpine→Svelte port of `Modules/Feed/Views/new.php` + `edit.php`).
 *
 * One page serves both server forms via the query string:
 *   - (no query)        → new feed form   (was GET /feeds/new)
 *   - `?feed=5`         → edit feed form   (was GET /feeds/5/edit)
 *
 * Server-only (gated like feeds.ts): create/edit go through `/api/v1/feeds`,
 * which the local-first router does not serve. So:
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the feed-form config (languages + edit-mode prefill), then mount the island
 *     into `#feed-form-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no feed read/write endpoint is requested.
 *
 * Mirrors tag-form.ts ordering (`initDataMode` → server-gate → `bootI18n` →
 * fetch config → `mount` → `bootAppPage`). The feed id comes from the URL,
 * preserved by the `/feeds/{id}/edit` → bundle redirect (BundleController +
 * app/router.ts).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import FeedFormPage from '@modules/feed/pages/FeedFormPage.svelte';
import { fetchFeedFormConfig } from '@modules/feed/api/feed_form_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const params = new URLSearchParams(window.location.search);
const idParam = parseInt(params.get('feed') ?? '', 10);
const feedId = Number.isFinite(idParam) && idParam > 0 ? idParam : 0;
const mode: 'new' | 'edit' = feedId > 0 ? 'edit' : 'new';

async function start(): Promise<void> {
  // Resolve local-first vs server mode before deciding whether to mount.
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // /api/v1/feeds endpoint is requested.
    document.getElementById('feed-form-offline')?.removeAttribute('hidden');
    document.getElementById('feed-form-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
    await bootAppPage({ requireAuth: true });
    return;
  }

  // Server connected: load translations, then fetch the config (languages +, in
  // edit mode, the feed prefill). A missing feed (null config) bounces to the list.
  await bootI18n();
  const config = await fetchFeedFormConfig(feedId);
  if (!config) {
    window.location.replace(pageUrl.feeds());
    return;
  }

  const target = document.getElementById('feed-form-root');
  if (target) {
    mount(FeedFormPage, {
      target,
      // `listUrl` is resolved here (the entry owns app/router) and threaded in so
      // the island stays URL-agnostic — cancel + save-success both land on it.
      props: {
        mode,
        feedId,
        languages: config.languages,
        currentLang: config.currentLang,
        feed: config.feed,
        listUrl: pageUrl.feeds()
      }
    });
  }

  // Boot the shared shell (navbar, link router, Alpine) after the island mounts;
  // they manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
