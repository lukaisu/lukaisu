/**
 * Archived-texts page entry for the bundled client.
 *
 * Mounts the Svelte 5 `ArchivedTexts` island — the Alpine→Svelte migration of
 * the archived-texts view (`Text/Views/archived_list.php`), the sibling of the
 * active-texts `library.html` (which mounts `TextList`). The two cross-link
 * through the action-card "Active Texts" / "Archived Texts" buttons, matching the
 * server's two-page UX.
 *
 * The PHP view injected `activeLanguageId` (the default-expanded language) from
 * the `currentlanguage` setting. We resolve it from the API the same way
 * `library.ts` does — the server's current language, else the first language —
 * boot i18n so the shared shell's labels render, then mount into
 * `#archived-texts-root` and boot the shared page shell (navbar, link router,
 * Alpine) via {@link bootAppPage}. The Svelte island and Alpine coexist: Alpine
 * owns only `x-data` nodes, and the island's mount point has none. Per-text
 * unarchive/delete are served on-device by the local-first router (the component
 * branches on `isLocalFirst`).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import ArchivedTexts from '@modules/text/pages/ArchivedTexts.svelte';
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

  const target = document.getElementById('archived-texts-root');
  if (target) {
    mount(ArchivedTexts, { target, props: { activeLanguageId: activeId } });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
