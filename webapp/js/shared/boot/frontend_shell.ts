/**
 * Shared, Alpine-free frontend bootstrap used by BOTH entry points:
 * `main.ts` (server-rendered pages, which additionally start Alpine) and
 * `client.ts` (the packaged local-first client, which ships no Alpine at all).
 *
 * All the always-on infrastructure — shared utils/stores/forms, PWA, API
 * client, i18n, icons, the Svelte navbar, token upkeep — lives here so the two
 * entries cannot drift. Only the Alpine runtime + its `$t`/`$markdown` magics +
 * the server-driven `lukaisu-modules` loader stay behind in `main.ts`. (CSS is
 * imported by each entry directly, so their relative paths stay unambiguous.)
 */

// Svelte mount for the global navbar island
import { mount } from 'svelte';

// Shared utilities
import '@shared/utils/html_utils';
import '@shared/utils/cookies';
import '@shared/utils/tts_storage';
import '@shared/utils/ajax_utilities';
import '@shared/utils/ui_utilities';
import '@shared/utils/user_interactions';
import '@shared/utils/simple_interactions';
import '@shared/utils/inline_markdown';

// Shared stores
import '@shared/stores/lukaisu_state';
import '@shared/stores/app_data';

// PWA support
import '@shared/pwa/register';

// Shared API client
import '@shared/api/client';

// Shared components (used on every page)
import '@shared/components/modal';
import NavBar from '@shared/components/NavBar.svelte';
import type { NavbarData as NavbarChromeData } from '@shared/components/navbar_renderer';

// Shared i18n
import { bootI18n } from '@shared/i18n/translator';

// Shared accessibility
import { initAriaLive } from '@shared/accessibility/aria_live';

// Token session management (packaged/cross-origin clients) + navbar fetch
import { maybeRefreshAuthToken, apiGet } from '@shared/api/client';
import { url } from '@shared/utils/url';

// Shared icons
import '@shared/icons/lucide_icons';

// Shared forms (used on most pages)
import '@shared/forms/unloadformcheck';
import '@shared/forms/form_validation';
import '@shared/forms/form_initialization';

interface RunSharedInitOptions {
  /**
   * Register the server-relative `lukaisu:auth-expired → /connect` redirect.
   * ON for the server entry (`main.ts`); OFF for the packaged client, where
   * `app/boot.ts` already owns auth-expired routing (and calls
   * `stopImmediatePropagation`, so this server-relative handler must NOT also
   * fire — it would 404 in the bundle).
   */
  serverAuthRedirect?: boolean;
}

/**
 * Synchronous, always-safe early init: flip async CSS links to `all`, roll a
 * near-expiry bearer token forward, and (server entry only) wire auth-expired
 * back to `/connect`. Both token paths are no-ops for the same-origin cookie
 * web app, so cookie sessions are unaffected.
 */
export function runSharedInit(options: RunSharedInitOptions = {}): void {
  // Convert async CSS links from print to all media — non-render-blocking CSS
  // loading without inline JS.
  document.querySelectorAll<HTMLLinkElement>('link[data-async-css]').forEach((link) => {
    link.media = 'all';
  });

  // Roll a still-valid token forward if it is nearing expiry.
  void maybeRefreshAuthToken();

  // When a token is rejected (expired/invalidated), route back to login. Server
  // entry only — the packaged client registers its own handler in app/boot.ts.
  if (options.serverAuthRedirect) {
    document.addEventListener('lukaisu:auth-expired', () => {
      window.location.assign(url('/connect'));
    });
  }
}

/**
 * Boot i18n (awaited so first paint has strings) then wire ARIA live regions.
 * MUST be awaited before {@link mountNavbar} / island labels render, or the page
 * ships untranslated.
 */
export async function bootI18nAria(): Promise<void> {
  // Initialize i18n: server-injected blob on SSR pages, or API + cache for a
  // shell-free/bundled client (awaited so first paint has strings).
  await bootI18n();

  // Initialize ARIA live regions for screen reader announcements.
  initAriaLive();
}

/**
 * Render the global navbar from `GET /api/v1/navbar` and mount the Svelte NavBar
 * island into its `#navbar-root` placeholder. Fire-and-forget: the rest of the
 * page is already interactive, and pages without a `#navbar-root` (login, print
 * headers) simply no-op.
 */
export function mountNavbar(): void {
  void (async () => {
    const root = document.getElementById('navbar-root');
    if (!root) {
      return;
    }
    const currentPage = root.getAttribute('data-current-page') ?? '';
    try {
      const res = await apiGet<NavbarChromeData>('/navbar');
      if (!res.data) {
        return;
      }
      mount(NavBar, { target: root, props: { data: res.data, currentPage } });
    } catch (error) {
      console.error('Failed to load navbar:', error);
    }
  })();
}
