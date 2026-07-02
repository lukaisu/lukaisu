/**
 * Books API — type-safe wrapper for the server book entity (list / detail /
 * delete / reading progress) on `/api/v1/books`.
 *
 * A "book" here is the SERVER book entity (a books table row with `texts.book_id`
 * chapters), created by the server EPUB import / long-text splitter — distinct
 * from the bundled client's on-device tag-grouped import. These endpoints are
 * server-only (no local-first router entry), so the book pages are server-gated
 * exactly like feeds.
 *
 * The BookApiHandler wraps its payloads in a `{ success, data, ... }` envelope
 * (not the bare-body pattern most /api/v1 handlers use), so this module unwraps
 * it and returns typed data / a normalized error.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet, apiPost, apiDelete, apiPut, type ApiResponse } from '@shared/api/client';

/** One chapter to register: an already-created text id + its title, in order. */
export interface NewBookChapter {
  textId: number;
  title: string;
}

/** One chapter row (a text belonging to the book). */
export interface BookChapter {
  id: number;
  num: number;
  title: string;
}

/** A book as returned by the list + detail endpoints. */
export interface Book {
  id: number;
  title: string;
  author: string | null;
  description?: string | null;
  languageId: number;
  sourceType: string;
  totalChapters: number;
  currentChapter: number;
  /** Reading progress as a 0–100 percentage. */
  progress: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Pagination block from the list endpoint. */
export interface BooksPagination {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** The books-list result. */
export interface BooksListResult {
  books: Book[];
  pagination: BooksPagination;
}

/** The book-detail result (book + its chapters). */
export interface BookDetailResult {
  book: Book;
  chapters: BookChapter[];
}

/** Raw `{ success, data, pagination }` envelope the handler emits. */
interface BooksEnvelope<T> {
  success?: boolean;
  data?: T;
  pagination?: BooksPagination;
  error?: string;
  message?: string;
}

export const BooksApi = {
  /**
   * List books, optionally filtered by language, paginated.
   */
  async list(languageId?: number, page = 1, perPage = 20): Promise<ApiResponse<BooksListResult>> {
    const params: Record<string, string | number> = { page, per_page: perPage };
    if (languageId != null) {
      params.lg_id = languageId;
    }
    const res = await apiGet<BooksEnvelope<Book[]>>('/books', params);
    if (res.error) {
      return { error: res.error };
    }
    const body = res.data;
    if (!body || body.success === false || !Array.isArray(body.data)) {
      return { error: body?.error || 'Could not load books.' };
    }
    return {
      data: {
        books: body.data,
        pagination: body.pagination ?? {
          total: body.data.length,
          page,
          per_page: perPage,
          total_pages: 1
        }
      }
    };
  },

  /**
   * Get a single book with its chapters.
   */
  async get(id: number): Promise<ApiResponse<BookDetailResult>> {
    const res = await apiGet<BooksEnvelope<{ book: Book; chapters: BookChapter[] }>>(`/books/${id}`);
    if (res.error) {
      return { error: res.error };
    }
    const body = res.data;
    if (!body || body.success === false || !body.data?.book) {
      return { error: body?.error || 'Book not found.' };
    }
    return {
      data: {
        book: body.data.book,
        chapters: Array.isArray(body.data.chapters) ? body.data.chapters : []
      }
    };
  },

  /**
   * Register a server book over chapter texts the client already created.
   *
   * The bundled on-device EPUB import creates one text per chapter (offline-
   * capable); when a server is connected it calls this to fold those texts into a
   * book so it appears in the book list and the reader gains chapter nav. Server-
   * only: only call this when server-connected (offline text ids are local).
   */
  async createFromChapters(
    languageId: number,
    title: string,
    chapters: NewBookChapter[],
    author?: string
  ): Promise<ApiResponse<{ bookId: number | null; chapterCount: number }>> {
    const res = await apiPost<BooksEnvelope<{ bookId: number | null; chapterCount: number }>>('/books', {
      languageId,
      title,
      author: author ?? null,
      chapters
    });
    if (res.error) {
      return { error: res.error };
    }
    const body = res.data;
    if (!body || body.success === false || !body.data) {
      return { error: body?.error || body?.message || 'Could not register the book.' };
    }
    return { data: { bookId: body.data.bookId ?? null, chapterCount: body.data.chapterCount ?? 0 } };
  },

  /**
   * Delete a book (cascades to its chapter texts, server-side).
   */
  async remove(id: number): Promise<ApiResponse<{ message: string }>> {
    const res = await apiDelete<BooksEnvelope<never>>(`/books/${id}`);
    if (res.error) {
      return { error: res.error };
    }
    const body = res.data;
    if (!body || body.success === false) {
      return { error: body?.error || body?.message || 'Could not delete the book.' };
    }
    return { data: { message: body.message ?? '' } };
  },

  /**
   * Update the book's reading-progress marker to a chapter number.
   */
  async updateProgress(id: number, chapter: number): Promise<ApiResponse<{ message: string }>> {
    const res = await apiPut<BooksEnvelope<never>>(`/books/${id}/progress`, { chapter });
    if (res.error) {
      return { error: res.error };
    }
    const body = res.data;
    if (!body || body.success === false) {
      return { error: body?.error || 'Could not update progress.' };
    }
    return { data: { message: body.message ?? '' } };
  }
};
