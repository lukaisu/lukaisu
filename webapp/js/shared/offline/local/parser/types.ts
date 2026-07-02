/**
 * Parser types for the local-first (offline) tokenizer.
 *
 * These mirror the server's PHP parser value objects
 * (`src/Modules/Language/Domain/Parser/`) so that text → sentences →
 * word-occurrences can happen entirely on-device for the common case
 * (space-separated and right-to-left languages). CJK uses the
 * character-by-character fallback here; high-quality CJK tokenization stays
 * server-enhanced.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * Per-language parsing configuration.
 *
 * Field names mirror the `Lg*` columns of the server `languages` table
 * (without the prefix). All regex fields hold the *contents* of a character
 * class (what goes between `[` and `]`), not a full pattern. PHP `\x{HHHH}`
 * unicode escapes are accepted and normalized to JS `\u{HHHH}` form.
 */
export interface ParserConfig {
  /** Language id (informational; not used by tokenization itself). */
  languageId: number;
  /** Characters that end a sentence, e.g. `.!?:;` (plus `。！？：；` for CJK). */
  regexpSplitSentences: string;
  /** Patterns that should NOT end a sentence, pipe-separated, e.g. `Mr.|Dr.`. */
  exceptionsSplitSentences: string;
  /** Characters that may form a word, e.g. `a-zA-ZÀ-ÖØ-öø-ȳ`. */
  regexpWordCharacters: string;
  /** Pipe-separated `from=to` substitutions applied before parsing, or ''. */
  characterSubstitutions: string;
  /** Remove spaces between tokens (CJK). */
  removeSpaces: boolean;
  /** Treat each character as its own word (CJK). */
  splitEachChar: boolean;
  /** Right-to-left script (display hint; does not change tokenization). */
  rightToLeft: boolean;
  /**
   * BCP-47 code of the language being learned (e.g. `zh`, `ja`). Optional; used
   * by the Intl.Segmenter tokenizer to select the word-break dictionary. When
   * omitted the engine default locale is used (still script-driven for CJK).
   */
  languageCode?: string;
}

/**
 * A single parsed token — either a learnable word or a non-word run
 * (whitespace, punctuation, symbols).
 */
export interface Token {
  /** The token text content. */
  text: string;
  /** 0-based index of the sentence this token belongs to. */
  sentenceIndex: number;
  /** 0-based position of this token within its sentence. */
  order: number;
  /** True for learnable words, false for punctuation/whitespace. */
  isWord: boolean;
  /** Word count: 1 for single words, 0 for non-words. */
  wordCount: number;
}

/** Result of parsing: the sentence strings and the flat token list. */
export interface ParserResult {
  /** Sentence strings in reading order. */
  sentences: string[];
  /** All tokens (words and non-words) in reading order. */
  tokens: Token[];
}

/** A tokenizer for a family of languages. */
export interface Parser {
  /** Stable identifier, e.g. `regex` or `character`. */
  readonly type: string;
  parse(text: string, config: ParserConfig): ParserResult;
}
