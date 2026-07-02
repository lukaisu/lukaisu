/**
 * Word-upload bootstrap config fetch.
 *
 * The word-upload island needs server-only data the bundle cannot compute
 * locally — the current language (name + id), whether FrequencyWords data exists
 * for it, the curated dictionaries registry, and the default translation
 * delimiter. The frequency import and Wiktionary enrichment run against the
 * shared /api/v1 starter-vocab endpoints, and the manual file upload posts to
 * POST /api/v1/terms/upload (both built from `langId` / a static path in the
 * island). The server exposes this bootstrap config at
 * `GET /api/v1/terms/upload/config` (VocabularyApiRouter dispatches it to
 * TermImportController@uploadConfig), fetched through the api client so a
 * connected remote server authenticates it by bearer token.
 *
 * The page is server-gated (the file import + frequency import + curated import
 * all need a connected server), so offline the island is never mounted and this
 * is never called.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet } from '@shared/api/client';

/** A curated dictionary source entry (one downloadable dictionary). */
export interface CuratedDictSource {
  name: string;
  url: string;
  format: string;
  entries: string;
  license: string;
  notes: string;
  directDownload?: boolean;
  dictType?: 'translation' | 'definition' | string;
  targetLanguage?: string;
}

/** A curated dictionary language group. */
export interface CuratedDictGroup {
  language: string;
  languageName: string;
  sources: CuratedDictSource[];
}

/** Bootstrap config the WordUpload island reads on mount. */
export interface WordUploadConfig {
  /** Current language id (0 when none selected). */
  langId: number;
  /** Current language name ('' when none selected). */
  langName: string;
  /** FrequencyWords data exists for this language (Wiktionary source offered). */
  isFrequencyAvailable: boolean;
  /** Default translation-delimiter (for the merge/update import modes). */
  translationDelimiter: string;
  /** All curated dictionary groups (filtered/searched client-side). */
  curatedDictionaries: CuratedDictGroup[];
}

/**
 * Fetch the word-upload bootstrap config, or `null` when the request fails.
 */
export async function fetchWordUploadConfig(): Promise<WordUploadConfig | null> {
  try {
    const response = await apiGet<WordUploadConfig>('/terms/upload/config');
    const data = response.data;
    if (!data) {
      return null;
    }
    return {
      langId: data.langId ?? 0,
      langName: data.langName ?? '',
      isFrequencyAvailable: data.isFrequencyAvailable ?? false,
      translationDelimiter: data.translationDelimiter ?? '',
      curatedDictionaries: data.curatedDictionaries ?? []
    };
  } catch {
    return null;
  }
}
