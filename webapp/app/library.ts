/**
 * Library (active-texts list) page entry for the bundled client.
 *
 * Mounts the Svelte 5 `TextList` island — the Alpine→Svelte migration of the
 * library page (mirrors `words.ts`). It resolves the active language from the
 * API (the server's current language, else the first language), boots i18n so
 * the shared shell's labels render, then mounts into `#text-list-root` and boots
 * the shared page shell (navbar, link router, Alpine) via {@link bootAppPage}.
 * The Svelte island and Alpine coexist: Alpine owns only `x-data` nodes, and the
 * island's mount point has none.
 *
 * Language switching is handled by the global navbar's switcher (mounted from
 * GET /api/v1/navbar), which writes the server setting and reloads — so this
 * page just reads back the resulting current language.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import TextList from '@modules/text/pages/TextList.svelte';
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

  // Ensure translation strings are loaded before the island renders (main.ts
  // boots i18n fire-and-forget via bootAppPage; awaiting here is idempotent).
  await bootI18n();

  const target = document.getElementById('text-list-root');
  if (target) {
    mount(TextList, { target, props: { activeLanguageId: activeId } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
