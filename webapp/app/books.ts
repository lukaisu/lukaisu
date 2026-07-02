/**
 * Books-list page entry for the bundled client — a *server-enhanced* surface
 * backed by the Svelte `BooksListPage` island.
 *
 * Books are the SERVER book entity (books table + texts.book_id chapters); their
 * data lives only on a connected server (`/api/v1/books`; the local-first router
 * has no book model), so this page is gated exactly like feeds:
 *
 *   - **server-backed** (a server is connected): boot i18n, then mount the island
 *     into `#books-root`; it reads `/api/v1/books`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no /api/v1/books call fires.
 *
 * Reached from the reader's book-nav → book detail → "All books", or a direct
 * `/books` link (302'd into the bundle by the link-router).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import BooksListPage from '@modules/book/pages/BooksListPage.svelte';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  if (localFirst) {
    document.getElementById('books-offline')?.removeAttribute('hidden');
    document.getElementById('books-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else {
    await bootI18n();
    const target = document.getElementById('books-root');
    if (target) {
      mount(BooksListPage, { target });
    }
  }

  await bootAppPage({ requireAuth: true });
}

void start();
