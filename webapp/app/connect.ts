/**
 * Connect/auth page entry for the bundled client.
 *
 * Local-first: with no server configured this page is NOT the first thing the
 * user sees — it redirects straight to the on-device library (seeding starter
 * content on first run). Connecting a server is an optional action, reached with
 * `?connect` (e.g. from Settings), which shows the existing `clientAuth` flow
 * (choose server -> log in/register -> store bearer token) and then navigates to
 * the library. If a token is already stored it skips straight there.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import ConnectPage from '@modules/auth/pages/ConnectPage.svelte';
import { getApiServer } from '@shared/api/client';
import { bootAppPage, initDataMode, injectConfig } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const forceConnect = new URLSearchParams(window.location.search).has('connect');

if (!getApiServer() && !forceConnect) {
  // First run / no server: stay on the neutral splash, become local-first, seed,
  // and open the library — the connect/auth UI never shows.
  void (async () => {
    await initDataMode();
    window.location.replace(pageUrl.library());
  })();
} else {
  // Connecting a server (explicit ?connect from Settings, or resuming a
  // configured one): swap the splash for the connect/auth UI before booting.
  document.getElementById('entry-splash')?.setAttribute('hidden', '');
  document.getElementById('connect-ui')?.removeAttribute('hidden');

  // ConnectPage navigates here after login (and on auto-skip when already signed
  // in). Must be a page the WebView can resolve locally.
  const homeUrl = pageUrl.library();
  const defaultServer = '';

  // Keep injecting the JSON config so the Alpine `clientAuth` PWA renderer still
  // reads the same blob; the Svelte island receives the values as props.
  injectConfig('client-auth-config', { defaultServer, homeUrl });

  void (async () => {
    // Resolve local-first vs server mode (and seed on first run) before the
    // island mounts, mirroring the words/library/review entries.
    await initDataMode();

    // Ensure translation strings are loaded before the island renders (the
    // shared shell's labels; the connect form itself ships fixed strings).
    await bootI18n();

    const target = document.getElementById('connect-root');
    if (target) {
      mount(ConnectPage, { target, props: { defaultServer, homeUrl } });
    }

    // Boot the shared shell (link router, Alpine). The connect page does NOT
    // require an existing session. Runs after the island is mounted; the two
    // manage disjoint DOM regions.
    await bootAppPage({ requireAuth: false });
  })();
}
