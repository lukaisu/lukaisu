/**
 * Client-side navigation for the bundled ("Model B") client.
 *
 * In the bundled app there is no PHP server serving pages: the reader, library
 * and connect surfaces are static HTML shipped in the APK and served from the
 * WebView root. The existing Lukaisu Server frontend, however, emits server-relative links
 * (e.g. `/text/42/read`, `/texts`, `/connect`). This module rewrites those at
 * click time:
 *
 *   - links to a surface we bundle      -> the local page (read/library/connect)
 *   - other in-app server links         -> the *remote* server's web UI
 *     (edit, review, imports, settings…), so they keep working via the WebView
 *     even though they are not bundled yet (the hybrid that the roadmap calls
 *     "partition bundled-vs-WebView routes")
 *   - absolute URLs / target=_blank     -> left untouched (open as-is)
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { getApiServer } from '@shared/api/client';

/** Builders for the bundled pages (relative to the current page at the root). */
export const pageUrl = {
  connect(): string {
    return 'index.html';
  },
  /**
   * The connect/server-picker page forced open (`?connect`), skipping the
   * local-first auto-redirect to the library. This is the entry point for the
   * optional "Connect a server" action in Settings.
   */
  connectChooser(): string {
    return 'index.html?connect';
  },
  /** The same-origin PWA login screen (guest). */
  login(): string {
    return 'login.html';
  },
  /** The same-origin PWA sign-up screen (guest). */
  register(): string {
    return 'register.html';
  },
  /** The guest "email me a reset link" screen. */
  forgotPassword(): string {
    return 'forgot-password.html';
  },
  /** The guest "set a new password with an emailed token" screen. */
  resetPassword(query = ''): string {
    return query ? `reset-password.html?${query}` : 'reset-password.html';
  },
  /** The guest "reset with a one-time recovery code" screen. */
  recoverPassword(): string {
    return 'recover-password.html';
  },
  home(): string {
    return 'home.html';
  },
  library(): string {
    return 'library.html';
  },
  read(textId: number | string, langId?: number | string): string {
    const lang = langId ? `&lang=${encodeURIComponent(String(langId))}` : '';
    return `read.html?text=${encodeURIComponent(String(textId))}${lang}`;
  },
  review(params: URLSearchParams): string {
    const query = params.toString();
    return query ? `review.html?${query}` : 'review.html';
  },
  languages(): string {
    return 'languages.html';
  },
  newLanguage(): string {
    return 'language.html';
  },
  editLanguage(langId: number | string): string {
    return `language-edit.html?id=${encodeURIComponent(String(langId))}`;
  },
  starterVocab(langId: number | string): string {
    return `starter-vocab.html?lang=${encodeURIComponent(String(langId))}`;
  },
  newText(): string {
    return 'text.html';
  },
  archivedTexts(): string {
    return 'texts.html';
  },
  editText(textId: number | string): string {
    return `text-edit.html?id=${encodeURIComponent(String(textId))}`;
  },
  textCheck(): string {
    return 'text-check.html';
  },
  tags(): string {
    return 'tags.html';
  },
  /** New/edit tag form (Svelte TagForm island); `id` present ⇒ edit mode. */
  tagForm(kind: 'term' | 'text', id?: number | string): string {
    const params = new URLSearchParams({ kind });
    if (id != null) {
      params.set('id', String(id));
    }
    return `tag-form.html?${params.toString()}`;
  },
  feeds(): string {
    return 'feeds.html';
  },
  /** New/edit feed form (Svelte FeedFormPage island); `id` present ⇒ edit mode. */
  feedForm(id?: number | string): string {
    return id != null
      ? `feed-form.html?feed=${encodeURIComponent(String(id))}`
      : 'feed-form.html';
  },
  dictionaries(langId?: number | string): string {
    return langId != null
      ? `dictionaries.html?lang=${encodeURIComponent(String(langId))}`
      : 'dictionaries.html';
  },
  dictionaryImport(langId?: number | string): string {
    return langId != null
      ? `dictionary-import.html?lang=${encodeURIComponent(String(langId))}`
      : 'dictionary-import.html';
  },
  settings(): string {
    return 'settings.html';
  },
  /** Server-wide admin settings (server entity, gated). */
  adminSettings(): string {
    return 'admin-settings.html';
  },
  statistics(): string {
    return 'statistics.html';
  },
  print(textId: number | string): string {
    return `text-print.html?text=${encodeURIComponent(String(textId))}`;
  },
  words(query = ''): string {
    return query ? `words.html?${query}` : 'words.html';
  },
  word(termId: number | string): string {
    return `word.html?id=${encodeURIComponent(String(termId))}`;
  },
  /** Standalone "new term" form (no text context); `lang` seeds the picker. */
  newWord(lang?: number | string): string {
    return lang != null ? `word-new.html?lang=${encodeURIComponent(String(lang))}` : 'word-new.html';
  },
  bulkTranslate(query = ''): string {
    return query ? `bulk-translate.html?${query}` : 'bulk-translate.html';
  },
  wordUpload(): string {
    return 'word-upload.html';
  },
  /** Server book list (server entity, gated). */
  books(): string {
    return 'books.html';
  },
  /** Server book detail (server entity, gated); reached from the reader book-nav. */
  book(id: number | string): string {
    return `book.html?id=${encodeURIComponent(String(id))}`;
  }
};

/**
 * Map a server-relative path to a bundled page URL, or null if no bundled page
 * covers it (caller falls back to the remote server).
 */
export function bundledPageFor(path: string): string | null {
  // Strip query/hash for matching; keep the original for param extraction.
  const [pathname, query = ''] = path.split('?');

  // The home route ('/' and '/index.php') renders the bundled dashboard, the
  // same as the server. The texts list keeps its own route ('/texts' ->
  // library), so the navbar logo lands on the dashboard while the Texts nav goes
  // to the library — matching the server's two surfaces.
  if (pathname === '/' || pathname === '/index.php') {
    return pageUrl.home();
  }
  if (pathname === '/texts') {
    return pageUrl.library();
  }
  if (pathname === '/connect') {
    return pageUrl.connect();
  }
  // Same-origin login screen (the token-API login island). A logout link or an
  // auth-expired bounce that lands on /login resolves to the bundled page.
  if (pathname === '/login') {
    return pageUrl.login();
  }
  // Guest auth surfaces (token-API Svelte islands). The login "Create account" /
  // "Forgot password" links and the emailed reset/recover links resolve here.
  if (pathname === '/register') {
    return pageUrl.register();
  }
  if (pathname === '/password/forgot') {
    return pageUrl.forgotPassword();
  }
  // Reset carries the emailed `?token=` through to the island.
  if (pathname === '/password/reset') {
    return pageUrl.resetPassword(query);
  }
  if (pathname === '/password/recover') {
    return pageUrl.recoverPassword();
  }
  // Create surfaces: the navbar "+" and library "new text" links point here.
  // The server-rendered forms can't run offline, so route to the bundled
  // API-client forms instead.
  if (pathname === '/languages/new') {
    return pageUrl.newLanguage();
  }
  if (pathname === '/texts/new') {
    return pageUrl.newText();
  }
  // Archived texts list — reached from the active list's "Archived Texts" action
  // card (/text/archived?query=&page=1) and the navbar.
  if (pathname === '/text/archived') {
    return pageUrl.archivedTexts();
  }
  // Parse-preview tool, reached from the navbar's "Check a text" link
  // (/text/check). The server form does a native POST; the bundle parses
  // on-device instead.
  if (pathname === '/text/check') {
    return pageUrl.textCheck();
  }
  // Single-text edit form, reached from both lists' Edit links: /texts/{id}/edit
  // (active, from library.html) and /text/archived/{id}/edit (archived, from
  // texts.html) both render the same bundled form (it detects archived itself).
  const textEditMatch = pathname.match(/^\/texts\/(\d+)\/edit$/)
    ?? pathname.match(/^\/text\/archived\/(\d+)\/edit$/);
  if (textEditMatch) {
    return pageUrl.editText(textEditMatch[1]);
  }
  // Languages list, and the per-language settings form reached from its Edit
  // links (/languages/{id}/edit -> language-edit.html?id={id}).
  if (pathname === '/languages') {
    return pageUrl.languages();
  }
  const langEditMatch = pathname.match(/^\/languages\/(\d+)\/edit$/);
  if (langEditMatch) {
    return pageUrl.editLanguage(langEditMatch[1]);
  }
  // Starter-vocab offer (shown after creating a language): /languages/{id}/starter-vocab
  // -> the bundled Svelte StarterVocab island, carrying the language id as ?lang=.
  // Server-gated like feeds (the FrequencyWords import + Wiktionary enrichment need
  // a connected server); offline it shows a "connect a server" notice.
  const starterVocabMatch = pathname.match(/^\/languages\/(\d+)\/starter-vocab$/);
  if (starterVocabMatch) {
    return pageUrl.starterVocab(starterVocabMatch[1]);
  }
  // Standalone new-term form: /words/new -> word-new.html (creates via
  // TermsApi.createStandalone). Must precede the /words list + edit matches.
  if (pathname === '/words/new') {
    const lang = new URLSearchParams(query).get('lang');
    return pageUrl.newWord(lang ?? undefined);
  }
  // Single-term edit form: /words/{id}/edit -> word.html?id={id}. Must precede
  // the list mapping below (which matches the literal /words/edit, not this).
  const wordEditMatch = pathname.match(/^\/words\/(\d+)\/edit$/);
  if (wordEditMatch) {
    return pageUrl.word(wordEditMatch[1]);
  }
  // Terms list: both /words and the legacy /words/edit render the same Alpine
  // SPA. Carry the query through (the list reads `lang` from it).
  if (pathname === '/words' || pathname === '/words/edit') {
    return pageUrl.words(query);
  }
  // Bulk-translate (reader's "Lookup New Words" flow): /word/bulk-translate ->
  // the bundled Svelte BulkTranslate island, carrying tid/offset/sl/tl through.
  // Server-gated like starter-vocab (the unknown-word query + save endpoint +
  // Google Translate widget need a connected server); offline it shows a
  // "connect a server" notice.
  if (pathname === '/word/bulk-translate') {
    return pageUrl.bulkTranslate(query);
  }
  // Word import (frequency / curated dictionaries / manual file upload):
  // /word/upload -> the bundled Svelte WordUpload island. Server-gated like
  // bulk-translate (the file import, frequency import and curated import all need
  // a connected server); offline it shows a "connect a server" notice. The query
  // is dropped — the island reads the current language from its server config.
  if (pathname === '/word/upload') {
    return pageUrl.wordUpload();
  }
  // Books (server book entity: EPUB-imported / long-text-split multi-chapter
  // books). The list (/books) and detail (/book/{id}, reached from the reader's
  // book-nav book-title link) render bundled Svelte islands backed by
  // /api/v1/books; server-gated (the book entity is server-only), offline they
  // show a "connect a server" notice.
  if (pathname === '/books') {
    return pageUrl.books();
  }
  const bookMatch = pathname.match(/^\/book\/(\d+)$/);
  if (bookMatch) {
    return pageUrl.book(bookMatch[1]);
  }
  // Tag management: the server splits term tags (/tags, /tags/term) and text
  // tags (/tags/text) across two pages; the bundle shows both on one tags.html.
  // (The /tags/{term,text}/{id} mutation paths are API calls, not navigation, so
  // they never reach here.)
  if (pathname === '/tags' || pathname === '/tags/term' || pathname === '/tags/text') {
    return pageUrl.tags();
  }
  // Tag create/edit forms: /tags/new, /tags/{id}/edit and the /tags/text/*
  // variants render the bundled Svelte TagForm island (kind + id in the query).
  // The mutation paths (/tags/{term,text}/{id}) are API calls, not navigation.
  if (pathname === '/tags/new') {
    return pageUrl.tagForm('term');
  }
  if (pathname === '/tags/text/new') {
    return pageUrl.tagForm('text');
  }
  // Text before term: the term regex's \d+ won't match the literal "text".
  const tagTextEditMatch = pathname.match(/^\/tags\/text\/(\d+)\/edit$/);
  if (tagTextEditMatch) {
    return pageUrl.tagForm('text', tagTextEditMatch[1]);
  }
  const tagEditMatch = pathname.match(/^\/tags\/(\d+)\/edit$/);
  if (tagEditMatch) {
    return pageUrl.tagForm('term', tagEditMatch[1]);
  }
  // Feeds — the first server-enhanced (Job B) surface. The languages page links
  // to /feeds?filterlang=… and the server serves the SPA at /feeds and
  // /feeds/manage; the bundle shows both on feeds.html, gated to a connected
  // server. The query (filterlang, …) is dropped — the SPA has its own filter UI.
  if (pathname === '/feeds' || pathname === '/feeds/manage') {
    return pageUrl.feeds();
  }
  // Feed new/edit form: /feeds/new and /feeds/{id}/edit render the bundled Svelte
  // FeedFormPage island (feed id → ?feed=). Server-gated like feeds. The wizard
  // (/feeds/wizard) and per-feed load/multi-load routes stay server-only (they
  // fall through to the connected server's web UI). Match /feeds/new before the
  // edit regex.
  if (pathname === '/feeds/new') {
    return pageUrl.feedForm();
  }
  const feedEditMatch = pathname.match(/^\/feeds\/(\d+)\/edit$/);
  if (feedEditMatch) {
    return pageUrl.feedForm(feedEditMatch[1]);
  }
  // Local dictionaries — server-enhanced (Job B). Reached from /dictionaries?lang=
  // and the per-language /languages/{id}/dictionaries; the bundle shows the
  // management + curated-import page (gated to a connected server). The
  // file-import form (/dictionaries/import, /languages/{id}/dictionaries/import)
  // is now bundled too (D3c) — it carries ?lang= through to dictionary-import.html,
  // which mounts the Svelte island and still posts the upload natively to the
  // server's kept /dictionaries/import route. Match the import paths first so the
  // bare-list matches below don't swallow them.
  const dictLangImportMatch = pathname.match(/^\/languages\/(\d+)\/dictionaries\/import$/);
  if (dictLangImportMatch) {
    return pageUrl.dictionaryImport(dictLangImportMatch[1]);
  }
  if (pathname === '/dictionaries/import') {
    const lang = new URLSearchParams(query).get('lang');
    return pageUrl.dictionaryImport(lang ?? undefined);
  }
  if (pathname === '/dictionaries') {
    const lang = new URLSearchParams(query).get('lang');
    return pageUrl.dictionaries(lang ?? undefined);
  }
  const dictLangMatch = pathname.match(/^\/languages\/(\d+)\/dictionaries$/);
  if (dictLangMatch) {
    return pageUrl.dictionaries(dictLangMatch[1]);
  }
  // Preferences: the navbar's "Preferences" link targets the server's
  // /profile/preferences form; route it to the bundled settings page so it
  // resolves locally instead of falling through to a remote server.
  if (pathname === '/profile/preferences') {
    return pageUrl.settings();
  }
  // Statistics — server-enhanced (Job B). Reached from the home dashboard and
  // the profile menu; the bundle shows streaks, an activity heatmap and the
  // intensity/frequency charts (gated to a connected server, which computes
  // them). The query is dropped — the page has no parameters.
  if (pathname === '/profile/statistics') {
    return pageUrl.statistics();
  }
  // Admin settings — server-enhanced. The navbar's admin "Admin Settings" link
  // (/admin/settings) opens the bundled Svelte panel, which reads/writes the
  // server-wide feed limits + multi-user flags via admin-scoped /api/v1/settings*.
  // Server-gated (the settings configure a connected server); the rest of /admin/*
  // (backup, wizard, demo, server-data, users) stays server-rendered.
  if (pathname === '/admin/settings') {
    return pageUrl.adminSettings();
  }
  // Plain print, reached from the reader's and library's printer links
  // (/text/{id}/print-plain). The bundled page is plain-print only; the
  // annotated "Improved Annotated Text" (/text/{id}/print) is a server-only
  // feature, so that path is left to fall through to the remote server.
  const printMatch = pathname.match(/^\/text\/(\d+)\/print-plain$/);
  if (printMatch) {
    return pageUrl.print(printMatch[1]);
  }
  // /text/{id}/read
  const readMatch = pathname.match(/^\/text\/(\d+)\/read$/);
  if (readMatch) {
    const params = new URLSearchParams(query);
    return pageUrl.read(readMatch[1], params.get('lang') ?? undefined);
  }
  // /review[?text=|lang=|selection=] — carry the selection params through.
  if (pathname === '/review') {
    const params = new URLSearchParams();
    for (const key of ['text', 'lang', 'selection']) {
      const value = new URLSearchParams(query).get(key);
      if (value) params.set(key, value);
    }
    return pageUrl.review(params);
  }
  return null;
}

/** True for links that should never be intercepted (external, new-tab, etc.). */
function isExternalLink(anchor: HTMLAnchorElement, href: string): boolean {
  if (anchor.target && anchor.target !== '' && anchor.target !== '_self') {
    return true;
  }
  if (anchor.hasAttribute('download')) {
    return true;
  }
  // Absolute URL to somewhere other than our own (bundle) origin.
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('//')) {
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch {
      return true;
    }
  }
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return true;
  }
  return false;
}

/** Resolve an absolute href to a server-relative path ("/text/1/read?x=y"). */
function toServerPath(href: string): string {
  try {
    const u = new URL(href, window.location.href);
    return u.pathname + u.search + u.hash;
  } catch {
    return href;
  }
}

/**
 * Install a single delegated click handler that rewrites in-app navigation.
 * Idempotent: safe to call once per page.
 */
export function installLinkRouter(): void {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (href === null || href === '' || isExternalLink(anchor, href)) return;

      const path = toServerPath(href);
      const bundled = bundledPageFor(path);

      if (bundled) {
        event.preventDefault();
        window.location.assign(bundled);
        return;
      }

      // Not bundled: hand off to the remote server's web UI if one is known.
      const server = getApiServer();
      if (server && path.startsWith('/')) {
        event.preventDefault();
        window.location.assign(server.replace(/\/+$/, '') + path);
      }
      // No server configured: leave the link to default behavior.
    },
    // Capture so we run before component handlers on plain anchors.
    true
  );
}
