/**
 * Register page entry for the bundled client — the same-origin PWA sign-up
 * screen. Reached same-origin (the server's GET /register 302s to this shell,
 * which BundleController serves with an injected CSRF token + runtime config).
 * It mounts the Svelte `RegisterPage` island, which creates an account against
 * `POST /api/v1/auth/register` (see RegisterPage.svelte for the CSRF/session +
 * recovery-code story). Mirrors login.ts (guest page: no existing session
 * required).
 *
 * Boot order:
 *   1. initDataMode()  — resolves same-origin server mode (cookie auth).
 *   2. guest redirect  — if already authenticated (GET /api/v1/auth/me), skip
 *      sign-up and enter the app.
 *   3. bootI18n()      — load UI strings (the island renders `t(...)` labels).
 *   4. mount RegisterPage with the sanitized `?redirect=` target + locale config.
 *   5. bootAppPage({ requireAuth: false }) — link router + shared shell, no gate.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import RegisterPage from '@modules/auth/pages/RegisterPage.svelte';
import { apiGet } from '@shared/api/client';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';

interface MeResponse {
  success?: boolean;
}

/** Runtime config injected by BundleController (also read by boot.ts). */
interface GuestRuntimeConfig {
  uiLocale?: string;
  uiLocales?: string[];
}

function readRuntimeConfig(): GuestRuntimeConfig {
  const el = document.getElementById('lukaisu-runtime-config');
  if (!el?.textContent) {
    return {};
  }
  try {
    return JSON.parse(el.textContent) as GuestRuntimeConfig;
  } catch {
    return {};
  }
}

/**
 * Resolve the post-sign-up redirect from `?redirect=`, defaulting to '/'.
 *
 * Open-redirect guard (mirrors AuthFormDataManager::isSafeRelativeUrl): only a
 * same-origin path is accepted — it must start with a single '/' not followed by
 * '/' or '\' (which browsers treat as protocol-relative). Anything else → '/'.
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

  // 2. Guest redirect: already signed in? Don't show the form. /auth/me accepts
  //    either the session cookie or a bearer token. Skipped when local-first.
  if (!localFirst) {
    const me = await apiGet<MeResponse>('/auth/me');
    if (me.data?.success === true) {
      window.location.assign(redirectTo);
      return;
    }
  }

  // 3. Load translations before the island renders its labels.
  await bootI18n();

  // 4. Mount the register island with the redirect target + locale-switcher data.
  const config = readRuntimeConfig();
  const target = document.getElementById('register-root');
  if (target) {
    mount(RegisterPage, {
      target,
      props: {
        redirectTo,
        uiLocale: config.uiLocale ?? '',
        uiLocales: config.uiLocales ?? []
      }
    });
  }

  // 5. Boot the shared shell (link router, Alpine). Guest page — no gate.
  await bootAppPage({ requireAuth: false });
}

void start();
