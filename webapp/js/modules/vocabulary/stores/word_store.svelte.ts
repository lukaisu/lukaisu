/**
 * Word Store (Svelte 5 runes) — port of the Alpine `createWordStore()`.
 *
 * The Alpine version (`word_store.ts`) is an `Alpine.store('words', ...)`, which
 * is Alpine-reactive and cannot be consumed by a Svelte component. This module
 * re-expresses the *same* reader + word-interaction state and methods with
 * Svelte 5 runes (`$state` in a `.svelte.ts` module) so `TextReaderApp.svelte`
 * and the word popover/modal islands can drive the reader directly. It reuses
 * the same `TextsApi`/`TermsApi` clients, the same `text_styles` injectors and
 * the same `text_renderer` (render + in-place DOM patch) helpers, so behaviour —
 * loading a text, selecting a word, the popover↔modal handoff, status changes,
 * quick-create, delete, dictionary URLs — is unchanged; only the reactivity
 * substrate is Svelte.
 *
 * The Alpine store stays in place as the PWA renderer (it still backs the server
 * build and has tests); the two coexist until the PWA retires.
 *
 * Reactivity note: `words` is `$state`, so its elements are deep proxies. The
 * `wordsByHex` index is a plain Map of those same proxies (built *after*
 * assigning `words`, so the references match), which keeps per-word mutations
 * reactive without a `SvelteMap` — the templates only read membership through
 * the `$state` `selectedHex`/`selectedPosition`, never the Map itself.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { SvelteMap } from 'svelte/reactivity';
import { TermsApi } from '@modules/vocabulary/api/terms_api';
import {
  TextsApi,
  type TextWord,
  type TextReadingConfig,
  type DictLinks,
  type MultiWordRef
} from '@modules/text/api/texts_api';
import { injectTextStyles, generateParagraphStyles } from '@modules/text/pages/reading/text_styles';
import {
  renderText,
  updateWordStatusInDOM,
  updateWordTranslationInDOM,
  type RenderSettings
} from '@modules/text/pages/reading/text_renderer';
/**
 * Word data stored in the word store. Ported from the retired Alpine
 * `word_store.ts` (deleted under R6e); this is now the canonical definition.
 */
export interface WordData {
  position: number;
  sentenceId: number;
  text: string;
  textLc: string;
  hex: string;
  isNotWord: boolean;
  wordCount: number;
  hidden: boolean;
  wordId: number | null;
  status: number;
  translation: string;
  romanization: string;
  notes?: string;
  tags?: string;
  // Multiword references (mw2, mw3, etc.) - full expression details
  [key: `mw${number}`]: MultiWordRef | undefined;
}

export type { MultiWordRef };

const DEFAULT_DICT_LINKS: DictLinks = { dict1: '', dict2: '', translator: '' };

/**
 * Reader + word-interaction state and behaviour, ported from the Alpine store to
 * Svelte 5 runes. Fields use `$state` so reads from the reader/popover/modal
 * islands are reactive.
 */
export class WordStore {
  // Word data — keyed by hex for O(1) lookup. Multiple words can share a hex
  // (same term occurring several times). The Map holds the same proxied objects
  // as `words`, so mutating either keeps both reactive. `SvelteMap` so the
  // index itself is reactive (and to satisfy svelte/prefer-svelte-reactivity).
  wordsByHex = new SvelteMap<string, WordData[]>();

  // All words in order (for rendering).
  words = $state<WordData[]>([]);

  // Configuration
  textId = $state(0);
  langId = $state(0);
  title = $state('');
  audioUri = $state<string | null>(null);
  sourceUri = $state<string | null>(null);
  audioPosition = $state(0);
  rightToLeft = $state(false);
  textSize = $state(100);
  removeSpaces = $state(false);
  dictLinks = $state<DictLinks>({ ...DEFAULT_DICT_LINKS });

  // Annotation/display settings
  showLearning = $state(1);
  displayStatTrans = $state(1);
  modeTrans = $state(2);
  termDelimiter = $state('');
  annTextSize = $state(50);

  // Reader layout
  readerWidth = $state(100);

  // Generated paragraph styles
  paragraphStyles = $state('');

  // UI state
  selectedHex = $state<string | null>(null);
  selectedPosition = $state<number | null>(null);
  popoverTargetElement = $state<HTMLElement | null>(null);
  isPopoverOpen = $state(false);
  isEditModalOpen = $state(false);
  isLoading = $state(false);
  isInitialized = $state(false);

  // Display settings (mirrored from the reader toolbar, matching Alpine).
  showAll = $state(false);
  showTranslations = $state(true);

  /**
   * Build the render settings used by `renderText` (annotation settings come
   * from the loaded config; `showAll`/`showTranslations` from the toolbar).
   */
  getRenderSettings(): RenderSettings {
    return {
      showAll: this.showAll,
      showTranslations: this.showTranslations,
      rightToLeft: this.rightToLeft,
      textSize: this.textSize,
      showLearning: this.showLearning,
      displayStatTrans: this.displayStatTrans,
      modeTrans: this.modeTrans,
      annTextSize: this.annTextSize
    };
  }

  /** Get rendered HTML for the text. */
  getRenderedHtml(): string {
    if (this.words.length === 0) return '';
    return renderText(this.words, this.getRenderSettings());
  }

  /**
   * Load words for a text from the API. Named `loadText` (not `init`) to mirror
   * the Alpine store, where Alpine auto-calls `init()`.
   */
  async loadText(textId: number): Promise<void> {
    if (!textId || textId <= 0) {
      return;
    }

    this.isLoading = true;

    try {
      const response = await TextsApi.getWords(textId);

      if (response.error || !response.data) {
        console.error('Failed to load text words:', response.error);
        this.isLoading = false;
        return;
      }

      this.initFromData(response.data.words, response.data.config);
    } catch (error) {
      console.error('Error loading text words:', error);
    }

    this.isLoading = false;
  }

  /** Initialize from pre-loaded data. */
  initFromData(words: TextWord[], config: TextReadingConfig): void {
    // Set configuration
    this.textId = config.textId;
    this.langId = config.langId;
    this.title = config.title;
    this.audioUri = config.audioUri;
    this.sourceUri = config.sourceUri;
    this.audioPosition = config.audioPosition;
    this.rightToLeft = config.rightToLeft;
    this.textSize = config.textSize;
    this.removeSpaces = config.removeSpaces ?? false;
    this.dictLinks = config.dictLinks;

    // Annotation/display settings
    this.showLearning = config.showLearning ?? 1;
    this.displayStatTrans = config.displayStatTrans ?? 1;
    this.modeTrans = config.modeTrans ?? 2;
    this.termDelimiter = config.termDelimiter ?? '';
    this.annTextSize = config.annTextSize ?? 50;
    this.readerWidth = config.readerWidth ?? 100;

    // Generate and inject dynamic styles
    injectTextStyles(config);
    this.paragraphStyles = generateParagraphStyles(config);

    // Build word data
    const built: WordData[] = [];
    for (const word of words) {
      const wordData: WordData = {
        position: word.position,
        sentenceId: word.sentenceId,
        text: word.text,
        textLc: word.textLc,
        hex: word.hex,
        isNotWord: word.isNotWord,
        wordCount: word.wordCount,
        hidden: word.hidden,
        wordId: word.wordId ?? null,
        status: word.status ?? 0,
        translation: word.translation ?? '',
        romanization: word.romanization ?? '',
        notes: word.notes ?? '',
        tags: word.tags
      };

      // Copy multiword references (mw2, mw3, etc.)
      for (let i = 2; i <= 9; i++) {
        const mwKey = `mw${i}` as const;
        if (word[mwKey]) {
          wordData[mwKey] = word[mwKey];
        }
      }

      built.push(wordData);
    }

    // Assign first (so `words` proxies the elements), then index the *proxied*
    // elements so `wordsByHex` and `words` share identity and stay reactive.
    this.words = built;
    this.wordsByHex.clear();
    for (const word of this.words) {
      if (!word.isNotWord) {
        const existing = this.wordsByHex.get(word.hex) || [];
        existing.push(word);
        this.wordsByHex.set(word.hex, existing);
      }
    }

    this.isInitialized = true;
  }

  /** Select a word and open the popover. */
  selectWord(hex: string, position: number, targetElement?: HTMLElement): void {
    this.selectedHex = hex;
    this.selectedPosition = position;
    this.popoverTargetElement = targetElement || null;
    this.isPopoverOpen = true;
  }

  /** Close the popover. */
  closePopover(): void {
    this.isPopoverOpen = false;
    this.popoverTargetElement = null;
    this.selectedHex = null;
    this.selectedPosition = null;
  }

  /** Open the edit modal (from popover). */
  openEditModal(): void {
    this.isPopoverOpen = false;
    this.isEditModalOpen = true;
  }

  /** Close the edit modal. */
  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.selectedHex = null;
    this.selectedPosition = null;
    this.popoverTargetElement = null;
  }

  /** Get the currently selected word data. */
  getSelectedWord(): WordData | null {
    if (!this.selectedHex || this.selectedPosition === null) return null;

    const wordsWithHex = this.wordsByHex.get(this.selectedHex);
    if (!wordsWithHex) return null;

    return wordsWithHex.find((w) => w.position === this.selectedPosition) || wordsWithHex[0];
  }

  /** Get all words with a given hex. */
  getWordsByHex(hex: string): WordData[] {
    return this.wordsByHex.get(hex) || [];
  }

  /** Set status for all words with the given hex. */
  async setStatus(hex: string, status: number): Promise<boolean> {
    const words = this.wordsByHex.get(hex);
    if (!words || words.length === 0) return false;

    const wordId = words[0].wordId;
    if (!wordId) {
      // Word doesn't exist yet — needs creating first.
      return false;
    }

    this.isLoading = true;

    try {
      const response = await TermsApi.setStatus(wordId, status);

      if (response.error) {
        console.error('Failed to set status:', response.error);
        this.isLoading = false;
        return false;
      }

      this.updateWordInStore(hex, { status });
      updateWordStatusInDOM(hex, status, wordId);

      this.isLoading = false;
      this.closePopover();
      return true;
    } catch (error) {
      console.error('Error setting status:', error);
      this.isLoading = false;
      return false;
    }
  }

  /** Create a word quickly with well-known (99) or ignored (98) status. */
  async createQuickWord(hex: string, position: number, status: 98 | 99): Promise<boolean> {
    this.isLoading = true;

    try {
      const response = await TermsApi.createQuick(this.textId, position, status);

      if (response.error || !response.data?.term_id) {
        console.error('Failed to create word:', response.error);
        this.isLoading = false;
        return false;
      }

      const newWordId = response.data.term_id;

      this.updateWordInStore(hex, { wordId: newWordId, status });
      updateWordStatusInDOM(hex, status, newWordId);

      this.isLoading = false;
      this.closePopover();
      return true;
    } catch (error) {
      console.error('Error creating word:', error);
      this.isLoading = false;
      return false;
    }
  }

  /** Delete a word (reset to unknown status). */
  async deleteWord(hex: string): Promise<boolean> {
    const words = this.wordsByHex.get(hex);
    if (!words || words.length === 0) return false;

    const wordId = words[0].wordId;
    if (!wordId) return false;

    this.isLoading = true;

    try {
      const response = await TermsApi.delete(wordId);

      if (response.error) {
        console.error('Failed to delete word:', response.error);
        this.isLoading = false;
        return false;
      }

      this.updateWordInStore(hex, {
        wordId: null,
        status: 0,
        translation: '',
        romanization: '',
        tags: undefined
      });
      updateWordStatusInDOM(hex, 0, null);
      updateWordTranslationInDOM(hex, '', '');

      this.isLoading = false;
      this.closePopover();
      return true;
    } catch (error) {
      console.error('Error deleting word:', error);
      this.isLoading = false;
      return false;
    }
  }

  /** Get dictionary URL for the selected word. */
  getDictUrl(which: 'dict1' | 'dict2' | 'translator'): string {
    const word = this.getSelectedWord();
    if (!word) return '#';

    const template = this.dictLinks[which];
    if (!template) return '#';

    return template.replace('lukaisu_term', encodeURIComponent(word.text));
  }

  /** Check if a dictionary URL is configured. */
  hasDictUrl(which: 'dict1' | 'dict2' | 'translator'): boolean {
    return !!this.dictLinks[which];
  }

  /** Update word data in the store (mutates the reactive proxies in place). */
  updateWordInStore(hex: string, updates: Partial<WordData>): void {
    const words = this.wordsByHex.get(hex);
    if (!words) return;

    for (const word of words) {
      Object.assign(word, updates);
    }
  }
}
