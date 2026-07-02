/**
 * Languages list page entry for the bundled client.
 *
 * Mounts the Svelte 5 `LanguageList` island — the Alpine→Svelte migration of the
 * manage-languages page (mirrors `library.ts` / `words.ts`). The component loads
 * everything it shows itself in `onMount` (`LanguagesApi.list()`), so unlike the
 * library/terms pages there is no active-language to resolve and inject here. We
 * only flip into local-first mode (and seed on first run) before the island's
 * first API call, boot i18n so its notification strings render, then mount into
 * `#language-list-root` and boot the shared page shell (navbar, link router,
 * Alpine) via {@link bootAppPage}. The Svelte island and Alpine coexist: Alpine
 * owns only `x-data` nodes, and the island's mount point has none.
 *
 * Every endpoint the island reaches — GET /languages, POST /languages/{id}/set-default,
 * /refresh, DELETE /languages/{id} — is already served on-device by the
 * local-first router, so the page works with no server.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import LanguageList from '@modules/language/pages/LanguageList.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';

async function start(): Promise<void> {
  // Resolve local-first vs server mode (and seed on first run) before the island
  // mounts and starts calling the API, so this page works offline.
  await initDataMode();

  // Ensure translation strings are loaded before the island renders its
  // notifications (main.ts boots i18n fire-and-forget via bootAppPage; awaiting
  // here is idempotent).
  await bootI18n();

  const target = document.getElementById('language-list-root');
  if (target) {
    mount(LanguageList, { target });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
