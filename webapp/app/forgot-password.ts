/**
 * Forgot-password page entry for the bundled client — the guest "email me a
 * reset link" screen. Reached same-origin (the server's GET /password/forgot
 * 302s to this shell, which BundleController serves with an injected CSRF token
 * + runtime config). It mounts the Svelte `ForgotPasswordPage` island, which
 * posts to `POST /api/v1/auth/password/forgot` (always neutral success).
 * Mirrors login.ts (guest page: no existing session required).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import ForgotPasswordPage from '@modules/auth/pages/ForgotPasswordPage.svelte';
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

  const config = readRuntimeConfig();
  const target = document.getElementById('forgot-password-root');
  if (target) {
    mount(ForgotPasswordPage, {
      target,
      props: {
        uiLocale: config.uiLocale ?? '',
        uiLocales: config.uiLocales ?? []
      }
    });
  }

  await bootAppPage({ requireAuth: false });
}

void start();
