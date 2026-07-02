/**
 * Content-discovery repository — the local-first owner of the catalog browse /
 * search / reader-level endpoints the suggestion UI calls.
 *
 * Browse/search reach the external catalogs (Gutendex, Global Digital Library)
 * CORS-free via the native-HTTP helper; difficulty tiers and the beginner flag
 * are computed against the on-device vocabulary, so the whole suggestion
 * experience works with no server. Gutenberg plain-text and GDL EPUB books are
 * also imported on-device here (download → extract → parse), and the coverage
 * preview — which samples a book against the on-device vocabulary — runs here for
 * both sources. Arbitrary-URL/RSS extraction is intentionally NOT handled here —
 * it stays server-enhanced (the router leaves it unrouted so it falls through to
 * the server when connected).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb } from '../schema';
import { resolveLanguageCode } from '../content/lang-code';
import { searchGutenberg, fetchGutenbergText, type GutenbergBook, type CatalogPage } from '../content/gutenberg';
import { searchGdl, type GdlBook } from '../content/gdl';
import { computeQuickTier, sortByTier, isBeginnerVocabulary } from '../content/difficulty';
import { computeCoverage, type CoveragePreview } from '../content/coverage';
import { fetchEpub, parseEpub, epubChapterTexts } from '../content/epub';
import { createText } from './texts';
import type { TextCreateResponse } from '@modules/text/api/texts_api';

/** Known-word count for a language: status 5/98/99, matching the server. */
async function knownWordCount(langId: number): Promise<number> {
  if (langId <= 0) {
    return 0;
  }
  return localDb.words
    .where('langId')
    .equals(langId)
    .and((w) => w.deletedAt == null && (w.status === 5 || w.status === 98 || w.status === 99))
    .count();
}

/** Resolve a language id to an ISO catalog code (null = no language filter). */
async function langCode(langId: number): Promise<string | null> {
  if (langId <= 0) {
    return null;
  }
  const lang = await localDb.languages.get(langId);
  return resolveLanguageCode(lang);
}

/** Browse popular Gutenberg books, tiered against local vocab and sorted easy-first. */
export async function gutenbergSuggestions(
  langId: number,
  page: number
): Promise<CatalogPage<GutenbergBook>> {
  const [code, known] = await Promise.all([langCode(langId), knownWordCount(langId)]);
  const data = await searchGutenberg('', code, page);
  const enriched = data.results.map((book) => ({
    ...book,
    difficultyTier: computeQuickTier(known, book.subjects),
  }));
  return { results: sortByTier(enriched), count: data.count, next: data.next };
}

/** Search Gutenberg by query, tiered against local vocab (relevance order kept). */
export async function librarySearch(
  query: string,
  langId: number,
  page: number
): Promise<CatalogPage<GutenbergBook>> {
  const code = langId > 0 ? await langCode(langId) : null;
  const data = await searchGutenberg(query, code, page);
  if (langId > 0 && data.results.length > 0) {
    const known = await knownWordCount(langId);
    data.results = data.results.map((book) => ({
      ...book,
      difficultyTier: computeQuickTier(known, book.subjects),
    }));
  }
  return data;
}

/** Browse GDL early-grade readers for a language (tiers come from the level). */
export async function gdlSuggestions(
  langId: number,
  page: number
): Promise<CatalogPage<GdlBook>> {
  const code = langId > 0 ? await langCode(langId) : null;
  return searchGdl('', code, page);
}

/** The reader's vocabulary size + beginner flag (drives home-row ordering). */
export async function readerLevel(
  langId: number
): Promise<{ vocabularySize: number; beginner: boolean }> {
  const known = await knownWordCount(langId);
  return { vocabularySize: known, beginner: isBeginnerVocabulary(known) };
}

/**
 * Coverage core: measure how much of an already-extracted book sample the reader
 * knows. "Known" is any word in the local vocabulary (no status filter, matching
 * the server's lookup) — broader than {@link readerLevel}'s 5/98/99 count.
 * Shared by the Gutenberg (plain-text) and GDL (EPUB) previews.
 */
async function coverageFromSample(
  text: string,
  langId: number,
  wordChars: string,
  splitEachChar: boolean
): Promise<CoveragePreview | { error: string }> {
  const words = await localDb.words
    .where('langId')
    .equals(langId)
    .and((w) => w.deletedAt == null)
    .toArray();
  const knownLc = new Set(words.map((w) => w.textLc));

  const result = computeCoverage(text, knownLc, wordChars, splitEachChar);
  if (!result) {
    return { error: 'No words could be extracted from the text sample.' };
  }
  return result;
}

/**
 * Coverage preview for a Gutenberg book: fetch + sample its text and measure how
 * much of its vocabulary the reader already knows. Gutenberg URLs only; other
 * sources stay server-enhanced.
 */
export async function analyzeCoverage(
  url: string,
  langId: number
): Promise<CoveragePreview | { error: string }> {
  if (!url) {
    return { error: 'url is required' };
  }
  if (langId <= 0) {
    return { error: 'language is required' };
  }
  const language = await localDb.languages.get(langId);
  if (!language) {
    return { error: 'Language not found.' };
  }
  const text = await fetchGutenbergText(url);
  if (!text) {
    return { error: 'Could not fetch text. The site may be unreachable.' };
  }
  return coverageFromSample(text, langId, language.regexpWordCharacters, language.splitEachChar);
}

/**
 * Coverage preview for a GDL (EPUB) book: download + unzip + extract the spine
 * text on-device, then measure vocabulary coverage like {@link analyzeCoverage}.
 * EPUB parsing only exists on the client, so this is local-first only (the GDL
 * UI exposes the preview action only when local-first is active).
 */
export async function analyzeEpubCoverage(
  url: string,
  langId: number
): Promise<CoveragePreview | { error: string }> {
  if (!url) {
    return { error: 'url is required' };
  }
  if (langId <= 0) {
    return { error: 'language is required' };
  }
  const language = await localDb.languages.get(langId);
  if (!language) {
    return { error: 'Language not found.' };
  }
  const bytes = await fetchEpub(url);
  if (!bytes) {
    return { error: 'Could not download the book. The site may be unreachable.' };
  }
  const parsed = parseEpub(bytes);
  if ('error' in parsed) {
    return { error: parsed.error };
  }
  return coverageFromSample(
    parsed.text,
    langId,
    language.regexpWordCharacters,
    language.splitEachChar
  );
}

/**
 * Import a Gutenberg plain-text book on-device: download + strip boilerplate +
 * parse into the local DB. Returns the new text id (or `{ error }`).
 */
export async function importGutenbergText(
  url: string,
  title: string,
  langId: number
): Promise<TextCreateResponse> {
  if (!url) {
    return { error: 'url is required' };
  }
  if (langId <= 0) {
    return { error: 'language is required' };
  }
  const text = await fetchGutenbergText(url);
  if (!text) {
    return { error: 'Could not fetch the book text. The site may be unreachable.' };
  }
  return createText({ title: title || 'Imported text', langId, text, sourceUri: url });
}

/**
 * Import an EPUB book on-device: download it CORS-free, unzip + walk its spine
 * + extract plain text, and parse into the local DB. Backs the GDL early-grade
 * readers (and any other EPUB URL). Under the settled book model (Option A) the
 * book becomes **one text per chapter**, grouped in the library by a shared tag
 * (the book title); the returned id is the **first chapter's**, so callers open
 * the book at chapter 1 (or `{ error }`).
 */
export async function importEpubText(
  url: string,
  title: string,
  langId: number
): Promise<TextCreateResponse> {
  if (!url) {
    return { error: 'url is required' };
  }
  if (langId <= 0) {
    return { error: 'language is required' };
  }
  const bytes = await fetchEpub(url);
  if (!bytes) {
    return { error: 'Could not download the book. The site may be unreachable.' };
  }
  const parsed = parseEpub(bytes);
  if ('error' in parsed) {
    return { error: parsed.error };
  }
  let firstId: number | undefined;
  for (const chapter of epubChapterTexts(title || parsed.title, parsed.chapters)) {
    const res = await createText({
      title: chapter.title,
      langId,
      text: chapter.text,
      sourceUri: url,
      tags: chapter.tags,
    });
    if (res.error || res.id == null) {
      return { error: res.error || 'Could not import the book.' };
    }
    if (firstId === undefined) {
      firstId = res.id;
    }
  }
  return firstId !== undefined ? { id: firstId } : { error: 'The book had no readable chapters.' };
}
