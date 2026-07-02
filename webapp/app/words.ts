/**
 * Terms list (word list) page entry for the bundled client.
 *
 * Mounts the Svelte 5 `WordList` island — the first screen migrated from Alpine
 * to Svelte (BRIEFING.md / docs-src/server/local-first.md). It resolves the
 * active language the same way `library.ts` does (the server's current
 * language, else the first one), boots i18n so the island's labels render, then
 * mounts into `#word-list-root` and boots the shared page shell (navbar, link
 * router, Alpine) via {@link bootAppPage}. The Svelte island and Alpine coexist:
 * Alpine owns only `x-data` nodes, and the island's mount point has none.
 *
 * `perPage` has no clean read-API offline, so it falls back to the component's
 * default (50); the per-page selector persists the user's choice in
 * localStorage after first interaction.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import WordList from '@modules/vocabulary/pages/WordList.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { LanguagesApi } from '@modules/language/api/languages_api';

async function start(): Promise<void> {
  // Resolve local-first vs server mode (and seed on first run) before the first
  // API call, so this page works even when opened directly.
  await initDataMode();

  const res = await LanguagesApi.list();
  const languages = res.data?.languages ?? [];
  const ids = new Set(languages.map((l) => l.id));
  const current = res.data?.currentLanguageId ?? 0;
  const activeId = (current && ids.has(current) && current) || (languages[0]?.id ?? 0);

  // Ensure translation strings are loaded before the island renders its labels
  // (main.ts boots i18n fire-and-forget via bootAppPage; awaiting is idempotent).
  await bootI18n();

  const target = document.getElementById('word-list-root');
  if (target) {
    mount(WordList, { target, props: { activeLanguageId: activeId, perPage: 50 } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
