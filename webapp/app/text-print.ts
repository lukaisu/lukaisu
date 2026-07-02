/**
 * Plain-print page entry for the bundled client.
 *
 * Mounts the Svelte 5 `TextPrintApp` island — the Alpine→Svelte port of the
 * plain-print view. Replaces the server-rendered print view
 * (`Text/Views/print_alpine.php`) for the plain-print case. Reached from the
 * reader's and library's printer links (`/text/{id}/print-plain`).
 *
 * Scope: **plain print only.** The Alpine component supported three modes
 * (plain / annotated / edit), but the annotated "Improved Annotated Text"
 * persists a hand-edited annotation blob that the bundle has no on-device store
 * for — so the island renders plain print only, served from
 * `GET /texts/{id}/print-items` via the local-first router (the same
 * word/occurrence data the reader uses). The annotated/edit modes stay
 * server-backed; the server's `/text/{id}/print` route keeps handling them
 * through the WebView when a server is connected.
 *
 * Mirrors read.ts ordering: guard a missing text, resolve the data mode, boot
 * i18n so the shared shell's labels render, mount into `#text-print-root`, then
 * boot the shared page shell (navbar, link router, Alpine) via {@link bootAppPage}.
 * The print island owns the per-text action links (Read / Review / Edit), so the
 * page has no `x-data` nodes left for Alpine to drive here.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import TextPrintApp from '@modules/text/pages/TextPrintApp.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

/** The text to print, from `?text=` (reader/library links) or `?id=`. */
function resolveTextId(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('text') ?? params.get('id') ?? '0';
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? 0 : id;
}

async function start(): Promise<void> {
  const textId = resolveTextId();

  if (textId <= 0) {
    // Nothing to print — go back to the library rather than boot an empty page.
    window.location.replace(pageUrl.library());
    return;
  }

  // Resolve local-first vs server mode (and seed on first run) before the first
  // API call, so this page works even when opened directly.
  await initDataMode();

  // Ensure translation strings are loaded before the shared shell renders its
  // labels (idempotent with bootAppPage's own i18n boot).
  await bootI18n();

  const target = document.getElementById('text-print-root');
  if (target) {
    mount(TextPrintApp, { target, props: { textId } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
