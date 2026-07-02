/**
 * Global Digital Library (GDL) catalog client, ported to run client-side.
 *
 * Faithful port of `services/nlp/.../content/gdl.py` (itself a port of the PHP
 * `GdlClient`): searches the GDL WordPress content API for openly-licensed
 * early-grade readers (StoryWeaver, African Storybook, …), reading the "Level N"
 * label from each book's `topic[]` terms and mapping it to a difficulty tier.
 *
 * Browse/suggest only: this client supplies the catalog row. The EPUB books it
 * links to are imported on-device by the sibling `epub.ts` module (download →
 * unzip → extract → parse), wired through the content repository's
 * `importEpubText` (see both repos' BRIEFING.md seam).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { corsFreeGetJson } from './native-http';
import type { CatalogPage } from './gutenberg';
import type { DifficultyTier } from './difficulty';

const GDL_URL = 'https://content.digitallibrary.io/wp-json/content-api/v1/contentsearch';
const PAGE_SIZE = 20;

/** A GDL book as the suggestion UI consumes it. */
export interface GdlBook {
  id: number;
  title: string;
  publisher: string;
  description: string;
  language: string;
  license: string;
  level: string;
  difficultyTier: DifficultyTier | '';
  thumbnail: string;
  sourceUri: string;
  epubUrl: string;
}

interface GdlTerm {
  name?: string;
  slug?: string;
}

interface GdlPost {
  postId?: number;
  title?: string;
  publisher?: string;
  description?: string;
  language?: GdlTerm[];
  license?: GdlTerm[];
  topic?: GdlTerm[];
  thumbnail?: string | boolean;
  postLink?: string;
  epubUrl?: string;
}

interface GdlResponse {
  hits?: GdlPost[];
  results?: GdlPost[];
  books?: GdlPost[];
  meta?: { count?: number };
}

// Reading-level label, e.g. "Level 3" (case-insensitive, tolerant of spacing).
const LEVEL_PATTERN = /^Level\s*\d+/i;
const LEVEL_NUMBER = /(\d+)/;

/**
 * Map a GDL reading-level label to a coarse tier: 1-2 -> easy, 3 -> medium,
 * 4-5 -> hard. Returns '' when the label carries no number. Mirrors
 * `gdl.py::level_to_tier`.
 */
export function levelToTier(level: string): DifficultyTier | '' {
  const match = LEVEL_NUMBER.exec(level);
  if (!match) {
    return '';
  }
  const n = parseInt(match[1], 10);
  if (n <= 2) {
    return 'easy';
  }
  if (n >= 4) {
    return 'hard';
  }
  return 'medium';
}

/** Read the "Level N" label from a book's `topic[]` terms ('' if absent). */
function extractLevel(book: GdlPost): string {
  for (const topic of book.topic ?? []) {
    const name = String(topic?.name ?? '');
    if (LEVEL_PATTERN.test(name)) {
      return name;
    }
  }
  return '';
}

let decoderEl: HTMLTextAreaElement | null = null;

/** HTML-entity-decode a GDL text field (titles/descriptions are encoded). */
function decode(text: unknown): string {
  if (!text) {
    return '';
  }
  const raw = String(text);
  if (typeof document === 'undefined') {
    return raw;
  }
  if (!decoderEl) {
    decoderEl = document.createElement('textarea');
  }
  decoderEl.innerHTML = raw;
  return decoderEl.value;
}

function firstTermSlug(terms: GdlTerm[] | undefined): string {
  return terms && terms.length > 0 ? String(terms[0]?.slug ?? '') : '';
}

function firstTermName(terms: GdlTerm[] | undefined): string {
  return terms && terms.length > 0 ? String(terms[0]?.name ?? '') : '';
}

function mapPost(book: GdlPost): GdlBook {
  const level = extractLevel(book);
  return {
    id: Number(book.postId) || 0,
    title: decode(book.title),
    publisher: decode(book.publisher),
    description: decode(book.description).trim(),
    language: firstTermSlug(book.language),
    license: firstTermName(book.license),
    level,
    difficultyTier: levelToTier(level),
    thumbnail: typeof book.thumbnail === 'string' ? book.thumbnail : '',
    sourceUri: String(book.postLink ?? ''),
    epubUrl: String(book.epubUrl ?? '').trim(),
  };
}

function postsFromResponse(response: GdlResponse): GdlPost[] {
  return response.hits ?? response.results ?? response.books ?? [];
}

/**
 * Search (or, with an empty query, browse) the Global Digital Library. `page`
 * is 1-based; GDL paginates via a 0-based `_skip` offset of `PAGE_SIZE`.
 */
export async function searchGdl(
  query: string,
  languageCode: string | null,
  page: number
): Promise<CatalogPage<GdlBook>> {
  const params = new URLSearchParams();
  if (query) {
    params.set('query', query);
  }
  if (languageCode) {
    params.set('language', languageCode.toLowerCase());
  }
  if (page > 1) {
    params.set('_skip', String((page - 1) * PAGE_SIZE));
  }
  const qs = params.toString();
  const response = await corsFreeGetJson<GdlResponse>(GDL_URL + (qs ? `?${qs}` : ''));

  const posts = postsFromResponse(response).filter((p) => p && typeof p === 'object');
  const results = posts.map(mapPost);
  const count = response.meta?.count ?? results.length;

  return {
    results,
    count,
    next: page * PAGE_SIZE < count,
  };
}
