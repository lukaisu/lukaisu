/**
 * Statistics page entry for the bundled client — a *server-gated* (Job-B-style)
 * surface backed by the Svelte 5 `StatisticsPage` island (the Alpine→Svelte port
 * of the streak / calendar-heatmap / Chart.js statistics page).
 *
 * The page's data is computed by a connected server: the intensity + frequency
 * charts come from `/profile/statistics/config`, and the streak + calendar from
 * `/api/v1/activity/{dashboard,calendar}` — none are served by the local-first
 * router. So this page is gated exactly like feeds.ts:
 *
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the island's bootstrap config (`/profile/statistics/config`), then mount
 *     the island into `#statistics-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no server-only endpoint is ever requested.
 *
 * Mirrors feeds.ts / starter-vocab.ts ordering (`initDataMode` → gate on
 * localFirst → `bootI18n` → fetch/mount → `bootAppPage`).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import StatisticsPage from '@modules/activity/pages/StatisticsPage.svelte';
import { fetchStatisticsConfig } from '@modules/activity/api/statistics_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

async function start(): Promise<void> {
  // Resolve local-first vs server mode before deciding whether to mount.
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // server-only statistics endpoint is requested.
    document.getElementById('statistics-offline')?.removeAttribute('hidden');
    document.getElementById('statistics-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    // Server connected: load translations, fetch the server-computed intensity +
    // frequency chart data, then mount the island. The streak + calendar are
    // fetched by the island itself.
    await bootI18n();
    const { intensity, frequency } = await fetchStatisticsConfig();
    const target = document.getElementById('statistics-root');
    if (target) {
      mount(StatisticsPage, { target, props: { intensity, frequency } });
    }
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island is
  // mounted (server mode); the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
