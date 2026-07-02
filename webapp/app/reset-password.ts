/**
 * Reset-password page entry for the bundled client — the guest "set a new
 * password with an emailed token" screen. Reached same-origin (the server's
 * GET /password/reset?token=… 302s to this shell, carrying the token query,
 * which BundleController serves with an injected CSRF token + runtime config).
 * It reads `?token=` and mounts the Svelte `ResetPasswordPage` island, which
 * posts to `POST /api/v1/auth/password/reset`. Mirrors login.ts (guest page).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import ResetPasswordPage from '@modules/auth/pages/ResetPasswordPage.svelte';
import { apiGet } from '@shared/api/client';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';

interface MeResponse {
  success?: boolean;
}

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

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  // Guest redirect: already signed in? Send them home instead of the form.
  if (!localFirst) {
    const me = await apiGet<MeResponse>('/auth/me');
    if (me.data?.success === true) {
      window.location.assign('/');
      return;
    }
  }

  await bootI18n();

  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const config = readRuntimeConfig();
  const target = document.getElementById('reset-password-root');
  if (target) {
    mount(ResetPasswordPage, {
      target,
      props: {
        token,
        uiLocale: config.uiLocale ?? '',
        uiLocales: config.uiLocales ?? []
      }
    });
  }

  await bootAppPage({ requireAuth: false });
}

void start();
