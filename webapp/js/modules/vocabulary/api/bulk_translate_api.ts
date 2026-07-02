/**
 * Bulk-translate bootstrap config fetch.
 *
 * The bulk-translate island needs server-only data the bundle cannot compute
 * locally — the text's dictionaries and the page of still-unknown words to
 * translate. The server exposes them at `GET /api/v1/terms/bulk-translate/config`
 * (dispatched by VocabularyApiRouter@routeGet → TermImportController@config), so
 * this uses the bearer-authed api client and works cross-origin against a
 * connected remote server.
 *
 * It is only reachable in server mode: the page is server-gated (the unknown-word
 * query, the save POST, and the Google Translate widget all need a connected
 * server), so offline the island is never mounted and this is never called.
 *
 * @license Unlicense <http://unlicense.org/>
 */
import { apiGet } from '@shared/api/client';

/** One unknown word the user can translate and save. */
export interface BulkTranslateTerm {
  word: string;
  languageId: number;
}

/** Dictionary URIs for the text's language (D1 / D2 / translator links). */
export interface BulkTranslateDictionaries {
  dict1: string;
  dict2: string;
  translate: string;
}

/** Bootstrap config the BulkTranslate island reads on mount. */
export interface BulkTranslateConfig {
  tid: number;
  /** Source language code for the Google Translate widget (page language). */
  sourceLanguage: string | null;
  /** Target language code for the Google Translate widget (included language). */
  targetLanguage: string | null;
  offset: number;
  dictionaries: BulkTranslateDictionaries;
  terms: BulkTranslateTerm[];
  /** Offset to carry for the next batch, or null when this is the last page. */
  nextOffset: number | null;
}

/**
 * Fetch the bulk-translate bootstrap config for a text/offset, or `null` when
 * the text is unknown or the request fails.
 */
export async function fetchBulkTranslateConfig(
  tid: number,
  offset: number,
  sl: string,
  tl: string
): Promise<BulkTranslateConfig | null> {
  const params = new URLSearchParams({
    tid: String(tid),
    offset: String(offset)
  });
  if (sl !== '') {
    params.set('sl', sl);
  }
  if (tl !== '') {
    params.set('tl', tl);
  }
  const response = await apiGet<Partial<BulkTranslateConfig>>(
    `/terms/bulk-translate/config?${params.toString()}`
  );
  const data = response.data;
  if (!data || !Array.isArray(data.terms)) {
    return null;
  }
  const dict = data.dictionaries ?? { dict1: '', dict2: '', translate: '' };
  return {
    tid: data.tid ?? tid,
    sourceLanguage: data.sourceLanguage ?? null,
    targetLanguage: data.targetLanguage ?? null,
    offset: data.offset ?? offset,
    dictionaries: {
      dict1: dict.dict1 ?? '',
      dict2: dict.dict2 ?? '',
      translate: dict.translate ?? ''
    },
    terms: data.terms,
    nextOffset: data.nextOffset ?? null
  };
}
