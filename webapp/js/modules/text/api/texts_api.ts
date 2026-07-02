/**
 * Texts API - Type-safe wrapper for text operations.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from '@shared/api/client';

/**
 * Dictionary links for a language.
 */
export interface DictLinks {
  dict1: string;
  dict2: string;
  translator: string;
}

/**
 * Text configuration for reading view.
 */
export interface TextReadingConfig {
  textId: number;
  langId: number;
  title: string;
  audioUri: string | null;
  sourceUri: string | null;
  audioPosition: number;
  rightToLeft: boolean;
  textSize: number;
  removeSpaces: boolean;
  dictLinks: DictLinks;
  // Annotation/display settings
  showLearning: number;
  displayStatTrans: number;
  modeTrans: number;
  termDelimiter: string;
  annTextSize: number;
  // Reader layout settings
  readerWidth: number;
}

/**
 * One chapter entry for the reader's chapter dropdown.
 */
export interface BookChapter {
  id: number;
  num: number;
  title: string;
}

/**
 * Book/chapter context for the reading screen's navigation, as returned by
 * GET /texts/{id}/book-context. Null when the text is standalone.
 */
export interface BookContext {
  bookId: number;
  bookTitle: string;
  chapterNum: number;
  chapterTitle: string | null;
  totalChapters: number;
  prevTextId: number | null;
  nextTextId: number | null;
  chapters: BookChapter[];
}

/** Envelope for GET /texts/{id}/book-context. */
export interface BookContextResponse {
  book: BookContext | null;
}

/** Player settings shared by GET /texts/{id}/audio. */
export interface AudioPlayerSettings {
  repeatMode: boolean;
  skipSeconds: number;
  playbackRate: number;
}

/** Audio metadata for the reader, as returned by GET /texts/{id}/audio. */
export interface AudioInfo {
  uri: string;
  position: number;
  playerSettings: AudioPlayerSettings;
}

/**
 * Multi-word expression reference data.
 */
export interface MultiWordRef {
  text: string;
  translation: string;
  status: number;
  wordId: number | null;
  startPos: number;
  endPos: number;
}

/**
 * Word data for client-side rendering.
 */
export interface TextWord {
  position: number;
  sentenceId: number;
  text: string;
  textLc: string;
  hex: string;
  isNotWord: boolean;
  wordCount: number;
  hidden: boolean;
  wordId?: number | null;
  status?: number;
  translation?: string;
  romanization?: string;
  notes?: string;
  tags?: string;
  // Multiword references (mw2, mw3, etc.) - now includes full expression details
  [key: `mw${number}`]: MultiWordRef | undefined;
}

/**
 * Response for getting text words.
 */
export interface TextWordsResponse {
  words: TextWord[];
  config: TextReadingConfig;
}

/**
 * Word count statistics for a text.
 */
export interface TextWordCount {
  total: number;
  unique: number;
  unknown: number;
  learning: number;
  learned: number;
  wellKnown: number;
  ignored: number;
}

/**
 * Text statistics response.
 */
export interface TextStatistics {
  wordCounts: TextWordCount;
  statusBreakdown?: Record<number, number>;
}

/**
 * Display mode settings for text reading.
 */
export interface TextDisplayMode {
  annotations: number;
  romanization: boolean;
  translation: boolean;
}

/**
 * Text creation request.
 */
export interface TextCreateRequest {
  title: string;
  langId: number;
  text: string;
  sourceUri?: string;
  audioUri?: string;
  tags?: string[];
}

/**
 * Text creation response.
 */
export interface TextCreateResponse {
  id?: number;
  error?: string;
}

/**
 * Display mode update response.
 */
export interface DisplayModeResponse {
  updated?: boolean;
  error?: string;
}

/**
 * One text's editable fields, as returned by GET /texts/{id}.
 *
 * Served both offline (the local router's IndexedDB arm) and server-backed
 * (`GET`/`PUT /api/v1/texts/{id}`, added with the PHP-view cut-over so
 * `text-edit.html` saves against a connected server too). PUT re-parses when the
 * body or language changed.
 */
export interface TextRecord {
  id: number;
  langId: number;
  title: string;
  text: string;
  sourceUri: string;
  audioUri: string;
  tags: string[];
  /** True when the text is archived (drives the post-save redirect target). */
  archived: boolean;
}

/**
 * Text update request (same editable fields as create).
 */
export interface TextUpdateRequest {
  title: string;
  langId: number;
  text: string;
  sourceUri?: string;
  audioUri?: string;
  tags?: string[];
}

/**
 * Text update response. `reparsed` is true when the body or language changed and
 * the text was re-tokenized.
 */
export interface TextUpdateResponse {
  updated?: boolean;
  reparsed?: boolean;
  error?: string;
}

/**
 * Request to preview how a raw text parses for a language (the "check a text"
 * tool). Served on-device (the local tokenizer) and server-backed
 * (`POST /api/v1/texts/check`, added with the PHP-view cut-over).
 */
export interface TextCheckRequest {
  langId: number;
  text: string;
}

/** A word/expression row in a parse preview: `[textLc, occurrences, translation]`. */
export type TextCheckWordRow = [string, number, string];

/** A non-word row in a parse preview: `[textLc, occurrences]`. */
export type TextCheckNonWordRow = [string, number];

/**
 * Parse-preview statistics for a text, mirroring the server's "check a text"
 * output: the reconstructed sentences, and the distinct word / non-word tokens
 * with their occurrence counts. Each word carries its saved translation (or `''`
 * when unknown, which the UI flags as "already saved" / red). `multiWords` is
 * always empty offline — multi-word terms are not created on-device, so
 * expression matching stays server-enhanced.
 */
export interface TextCheckResult {
  sentences: string[];
  words: TextCheckWordRow[];
  multiWords: TextCheckWordRow[];
  nonWords: TextCheckNonWordRow[];
  rtlScript: boolean;
  error?: string;
}

/**
 * Word data returned from mark-all operations.
 */
export interface MarkedWordData {
  wid: number;
  hex: string;
  term: string;
  status: number;
}

/**
 * Response for mark-all operations.
 */
export interface MarkAllResponse {
  count: number;
  words?: MarkedWordData[];
}

/**
 * Print item from API - represents a word or punctuation in print view.
 */
export interface PrintItem {
  position: number;
  text: string;
  isWord: boolean;
  isParagraph: boolean;
  wordId: number | null;
  status: number | null;
  translation: string;
  romanization: string;
  tags: string;
}

/**
 * Configuration for print view.
 */
export interface PrintConfig {
  textId: number;
  title: string;
  sourceUri: string;
  audioUri: string;
  langId: number;
  textSize: number;
  rtlScript: boolean;
  hasAnnotation: boolean;
  savedAnn: number;
  savedStatus: number;
  savedPlacement: number;
}

/**
 * Response for getting print items.
 */
export interface PrintItemsResponse {
  items: PrintItem[];
  config: PrintConfig;
}

/**
 * Annotation item from API - represents a term in improved annotated view.
 */
export interface AnnotationItem {
  order: number;
  text: string;
  wordId: number | null;
  translation: string;
  isWord: boolean;
}

/**
 * Configuration for annotation view.
 */
export interface AnnotationConfig {
  textId: number;
  title: string;
  sourceUri: string;
  audioUri: string;
  langId: number;
  textSize: number;
  rtlScript: boolean;
  hasAnnotation: boolean;
  ttsClass: string | null;
}

/**
 * Response for getting annotation.
 */
export interface AnnotationResponse {
  items: AnnotationItem[] | null;
  config: AnnotationConfig;
}

/**
 * Texts API methods.
 */
export const TextsApi = {
  /**
   * Get word count statistics for one or more texts.
   *
   * @param textIds Array of text IDs or comma-separated string
   * @returns Promise with text statistics
   */
  async getStatistics(
    textIds: number[] | string
  ): Promise<ApiResponse<TextStatistics>> {
    const ids = Array.isArray(textIds) ? textIds.join(',') : textIds;
    return apiGet<TextStatistics>('/texts/statistics', { text_ids: ids });
  },

  /**
   * Create a new text.
   *
   * @param data Text creation data
   * @returns Promise with new text ID or error
   */
  async create(data: TextCreateRequest): Promise<ApiResponse<TextCreateResponse>> {
    return apiPost<TextCreateResponse>('/texts', {
      title: data.title,
      language_id: data.langId,
      text: data.text,
      source_uri: data.sourceUri,
      audio_uri: data.audioUri,
      tags: data.tags
    });
  },

  /**
   * Get one text's editable fields (see {@link TextRecord}).
   *
   * @param textId Text ID
   * @returns Promise with the text record or an error
   */
  async get(textId: number): Promise<ApiResponse<TextRecord>> {
    return apiGet<TextRecord>(`/texts/${textId}`);
  },

  /**
   * Update one text's editable fields, re-parsing if the body/language changed
   * (see {@link TextRecord}).
   *
   * @param textId Text ID
   * @param data   Updated fields
   * @returns Promise with the update result
   */
  async update(
    textId: number,
    data: TextUpdateRequest
  ): Promise<ApiResponse<TextUpdateResponse>> {
    return apiPut<TextUpdateResponse>(
      `/texts/${textId}`,
      data as unknown as Record<string, unknown>
    );
  },

  /**
   * Preview how a raw text parses for a language — the "check a text" tool:
   * sentences plus the distinct word / non-word tokens with occurrence counts
   * and known-word translations. Local-first only (see {@link TextCheckRequest}).
   *
   * @param langId Language to parse with
   * @param text   The raw text to check
   * @returns Promise with the parse preview, or an error
   */
  async check(langId: number, text: string): Promise<ApiResponse<TextCheckResult>> {
    return apiPost<TextCheckResult>('/texts/check', { langId, text });
  },

  /**
   * Update display mode for text reading.
   *
   * @param textId Text ID
   * @param mode   Display mode settings
   * @returns Promise with update result
   */
  async setDisplayMode(
    textId: number,
    mode: Partial<TextDisplayMode>
  ): Promise<ApiResponse<DisplayModeResponse>> {
    return apiPut<DisplayModeResponse>(`/texts/${textId}/display-mode`, mode);
  },

  /**
   * Mark all unknown words in a text as well-known.
   *
   * @param textId Text ID
   * @returns Promise with count and words data
   */
  async markAllWellKnown(
    textId: number
  ): Promise<ApiResponse<MarkAllResponse>> {
    return apiPut<MarkAllResponse>(`/texts/${textId}/mark-all-wellknown`, {});
  },

  /**
   * Mark all unknown words in a text as ignored.
   *
   * @param textId Text ID
   * @returns Promise with count and words data
   */
  async markAllIgnored(
    textId: number
  ): Promise<ApiResponse<MarkAllResponse>> {
    return apiPut<MarkAllResponse>(`/texts/${textId}/mark-all-ignored`, {});
  },

  /**
   * Archive or delete multiple texts in one call.
   *
   * The JSON path for the destructive bulk actions, so they work against a
   * configurable API base URL instead of a same-origin form POST. The server
   * scopes the action to the current user's texts.
   *
   * @param action 'archive' or 'delete'
   * @param ids    Text IDs to act on
   * @returns Promise with the number of texts affected
   */
  async bulkAction(
    action: 'archive' | 'delete' | 'unarchive' | 'rebuild'
      | 'set-sentences' | 'set-active-sentences' | 'add-tag' | 'remove-tag',
    ids: number[],
    opts?: { archived?: boolean; tag?: string }
  ): Promise<ApiResponse<{ count: number }>> {
    return apiPut<{ count: number }>('/texts/bulk-action', {
      action,
      ids,
      ...(opts?.archived ? { archived: true } : {}),
      ...(opts?.tag !== undefined && opts.tag !== '' ? { tag: opts.tag } : {})
    });
  },

  /**
   * Archive a single text (mirrors the web route `POST /texts/{id}/archive`).
   *
   * Used by the bundled local-first client's per-text actions: the local
   * router serves it from IndexedDB by flipping `archivedAt`. The PHP server
   * exposes single archive only as a web route (and the JSON bulk-action), so
   * these per-text helpers are wired for offline mode and gated by the caller
   * (`isLocalFirst`) to preserve the server PWA's existing web-route path.
   *
   * @param textId Text ID to archive
   */
  async archive(textId: number): Promise<ApiResponse<{ archived: boolean }>> {
    return apiPost<{ archived: boolean }>(`/texts/${textId}/archive`, {});
  },

  /**
   * Restore a single archived text (mirrors `POST /texts/{id}/unarchive`).
   *
   * @param textId Text ID to unarchive
   */
  async unarchive(textId: number): Promise<ApiResponse<{ unarchived: boolean }>> {
    return apiPost<{ unarchived: boolean }>(`/texts/${textId}/unarchive`, {});
  },

  /**
   * Delete a single text (mirrors the web route `DELETE /texts/{id}`).
   *
   * @param textId Text ID to delete
   */
  async deleteText(textId: number): Promise<ApiResponse<{ deleted: boolean }>> {
    return apiDelete<{ deleted: boolean }>(`/texts/${textId}`);
  },

  /**
   * Get all words for a text (for client-side rendering).
   *
   * @param textId Text ID
   * @returns Promise with words array and config
   */
  async getWords(textId: number): Promise<ApiResponse<TextWordsResponse>> {
    return apiGet<TextWordsResponse>(`/texts/${textId}/words`);
  },

  /**
   * Get print items for a text (for client-side print rendering).
   *
   * @param textId Text ID
   * @returns Promise with print items and config
   */
  async getPrintItems(textId: number): Promise<ApiResponse<PrintItemsResponse>> {
    return apiGet<PrintItemsResponse>(`/texts/${textId}/print-items`);
  },

  /**
   * Get annotation data for improved/annotated text view.
   *
   * @param textId Text ID
   * @returns Promise with annotation items and config
   */
  async getAnnotation(textId: number): Promise<ApiResponse<AnnotationResponse>> {
    return apiGet<AnnotationResponse>(`/texts/${textId}/annotation`);
  },

  /**
   * Get the book/chapter context for the reader's chapter navigation.
   *
   * @param textId Text ID
   * @returns Promise with `{ book }`; book is null for a standalone text
   */
  async getBookContext(textId: number): Promise<ApiResponse<BookContextResponse>> {
    return apiGet<BookContextResponse>(`/texts/${textId}/book-context`);
  },

  /**
   * Get the audio metadata + player settings for the reader's media player.
   *
   * @param textId Text ID
   * @returns Promise with audio uri, saved position, and player settings
   */
  async getAudio(textId: number): Promise<ApiResponse<AudioInfo>> {
    return apiGet<AudioInfo>(`/texts/${textId}/audio`);
  }
};
