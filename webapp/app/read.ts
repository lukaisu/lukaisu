/**
 * Reader page entry for the bundled client.
 *
 * Mounts the Svelte 5 `TextReaderApp` island — the Alpine→Svelte port of the
 * reader surface and its coupled word-interaction layer (popover, edit modal,
 * multi-word modal). The text to open comes from the URL
 * (`read.html?text=42&lang=2`); the island loads it from `/api/v1/texts/{id}`.
 *
 * Mirrors words.ts/review.ts ordering: guard a missing text, resolve the data
 * mode, fill the prerendered id-tokens, inject the reader config blob, boot i18n
 * so the island's labels render, mount into `#text-reader-root`, then boot the
 * shared page shell (navbar, link router, Alpine) via {@link bootAppPage}. The
 * reader island now owns the audio player too (a nested `AudioPlayer.svelte`),
 * so this page has no `x-data` nodes left for Alpine to drive; Alpine still
 * boots for the shared bundle but manages no DOM here.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import TextReaderApp from '@modules/text/pages/TextReaderApp.svelte';
import { bootAppPage, initDataMode, injectConfig, fillIdTokens } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const params = new URLSearchParams(window.location.search);
const textId = parseInt(params.get('text') ?? '0', 10) || 0;
const langId = parseInt(params.get('lang') ?? '0', 10) || 0;

async function start(): Promise<void> {
  if (textId <= 0) {
    // Nothing to read — go back to the library rather than boot an empty reader.
    window.location.replace(pageUrl.library());
    return;
  }

  // Resolve local-first vs server mode (and seed on first run) before the first
  // API call, so this page works even when opened directly.
  await initDataMode();

  fillIdTokens(textId, langId);
  injectConfig('text-reader-config', { textId, langId });

  // Ensure translation strings are loaded before the island renders its labels.
  await bootI18n();

  const target = document.getElementById('text-reader-root');
  if (target) {
    mount(TextReaderApp, { target, props: { textId } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
