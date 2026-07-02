/**
 * Review Store (Svelte 5 runes) — port of the Alpine `createReviewStore()`.
 *
 * The Alpine version (`review_store.ts`) is an `Alpine.store('review', ...)`,
 * which is Alpine-reactive and cannot be consumed by a Svelte component. This
 * module re-expresses the *same* state and methods with Svelte 5 runes (`$state`
 * in a `.svelte.ts` module) so `ReviewPage.svelte` can drive the session
 * directly. It reuses the same `ReviewApi` client and the same FSRS adapter, so
 * the behaviour — fetching words, revealing, FSRS grading, manual status,
 * skipping, the timer offset calc, dictionary/edit URLs, sounds — is unchanged.
 *
 * The Alpine store stays in place as the PWA renderer (it still backs the
 * server build and has existing tests); the two coexist until the PWA retires.
 *
 * The elapsed-time interval is owned by the component (a `$effect` that ticks
 * `recomputeElapsed()` and is cleared on unmount); the store only computes the
 * value, so there is no stray interval to leak.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import {
  ReviewApi,
  type ReviewCard,
  type ReviewConfigResponse,
  type ReviewLangSettings
} from '@modules/review/api/review_api';
import { reviewFsrsState, newFsrsState, type ReviewGrade } from '@shared/offline/local/fsrs';
import { statusFromStability } from '@shared/stores/statuses';

/** Language settings for the review (identical shape to the API's `ReviewLangSettings`). */
export type LangSettings = ReviewLangSettings;

/**
 * Current word being reviewed. `fsrs` carries the word's current scheduling
 * state so the next card can be computed client-side when graded.
 */
export interface ReviewWord {
  wordId: number;
  text: string;
  translation: string;
  romanization: string;
  status: number;
  sentence: string;
  solution: string;
  group: string;
  fsrs: ReviewCard | null;
}

/** Review progress tracking. */
export interface ReviewProgress {
  total: number;
  remaining: number;
  wrong: number;
  correct: number;
}

/** Timer state (no interval id — the interval lives in the component). */
export interface ReviewTimer {
  startTime: number;
  serverTime: number;
  elapsed: string;
}

/** Initial values that can be set before the first configure (avoids flicker). */
export interface ReviewStoreInitialValues {
  reviewType?: number;
  isTableMode?: boolean;
}

const DEFAULT_LANG_SETTINGS: LangSettings = {
  name: '',
  dict1Uri: '',
  dict2Uri: '',
  translateUri: '',
  textSize: 100,
  rtl: false,
  langCode: ''
};

/**
 * Review session state + behaviour, ported from the Alpine store to Svelte 5
 * runes. Fields use `$state` so reads from `ReviewPage.svelte` are reactive.
 */
export class ReviewStore {
  // Review configuration
  reviewKey = $state('');
  selection = $state('');
  reviewType = $state(1);
  isTableMode = $state(false);
  wordMode = $state(false);
  langId = $state(0);
  wordRegex = $state('');
  property = $state('');
  title = $state('');

  // Language settings
  langSettings = $state<LangSettings>({ ...DEFAULT_LANG_SETTINGS });

  // Current word being reviewed
  currentWord = $state<ReviewWord | null>(null);

  // Progress tracking
  progress = $state<ReviewProgress>({ total: 0, remaining: 0, wrong: 0, correct: 0 });

  // Timer
  timer = $state<ReviewTimer>({ startTime: 0, serverTime: 0, elapsed: '00:00' });

  // UI state
  isLoading = $state(false);
  isFinished = $state(false);
  answerRevealed = $state(false);
  isModalOpen = $state(false);
  readAloudEnabled = $state(false);
  tomorrowCount = $state(0);
  error = $state<string | null>(null);
  isInitialized = $state(false);

  constructor(initialValues?: ReviewStoreInitialValues) {
    if (initialValues?.reviewType !== undefined) this.reviewType = initialValues.reviewType;
    if (initialValues?.isTableMode !== undefined) this.isTableMode = initialValues.isTableMode;
  }

  /**
   * Configure the store with settings from the server. Named `configure` (not
   * `init`) to mirror the Alpine store, where `init()` is auto-called.
   */
  configure(config: ReviewConfigResponse): void {
    this.reviewKey = config.reviewKey;
    this.selection = config.selection;
    this.reviewType = config.reviewType;
    this.isTableMode = config.isTableMode;
    this.wordMode = config.wordMode;
    this.langId = config.langId;
    this.wordRegex = config.wordRegex;
    this.property = config.property;
    this.title = config.title;
    this.langSettings = config.langSettings;
    this.progress = { ...config.progress };
    this.timer.startTime = config.timer.startTime;
    this.timer.serverTime = config.timer.serverTime;

    // Load read aloud preference from localStorage.
    const savedReadAloud = localStorage.getItem('lukaisu-review-read-aloud');
    if (savedReadAloud !== null) {
      this.readAloudEnabled = savedReadAloud === 'true';
    }

    this.isInitialized = true;
    this.recomputeElapsed();
  }

  /**
   * Fetch and display the next word.
   */
  async nextWord(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    this.answerRevealed = false;
    this.currentWord = null;
    this.error = null;

    try {
      const response = await ReviewApi.getNextWord({
        reviewKey: this.reviewKey,
        selection: this.selection,
        wordMode: this.wordMode,
        lgId: this.langId,
        wordRegex: this.wordRegex,
        type: this.reviewType
      });

      if (response.error) {
        this.error = response.error;
        this.isLoading = false;
        return;
      }

      if (!response.data || response.data.term_id === 0) {
        // No more words to test.
        this.isFinished = true;

        // Fetch tomorrow count.
        const tomorrowResponse = await ReviewApi.getTomorrowCount(this.reviewKey, this.selection);
        if (tomorrowResponse.data?.count) {
          this.tomorrowCount = tomorrowResponse.data.count;
        }
      } else {
        const data = response.data;
        this.currentWord = {
          wordId: typeof data.term_id === 'string' ? parseInt(data.term_id, 10) : data.term_id,
          text: data.term_text,
          translation: '', // Will be revealed with answer.
          romanization: '',
          status: 1,
          sentence: '',
          solution: data.solution || '',
          group: data.group,
          fsrs: data.fsrs ?? null
        };
      }
    } catch (err) {
      console.error('Error fetching next word:', err);
      this.error = 'Failed to load next word';
    }

    this.isLoading = false;
  }

  /**
   * Reveal the answer for the current word.
   */
  revealAnswer(): void {
    if (this.answerRevealed || !this.currentWord) return;
    this.answerRevealed = true;
  }

  /**
   * Grade the current word with an FSRS rating (1=Again … 4=Easy). The card is
   * computed client-side and persisted via the grade API (locally when offline,
   * on the server otherwise). Again counts as "wrong", the rest as "correct".
   *
   * @param grade FSRS grade 1-4
   */
  async gradeAnswer(grade: number): Promise<void> {
    if (!this.currentWord || this.isLoading) return;
    if (grade < 1 || grade > 4) return;

    this.isLoading = true;

    try {
      const now = Date.now();
      const prev = this.currentWord.fsrs ?? newFsrsState(now);
      const { state: card, log } = reviewFsrsState(prev, grade as ReviewGrade, now);
      const status = statusFromStability(card.stability);

      const response = await ReviewApi.grade({
        termId: this.currentWord.wordId,
        grade,
        status,
        card,
        log: {
          state: log.state,
          stability: log.stability,
          difficulty: log.difficulty,
          elapsedDays: log.elapsedDays,
          scheduledDays: log.scheduledDays,
          reviewedAt: log.reviewedAt
        }
      });

      if (response.error) {
        this.error = response.error;
        this.isLoading = false;
        return;
      }

      const correct = grade > 1;
      this.progress.remaining--;
      if (correct) {
        this.progress.correct++;
      } else {
        this.progress.wrong++;
      }
      this.playSound(correct);

      this.isLoading = false;
      await this.nextWord();
    } catch (err) {
      console.error('Error grading word:', err);
      this.error = 'Failed to grade word';
      this.isLoading = false;
    }
  }

  /**
   * Set a manual status flag on the current word (98 ignored / 99 well-known)
   * and advance. These take the word out of scheduling.
   *
   * @param status 98 or 99
   */
  async updateStatus(status: number): Promise<void> {
    if (!this.currentWord || this.isLoading) return;

    this.isLoading = true;

    try {
      const response = await ReviewApi.updateStatus(this.currentWord.wordId, status);

      if (response.error) {
        this.error = response.error;
        this.isLoading = false;
        return;
      }

      this.progress.remaining--;
      this.progress.correct++;
      this.playSound(true);

      this.isLoading = false;
      await this.nextWord();
    } catch (err) {
      console.error('Error updating status:', err);
      this.error = 'Failed to update status';
      this.isLoading = false;
    }
  }

  /**
   * Skip the current word without grading it (it stays due) and move on.
   */
  async skipWord(): Promise<void> {
    if (!this.currentWord || this.isLoading) return;

    this.progress.remaining--;
    await this.nextWord();
  }

  /**
   * Recompute the elapsed-time string from the server-time offset. Driven by
   * the component's interval `$effect`.
   */
  recomputeElapsed(): void {
    const now = Math.floor(Date.now() / 1000);
    const clientOffset = now - this.timer.serverTime;
    const elapsed = now - this.timer.startTime - clientOffset;
    this.timer.elapsed = this.formatElapsed(Math.max(0, elapsed));
  }

  /**
   * Format seconds as MM:SS or HH:MM:SS.
   */
  formatElapsed(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (n: number): string => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${pad(minutes)}:${pad(secs)}`;
  }

  /**
   * Get the dictionary URL for the current word.
   */
  getDictUrl(which: 'dict1' | 'dict2' | 'translator'): string {
    if (!this.currentWord) return '#';

    let template = '';
    switch (which) {
      case 'dict1':
        template = this.langSettings.dict1Uri;
        break;
      case 'dict2':
        template = this.langSettings.dict2Uri;
        break;
      case 'translator':
        template = this.langSettings.translateUri;
        break;
    }

    if (!template) return '#';

    return template.replace('lukaisu_term', encodeURIComponent(this.currentWord.text));
  }

  /**
   * Check if a dictionary URL is configured.
   */
  hasDictUrl(which: 'dict1' | 'dict2' | 'translator'): boolean {
    switch (which) {
      case 'dict1':
        return !!this.langSettings.dict1Uri;
      case 'dict2':
        return !!this.langSettings.dict2Uri;
      case 'translator':
        return !!this.langSettings.translateUri;
    }
  }

  /**
   * Get the edit URL for the current word.
   *
   * Points at the bundled term editor (`/words/{id}/edit` → word.html), which
   * the link-router serves in-bundle. The old `/word/edit-term` server form
   * (TermEditController@editTerm) is being retired under the headless cut.
   */
  getEditUrl(): string {
    if (!this.currentWord) return '#';
    return `/words/${this.currentWord.wordId}/edit`;
  }

  /**
   * Open the word details modal.
   */
  openModal(): void {
    this.isModalOpen = true;
  }

  /**
   * Close the word details modal.
   */
  closeModal(): void {
    this.isModalOpen = false;
  }

  /**
   * Play success or failure sound (resets to the start first; ignores autoplay
   * rejections). Selects the static `<audio>` elements by id.
   */
  playSound(correct: boolean): void {
    const soundId = correct ? 'success_sound' : 'failure_sound';
    const audio = document.getElementById(soundId) as HTMLAudioElement | null;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay errors.
      });
    }
  }

  /**
   * Set the read aloud preference and persist it.
   */
  setReadAloud(enabled: boolean): void {
    this.readAloudEnabled = enabled;
    localStorage.setItem('lukaisu-review-read-aloud', String(enabled));
  }
}
