/**
 * Login page entry for the bundled client — the same-origin PWA login screen.
 *
 * This page is only ever reached same-origin (the server's GET /login 302s to
 * this shell, which BundleController serves with an injected CSRF token +
 * runtime config). It mounts the Svelte `LoginPage` island, which authenticates
 * against `POST /api/v1/auth/login` (see LoginPage.svelte for the CSRF/session
 * story). Mirrors connect.ts ordering (`initDataMode` → i18n → mount →
 * `bootAppPage`), but is a guest page: it does NOT require an existing session.
 *
 * Boot order:
 *   1. initDataMode()  — resolves same-origin server mode (cookie auth).
 *   2. guest redirect  — if already authenticated (valid session or token, via
 *      GET /api/v1/auth/me), skip the form and enter the app.
 *   3. bootI18n()      — load UI strings (the island renders `t(...)` labels).
 *   4. mount LoginPage with the sanitized `?redirect=` target + locale-switcher
 *      config read from the injected runtime blob.
 *   5. bootAppPage({ requireAuth: false }) — link router + shared shell, no gate.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import LoginPage from '@modules/auth/pages/LoginPage.svelte';
import { apiGet } from '@shared/api/client';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';

interface MeResponse {
  success?: boolean;
}

/** Runtime config injected by BundleController (also read by boot.ts). */
interface LoginRuntimeConfig {
  uiLocale?: string;
  uiLocales?: string[];
}

function readRuntimeConfig(): LoginRuntimeConfig {
  const el = document.getElementById('lukaisu-runtime-config');
  if (!el?.textContent) {
    return {};
  }
  try {
    return JSON.parse(el.textContent) as LoginRuntimeConfig;
  } catch {
    return {};
  }
}

/**
 * Resolve the post-login redirect from `?redirect=`, defaulting to '/'.
 *
 * Open-redirect guard (mirrors AuthFormDataManager::isSafeRelativeUrl on the
 * server): only a same-origin path is accepted — it must start with a single '/'
 * not followed by '/' or '\' (which browsers treat as protocol-relative and
 * would navigate off-site). Anything else falls back to '/'.
 */
function resolveRedirect(): string {
  const raw = new URLSearchParams(window.location.search).get('redirect');
  if (raw === null || raw === '' || raw[0] !== '/') {
    return '/';
  }
  if (raw.length >= 2 && (raw[1] === '/' || raw[1] === '\\')) {
    return '/';
  }
  return raw;
}

async function start(): Promise<void> {
  // 1. Resolve same-origin server mode (cookie auth) before any API call.
  const localFirst = await initDataMode();

  const redirectTo = resolveRedirect();

  // 2. Guest redirect: if the visitor is already signed in, don't show the form.
  //    /api/v1/auth/me accepts either the session cookie or a bearer token, so
  //    it covers both. Runs before bootAppPage, so a 401 here has no listener to
  //    fire and clearing an absent token is a no-op. Skipped when local-first
  //    (no server to ask).
  if (!localFirst) {
    const me = await apiGet<MeResponse>('/auth/me');
    if (me.data?.success === true) {
      window.location.assign(redirectTo);
      return;
    }
  }

  // 3. Load translations before the island renders its labels.
  await bootI18n();

  // 4. Mount the login island with the redirect target and locale-switcher data.
  const config = readRuntimeConfig();
  const target = document.getElementById('login-root');
  if (target) {
    mount(LoginPage, {
      target,
      props: {
        redirectTo,
        uiLocale: config.uiLocale ?? '',
        uiLocales: config.uiLocales ?? []
      }
    });
  }

  // 5. Boot the shared shell (link router, Alpine). This is a guest page, so it
  //    does NOT require a session. Runs after the island is mounted; the two
  //    manage disjoint DOM regions.
  await bootAppPage({ requireAuth: false });
}

void start();
