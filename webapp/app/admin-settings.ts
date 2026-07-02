/**
 * Admin-settings page entry for the bundled client — a *server-enhanced* surface
 * backed by the Svelte `AdminSettingsPage` island.
 *
 * These are server-wide admin settings (newsfeed limits + multi-user flags) that
 * configure the connected server; they have no meaning in a local-first client
 * with no server, and they read/write via admin-scoped /api/v1/settings*. So the
 * page is gated exactly like feeds:
 *
 *   - **server-backed** (a server is connected): boot i18n, then mount the island
 *     into `#admin-settings-root`; it reads GET /api/v1/settings/admin and saves
 *     via POST /api/v1/settings.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing.
 *
 * Reached from the navbar's admin "Admin Settings" link (/admin/settings), 302'd
 * into the bundle by the link-router.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import AdminSettingsPage from '@modules/admin/pages/AdminSettingsPage.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  if (localFirst) {
    document.getElementById('admin-settings-offline')?.removeAttribute('hidden');
    document.getElementById('admin-settings-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    await bootI18n();
    const target = document.getElementById('admin-settings-root');
    if (target) {
      mount(AdminSettingsPage, { target });
    }
  }

  await bootAppPage({ requireAuth: true });
}

void start();
