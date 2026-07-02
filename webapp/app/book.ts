/**
 * Book-detail page entry for the bundled client — a *server-enhanced* surface
 * backed by the Svelte `BookDetailPage` island.
 *
 * A "book" here is the SERVER book entity (books table + texts.book_id chapters),
 * created by the server EPUB import / long-text splitter. Its data lives only on
 * a connected server (`/api/v1/books/{id}`; the local-first router has no book
 * model — offline texts are standalone), so this page is gated exactly like
 * feeds:
 *
 *   - **server-backed** (a server is connected): boot i18n, fetch the book from
 *     GET /api/v1/books/{id}, then mount the island into `#book-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no /api/v1/books call fires.
 *
 * The book id comes from the URL (`book.html?id=5`), preserved by the
 * `/book/{id}` → bundle redirect (link-router in app/router.ts). A missing or
 * unknown book bounces to the book list.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import BookDetailPage from '@modules/book/pages/BookDetailPage.svelte';
import { BooksApi } from '@modules/book/api/books_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const params = new URLSearchParams(window.location.search);
const bookId = parseInt(params.get('id') ?? '0', 10) || 0;

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing.
    document.getElementById('book-offline')?.removeAttribute('hidden');
    document.getElementById('book-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
  } else if (bookId <= 0) {
    window.location.replace(pageUrl.books());
    return;
  } else {
    await bootI18n();
    const res = await BooksApi.get(bookId);
    if (res.error || !res.data) {
      window.location.replace(pageUrl.books());
      return;
    }
    const target = document.getElementById('book-root');
    if (target) {
      mount(BookDetailPage, {
        target,
        props: {
          book: res.data.book,
          chapters: res.data.chapters,
          onDeleted: () => window.location.assign(pageUrl.books())
        }
      });
    }
  }

  await bootAppPage({ requireAuth: true });
}

void start();
