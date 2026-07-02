/**
 * Project Gutenberg catalog client (Gutendex), ported to run client-side.
 *
 * Mirrors the server's `GutenbergClient` + `services/nlp/.../content/gutenberg.py`:
 * browse/search via the Gutendex API, pick the best UTF-8 plain-text URL from a
 * book's `formats` map, and strip the `*** START/END OF ... PROJECT GUTENBERG
 * EBOOK ***` boilerplate when importing. All network access goes through the
 * CORS-free helper so it works inside the packaged app with no server.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { corsFreeGet, corsFreeGetJson } from './native-http';
import type { DifficultyTier } from './difficulty';

const GUTENDEX_URL = 'https://gutendex.com/books/';

/** A Gutenberg book as the suggestion UI consumes it. */
export interface GutenbergBook {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  subjects: string[];
  downloadCount: number;
  textUrl: string;
  difficultyTier?: DifficultyTier;
}

/** A page of catalog results, matching the server's `{ results, count, next }`. */
export interface CatalogPage<T> {
  results: T[];
  count: number;
  next: boolean;
}

/** Raw Gutendex book record (only the fields we read). */
interface GutendexBook {
  id?: number;
  title?: string;
  authors?: Array<{ name?: string }>;
  languages?: string[];
  subjects?: string[];
  download_count?: number;
  formats?: Record<string, string>;
}

interface GutendexResponse {
  count?: number;
  next?: string | null;
  results?: GutendexBook[];
}

/**
 * Pick the best plain-text download URL from a Gutendex `formats` map. Prefers
 * an explicitly UTF-8 entry, then a `.txt`/"utf-8" URL, then any `text/plain`.
 * Mirrors `gutenberg.py::_extract_text_url`.
 */
export function extractTextUrl(formats: Record<string, string> | undefined): string {
  if (!formats || typeof formats !== 'object') {
    return '';
  }
  const plain: Array<[string, string]> = [];
  for (const [mime, url] of Object.entries(formats)) {
    if (typeof mime === 'string' && mime.includes('text/plain') && typeof url === 'string') {
      plain.push([mime, url]);
    }
  }
  for (const [mime, url] of plain) {
    if (mime.toLowerCase().includes('utf-8')) {
      return url;
    }
  }
  for (const [, url] of plain) {
    const lower = url.toLowerCase();
    if (lower.endsWith('.txt') || lower.includes('utf-8')) {
      return url;
    }
  }
  return plain.length > 0 ? plain[0][1] : '';
}

function mapBook(raw: GutendexBook): GutenbergBook {
  return {
    id: raw.id ?? 0,
    title: raw.title ?? '',
    authors: (raw.authors ?? []).map((a) => a.name ?? '').filter((n) => n !== ''),
    languages: raw.languages ?? [],
    subjects: (raw.subjects ?? []).slice(0, 3),
    downloadCount: raw.download_count ?? 0,
    textUrl: extractTextUrl(raw.formats),
  };
}

/**
 * Browse (empty query) or search the Gutendex catalog. `languageCode` is an ISO
 * 639-1 code or null for no filter; `page` is 1-based.
 */
export async function searchGutenberg(
  query: string,
  languageCode: string | null,
  page: number
): Promise<CatalogPage<GutenbergBook>> {
  const params = new URLSearchParams();
  if (query) {
    params.set('search', query);
  }
  if (languageCode) {
    params.set('languages', languageCode);
  }
  if (page > 1) {
    params.set('page', String(page));
  }
  const qs = params.toString();
  const data = await corsFreeGetJson<GutendexResponse>(GUTENDEX_URL + (qs ? `?${qs}` : ''));
  return {
    results: (data.results ?? []).map(mapBook),
    count: data.count ?? 0,
    next: Boolean(data.next),
  };
}

// Everything before the START marker and after the END marker is boilerplate.
// `[\s\S]*?` instead of the `s`-flag so the regex works regardless of target.
const START_MARKER = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;
const END_MARKER = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;

/**
 * Strip Project Gutenberg header/footer boilerplate. When the markers are
 * absent the text is returned trimmed but otherwise unchanged. Mirrors
 * `gutenberg.py::fetch_text`'s stripping logic.
 */
export function stripGutenbergBoilerplate(text: string): string {
  let body = text;
  const start = START_MARKER.exec(body);
  if (start) {
    body = body.slice(start.index + start[0].length);
  }
  const end = END_MARKER.exec(body);
  if (end) {
    body = body.slice(0, end.index);
  }
  return body.trim();
}

/**
 * Download a Gutenberg plain-text book and strip its boilerplate. Returns ''
 * when the book is unreachable or empty.
 */
export async function fetchGutenbergText(url: string): Promise<string> {
  const res = await corsFreeGet(url, { accept: 'text/plain', timeoutMs: 20000 });
  if (!res.ok || !res.text) {
    return '';
  }
  return stripGutenbergBoilerplate(res.text);
}
