/**
 * Home dashboard page entry for the bundled client.
 *
 * Replaces the server-rendered home page (`Modules/Home/Views/index.php`),
 * mounting the Svelte 5 `HomePage` island (the Alpine→Svelte port of
 * `js/home/home_app.ts`). The PHP controller injected the dashboard config (the
 * continue-reading text + its stats, the text count, warnings) at request time;
 * here the boot entry assembles that config **on-device** from the local-first
 * API:
 *
 *   - current language + name      → GET /languages
 *   - continue-reading text        → GET /texts/by-language/{id} (newest first)
 *   - that text's status breakdown → GET /texts/statistics
 *
 * The server-version / update-check warnings are inert offline (no PHP, no
 * outbound GitHub call). Catalog discovery (Gutenberg/GDL browse + on-device
 * Gutenberg plain-text import) runs client-side behind the home page's
 * "Discover books" toggle: it reaches the catalogs CORS-free and never calls
 * `/api/v1`, and it loads only on demand, so the offline dashboard still makes
 * no server call on a passive visit (the E2E asserts `apiAttempts === 0`).
 * Gutenberg coverage preview runs on-device too; RSS, arbitrary-URL extraction
 * and EPUB import remain server-enhanced.
 *
 * Mirrors library.ts ordering: resolve the data mode, resolve the current
 * language + dashboard, inject the config blob, boot i18n so the island's labels
 * render, mount `HomePage` into `#home-root`, then boot the shared page shell
 * (navbar, link router, Alpine) via {@link bootAppPage}. The Alpine home module
 * still loads (PWA renderer) but binds no nodes on this page.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import HomePage from '@modules/home/pages/HomePage.svelte';
import { bootAppPage, initDataMode, injectConfig } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { apiGet } from '@shared/api/client';
import { LanguagesApi } from '@modules/language/api/languages_api';
import type { TextStats } from '@modules/language/stores/language_settings';

/** Newest-text lookup shape (the library's `/texts/by-language` response). */
interface ByLanguageResponse {
  texts: Array<{ id: number; title: string }>;
  pagination: { total: number };
}

/** Per-text status counts (the offline `/texts/statistics` shape). */
interface PerTextStats {
  total: number;
  unknown: number;
  statusCounts: Record<string, number>;
}

interface LastTextInfo {
  id: number;
  title: string;
  language_id: number;
  language_name: string;
  annotated: boolean;
  stats?: TextStats;
}

/** Map the library's per-text status counts to the dashboard's `TextStats`. */
function toTextStats(s: PerTextStats): TextStats {
  const c = s.statusCounts;
  return {
    total: s.total,
    unknown: s.unknown,
    s1: c['1'] ?? 0,
    s2: c['2'] ?? 0,
    s3: c['3'] ?? 0,
    s4: c['4'] ?? 0,
    s5: c['5'] ?? 0,
    s98: c['98'] ?? 0,
    s99: c['99'] ?? 0,
  };
}

/** Resolve the continue-reading text (newest) + total text count for a language. */
async function resolveDashboard(
  langId: number,
  langName: string
): Promise<{ lastText: LastTextInfo | null; textCount: number }> {
  // sort=2 → newest first, so the first item is the most recent text.
  const res = await apiGet<ByLanguageResponse>(`/texts/by-language/${langId}`, {
    page: 1,
    per_page: 1,
    sort: 2,
  });
  const textCount = res.data?.pagination.total ?? 0;
  const first = res.data?.texts?.[0];
  if (!first) {
    return { lastText: null, textCount };
  }

  const statsRes = await apiGet<Record<string, PerTextStats>>('/texts/statistics', {
    text_ids: String(first.id),
  });
  const perText = statsRes.data?.[String(first.id)];

  return {
    lastText: {
      id: first.id,
      title: first.title,
      language_id: langId,
      language_name: langName,
      // Annotated texts are not modelled on-device yet (see library stats).
      annotated: false,
      stats: perText ? toTextStats(perText) : undefined,
    },
    textCount,
  };
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const onboarding = document.getElementById('home-no-languages');

  const langRes = await LanguagesApi.list();
  const languages = langRes.data?.languages ?? [];

  // Empty install (no languages): point the user at "add a language" and stop.
  if (languages.length === 0) {
    if (onboarding) onboarding.style.display = '';
    await bootAppPage({ requireAuth: true });
    return;
  }

  // Resolve the current language the same way the library does (current, else first).
  const current = langRes.data?.currentLanguageId ?? 0;
  const langId =
    (current && languages.some((l) => l.id === current) && current) || languages[0].id;
  const langName = languages.find((l) => l.id === langId)?.name ?? '';

  const { lastText, textCount } = await resolveDashboard(langId, langName);

  // Inject the config HomePage reads at mount. phpVersion '' makes the
  // server-version warning a no-op; checkForUpdates false skips the GitHub call.
  injectConfig('home-warnings-config', {
    phpVersion: '',
    lukaisuVersion: '',
    lastText,
    basePath: '',
    textCount,
    currentLanguageId: langId,
    checkForUpdates: false,
  });

  // Ensure translation strings are loaded before the island renders its labels
  // (the cookie warning + coverage captions go through t()).
  await bootI18n();

  const target = document.getElementById('home-root');
  if (target) {
    mount(HomePage, { target });
  }

  // Boot the shared shell (navbar, link router, Alpine). Runs after the island
  // is mounted; the two manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
