/**
 * Review page entry for the bundled client.
 *
 * Mounts the Svelte 5 `ReviewPage` island — the Alpine→Svelte port of the
 * review surface (BRIEFING.md / docs-src/server/local-first.md). The SSR page
 * injected `review-config` (review key, selection, type, language settings,
 * progress…) computed by the server; here we fetch the same payload from
 * `/api/v1/review/config` using the selection from the URL (`review.html?text=42`),
 * then mount the island with it as props. `ReviewPage` drives the session from
 * `/api/v1/review/*`.
 *
 * Mirrors `words.ts` ordering: resolve the data mode, boot i18n so the island's
 * labels render, mount into `#review-app`, then boot the shared page shell
 * (navbar, link router) via {@link bootAppPage}. The Svelte island and Alpine
 * coexist: Alpine owns only `x-data` nodes, and the island's mount point has none.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import ReviewPage from '@modules/review/pages/ReviewPage.svelte';
import { bootAppPage, initDataMode, injectConfig } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { ReviewApi } from '@modules/review/api/review_api';

const params = new URLSearchParams(window.location.search);
const text = parseInt(params.get('text') ?? '0', 10) || undefined;
const lang = parseInt(params.get('lang') ?? '0', 10) || undefined;
const selection = parseInt(params.get('selection') ?? '0', 10) || undefined;

async function start(): Promise<void> {
  // Resolve local-first vs server mode (and seed on first run) before the first
  // API call, so this page works even when opened directly.
  await initDataMode();

  const res = await ReviewApi.getReviewConfig({ text, lang, selection });
  // Pass the fetched config to the island as props, or surface a load error
  // through the same channel (ReviewPage renders config.error if present). Keep
  // injecting into #review-config too, matching how the SSR page emitted it.
  const config = res.data ?? { error: res.error || 'Could not load review.' };
  injectConfig('review-config', config);

  // Ensure translation strings are loaded before the island renders its labels.
  await bootI18n();

  const target = document.getElementById('review-app');
  if (target) {
    mount(ReviewPage, { target, props: { ...config } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
