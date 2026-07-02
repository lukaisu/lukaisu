/**
 * Starter-vocab bootstrap config fetch.
 *
 * The starter-vocab island needs server-only data the bundle cannot compute
 * locally — the language name, whether FrequencyWords data exists for it, and
 * the curated dictionaries filtered for the language. The server exposes them at
 * `GET /api/v1/languages/{id}/starter-vocab/config` (dispatched to
 * StarterVocabController@config), fetched through the api client so a connected
 * remote server authenticates it by bearer token.
 *
 * The page is server-gated (the FrequencyWords import + Wiktionary enrichment
 * need a connected server), so offline the island is never mounted and this is
 * never called.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet } from '@shared/api/client';

export interface CuratedDictSource {
  name: string;
  url: string;
  format: string;
  entries: string;
  license: string;
  notes: string;
  directDownload?: boolean;
  dictType?: 'translation' | 'definition';
  targetLanguage?: string;
}

export interface CuratedDictGroup {
  language: string;
  languageName: string;
  sources: CuratedDictSource[];
}

/** Bootstrap config the StarterVocab island reads on mount. */
export interface StarterVocabConfig {
  langId: number;
  langName: string;
  /** FrequencyWords data exists for this language (Wiktionary source offered). */
  isAvailable: boolean;
  curatedDictionaries: CuratedDictGroup[];
}

/**
 * Fetch the starter-vocab bootstrap config for a language, or `null` when the
 * language is unknown or the request fails.
 */
export async function fetchStarterVocabConfig(
  langId: number
): Promise<StarterVocabConfig | null> {
  try {
    const response = await apiGet<StarterVocabConfig>(`/languages/${langId}/starter-vocab/config`);
    const data = response.data;
    if (!data || typeof data.langName !== 'string') {
      return null;
    }
    return {
      langId: data.langId ?? langId,
      langName: data.langName,
      isAvailable: data.isAvailable ?? false,
      curatedDictionaries: data.curatedDictionaries ?? []
    };
  } catch {
    return null;
  }
}
