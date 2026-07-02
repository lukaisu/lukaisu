/**
 * Review API - Type-safe wrapper for test/review operations.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet, apiPut, type ApiResponse } from '@shared/api/client';

/**
 * FSRS scheduling state for a word (issue #238). Epoch-ms timestamps. Mirrors
 * the persisted `FsrsState` in `@shared/offline/local/fsrs`.
 */
export interface ReviewCard {
  stability: number;
  difficulty: number;
  due: number;
  lastReview: number | null;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
}

/**
 * Word test data returned from the API. `fsrs` carries the word's current
 * scheduling state so the client can compute the next card when graded.
 */
export interface WordTestData {
  term_id: number | string;
  solution?: string;
  term_text: string;
  group: string;
  fsrs?: ReviewCard;
}

/**
 * A graded review: the grade plus the client-computed next card and a log
 * entry. The server (or offline store) only persists this — the FSRS algorithm
 * runs client-side.
 */
export interface ReviewGradeRequest {
  termId: number;
  grade: number;
  /** Client-derived display status (1-5). */
  status: number;
  card: ReviewCard;
  log: {
    state: number;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    reviewedAt: number;
  };
}

/**
 * Review grade response.
 */
export interface ReviewGradeResponse {
  status?: number;
  due?: number;
  error?: string;
}

/**
 * Tomorrow count response.
 */
export interface TomorrowCountResponse {
  count: number;
}

/**
 * Review status update request.
 */
export interface ReviewStatusRequest {
  wordId: number;
  status?: number;
  change?: number;
}

/**
 * Review status update response.
 */
export interface ReviewStatusResponse {
  status?: number;
  controls?: string;
  error?: string;
}

/**
 * Parameters for getting next word to review.
 */
export interface NextWordParams {
  reviewKey: string;
  selection: string;
  wordMode: boolean;
  lgId: number;
  wordRegex: string;
  type: number;
}

/**
 * Language settings for a review.
 */
export interface ReviewLangSettings {
  name: string;
  dict1Uri: string;
  dict2Uri: string;
  translateUri: string;
  textSize: number;
  rtl: boolean;
  langCode: string;
}

/**
 * Review configuration response from server.
 */
export interface ReviewConfigResponse {
  reviewKey: string;
  selection: string;
  reviewType: number;
  isTableMode: boolean;
  wordMode: boolean;
  langId: number;
  wordRegex: string;
  langSettings: ReviewLangSettings;
  progress: {
    total: number;
    remaining: number;
    wrong: number;
    correct: number;
  };
  timer: {
    startTime: number;
    serverTime: number;
  };
  title: string;
  property: string;
}

/**
 * Word data for table review.
 */
export interface TableReviewWord {
  id: number;
  text: string;
  translation: string;
  romanization: string;
  sentence: string;
  sentenceHtml: string;
  status: number;
  score: number;
}

/**
 * Table review words response.
 */
export interface TableWordsResponse {
  words: TableReviewWord[];
  langSettings: ReviewLangSettings;
}

/**
 * Review API methods.
 */
export const ReviewApi = {
  /**
   * Get the next word to review.
   *
   * @param params Review parameters
   * @returns Promise with word review data
   */
  async getNextWord(params: NextWordParams): Promise<ApiResponse<WordTestData>> {
    return apiGet<WordTestData>('/review/next-word', {
      review_key: params.reviewKey,
      selection: params.selection,
      word_mode: params.wordMode,
      language_id: params.lgId,
      word_regex: params.wordRegex,
      type: params.type
    });
  },

  /**
   * Get count of words due for review tomorrow.
   *
   * @param reviewKey Review session key
   * @param selection Word selection criteria
   * @returns Promise with count
   */
  async getTomorrowCount(
    reviewKey: string,
    selection: string
  ): Promise<ApiResponse<TomorrowCountResponse>> {
    return apiGet<TomorrowCountResponse>('/review/tomorrow-count', {
      review_key: reviewKey,
      selection
    });
  },

  /**
   * Update word status during review.
   *
   * @param wordId Word ID
   * @param status New status (1-5, 98, 99) or undefined for increment
   * @param change Status change amount (+1 or -1)
   * @returns Promise with update result
   */
  async updateStatus(
    termId: number,
    status?: number,
    change?: number
  ): Promise<ApiResponse<ReviewStatusResponse>> {
    return apiPut<ReviewStatusResponse>('/review/status', {
      term_id: termId,
      status,
      change
    });
  },

  /**
   * Submit a graded review (Again/Hard/Good/Easy). The client has already
   * computed the next FSRS card; this persists it (locally or on the server).
   *
   * @param req The grade, the new card, the derived status, and the log entry
   * @returns Promise with the persisted status and next due date
   */
  async grade(req: ReviewGradeRequest): Promise<ApiResponse<ReviewGradeResponse>> {
    return apiPut<ReviewGradeResponse>('/review/grade', {
      term_id: req.termId,
      grade: req.grade,
      status: req.status,
      card: req.card,
      log: req.log
    });
  },

  /**
   * Get review configuration.
   *
   * @param params Review parameters (lang, text, or selection)
   * @returns Promise with review configuration
   */
  async getReviewConfig(params: {
    lang?: number;
    text?: number;
    selection?: number;
  }): Promise<ApiResponse<ReviewConfigResponse>> {
    return apiGet<ReviewConfigResponse>('/review/config', params);
  },

  /**
   * Get all words for table review mode.
   *
   * @param reviewKey Review session key
   * @param selection Word selection criteria
   * @returns Promise with table words
   */
  async getTableWords(
    reviewKey: string,
    selection: string
  ): Promise<ApiResponse<TableWordsResponse>> {
    return apiGet<TableWordsResponse>('/review/table-words', {
      review_key: reviewKey,
      selection
    });
  }
};
