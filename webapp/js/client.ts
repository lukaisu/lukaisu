/**
 * Alpine-free entry point for the packaged local-first client.
 *
 * The client islands are Svelte and carry no Alpine `x-data`, so this entry
 * omits Alpine entirely — it runs only the shared, Alpine-free bootstrap from
 * `shared/boot/frontend_shell.ts` (CSS, infra, i18n, the Svelte navbar, token
 * upkeep). `app/boot.ts` dynamically imports this (instead of the Alpine-ful
 * `main.ts`) once it has set up local-first data mode, auth gating, and the
 * in-app link router. Server-rendered pages still boot `main.ts`.
 *
 * Keeping Alpine out of this graph is what makes the packaged client bundle
 * Alpine-free; the `vite.app.config.ts` alias for `alpinejs` is removed so any
 * accidental Alpine import into the client fails the build rather than silently
 * shipping the runtime.
 */

// Import Bulma CSS framework
import 'bulma/css/bulma.min.css';

// Import CSS from base directory
import '../css/base/styles.css';
import '../css/base/html5_audio_player.css';
import '../css/base/icons.css';

// Shared, Alpine-free bootstrap (infra side-effects, i18n, navbar, token upkeep)
import { runSharedInit, bootI18nAria, mountNavbar } from '@shared/boot/frontend_shell';

// Early shared init. No serverAuthRedirect: app/boot.ts already owns the
// packaged client's auth-expired routing (and stops propagation), so this entry
// must NOT register the server-relative /connect handler.
runSharedInit();

void (async () => {
  // i18n first, so the navbar and island labels render translated.
  await bootI18nAria();

  // Mount the global Svelte navbar island.
  mountNavbar();

  window.LUKAISU_VITE_LOADED = true;

  if (import.meta.env.DEV) {
    console.log('Lukaisu client bundle loaded (Alpine-free, development mode)');
  }
})();
