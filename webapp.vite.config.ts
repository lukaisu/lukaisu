import { defineConfig, type PluginOption } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { cpSync, mkdirSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Bundled-client build.
 *
 * Emits standalone HTML pages — connect, library, reader — that boot the
 * frontend bundle (`webapp/js/client.ts`) against an on-device DB (and,
 * optionally, a remote `/api/v1`) with no PHP server in the loop. This is the
 * app's real build: no other repo is involved (Phase M — the frontend used to
 * live in `lukaisu-server` and get pulled in via `pull-webapp.mjs`; it now
 * lives here as `webapp/`).
 *
 * The page bodies under `webapp/app/` are **static HTML** — they were
 * originally prerendered from lukaisu-server's PHP views, but that build-time
 * coupling was severed before the move (the prerendered output was already
 * committed as the source). See `BRIEFING.md` for the local-first migration
 * plan.
 *
 * Output: dist/ (the Capacitor webDir, per capacitor.config.ts).
 *
 * Run: `npm run build`.
 */

/**
 * Copy the review feedback sounds into dist/sounds so the static
 * `<audio>` sources (`./sounds/*.mp3`) resolve in the bundle.
 */
function copyReviewSounds(): PluginOption {
  return {
    name: 'lukaisu-copy-review-sounds',
    apply: 'build',
    closeBundle() {
      const dest = resolve(__dirname, 'dist/sounds');
      mkdirSync(dest, { recursive: true });
      for (const file of ['success.mp3', 'failure.mp3']) {
        cpSync(resolve(__dirname, 'assets/sounds', file), resolve(dest, file));
      }
    }
  };
}

/**
 * Copy the WebView chrome files Capacitor itself expects at the dist/ root —
 * `error.html` (capacitor.config.ts's `errorPath`, shown if the WebView fails
 * to load) and the app icon. `publicDir` is off (see the alias comment below),
 * so these need an explicit copy like the review sounds above.
 */
function copyPublicFiles(): PluginOption {
  return {
    name: 'lukaisu-copy-public-files',
    apply: 'build',
    closeBundle() {
      for (const file of ['error.html', 'icon.svg']) {
        cpSync(resolve(__dirname, 'public', file), resolve(__dirname, 'dist', file));
      }
    }
  };
}

export default defineConfig({
  root: resolve(__dirname, 'webapp/app'),
  // Relative asset URLs so pages work when served from the bundle root inside
  // the WebView (capacitor://localhost / https://localhost).
  base: './',
  publicDir: false,

  resolve: {
    alias: {
      '@': resolve(__dirname, 'webapp/js'),
      '@shared': resolve(__dirname, 'webapp/js/shared'),
      '@modules': resolve(__dirname, 'webapp/js/modules'),
      '@css': resolve(__dirname, 'webapp/css')
      // NB: no `alpinejs` alias here (unlike lukaisu-server's server-side
      // vite.config.ts). The packaged client entry (`client.ts`) is
      // Alpine-free; omitting the alias makes any accidental
      // `import 'alpinejs'` into the client graph fail to resolve at build
      // time (plain `alpinejs` isn't a dependency — only `@alpinejs/csp`), so
      // an Alpine leak into the client is caught by the build, not shipped.
    }
  },

  // Svelte 5 is the rendering framework the client is migrating to (from
  // Alpine; the two coexist per-page during the incremental port). Svelte
  // compiles templates to plain JS at build time — no runtime `eval`/`new
  // Function` — so islands run under the bundle's strict `script-src 'self'`
  // CSP with none of Alpine's `@alpinejs/csp` constraints. Preprocess config
  // (TS support) lives in svelte.config.js, shared with `svelte-check`.
  plugins: [svelte(), copyReviewSounds(), copyPublicFiles()],

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'webapp/app/index.html'),
        login: resolve(__dirname, 'webapp/app/login.html'),
        register: resolve(__dirname, 'webapp/app/register.html'),
        'forgot-password': resolve(__dirname, 'webapp/app/forgot-password.html'),
        'reset-password': resolve(__dirname, 'webapp/app/reset-password.html'),
        'recover-password': resolve(__dirname, 'webapp/app/recover-password.html'),
        library: resolve(__dirname, 'webapp/app/library.html'),
        read: resolve(__dirname, 'webapp/app/read.html'),
        review: resolve(__dirname, 'webapp/app/review.html'),
        language: resolve(__dirname, 'webapp/app/language.html'),
        text: resolve(__dirname, 'webapp/app/text.html'),
        words: resolve(__dirname, 'webapp/app/words.html'),
        word: resolve(__dirname, 'webapp/app/word.html'),
        'word-new': resolve(__dirname, 'webapp/app/word-new.html'),
        languages: resolve(__dirname, 'webapp/app/languages.html'),
        'language-edit': resolve(__dirname, 'webapp/app/language-edit.html'),
        'starter-vocab': resolve(__dirname, 'webapp/app/starter-vocab.html'),
        'bulk-translate': resolve(__dirname, 'webapp/app/bulk-translate.html'),
        'word-upload': resolve(__dirname, 'webapp/app/word-upload.html'),
        'text-edit': resolve(__dirname, 'webapp/app/text-edit.html'),
        'text-check': resolve(__dirname, 'webapp/app/text-check.html'),
        tags: resolve(__dirname, 'webapp/app/tags.html'),
        'tag-form': resolve(__dirname, 'webapp/app/tag-form.html'),
        feeds: resolve(__dirname, 'webapp/app/feeds.html'),
        'feed-form': resolve(__dirname, 'webapp/app/feed-form.html'),
        books: resolve(__dirname, 'webapp/app/books.html'),
        book: resolve(__dirname, 'webapp/app/book.html'),
        statistics: resolve(__dirname, 'webapp/app/statistics.html'),
        dictionaries: resolve(__dirname, 'webapp/app/dictionaries.html'),
        'dictionary-import': resolve(__dirname, 'webapp/app/dictionary-import.html'),
        texts: resolve(__dirname, 'webapp/app/texts.html'),
        settings: resolve(__dirname, 'webapp/app/settings.html'),
        'admin-settings': resolve(__dirname, 'webapp/app/admin-settings.html'),
        'text-print': resolve(__dirname, 'webapp/app/text-print.html'),
        home: resolve(__dirname, 'webapp/app/home.html')
      }
    }
  }
});
