/**
 * Segmenter parser — the high-quality on-device CJK tokenizer, built on the
 * platform's `Intl.Segmenter` (ICU dictionary-based word segmentation).
 *
 * Where `CharacterParser` emits one token per character, this groups characters
 * into dictionary words (e.g. 「学習」 as a single term) using the ICU word-break
 * data already bundled in every current Android System WebView / browser
 * engine — no server, no install, no bundled dictionary, fully offline. Quality
 * sits between the character fallback and the server-side MeCab/jieba parsers;
 * readings (furigana), POS and lemmas remain server-enhanced.
 *
 * Selection and the feature-detect fallback to `characterParser` live in
 * `index.ts`. Sentence boundaries reuse the language's `regexpSplitSentences`
 * (not the segmenter's own locale sentence rules) so behaviour stays consistent
 * with the character and regex parsers.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import type { Parser, ParserConfig, ParserResult, Token } from './types';
import { normalizeClassFragment } from './regex-utils';

/**
 * Minimal structural types for `Intl.Segmenter`. The project targets ES2020,
 * whose lib does not declare `Intl.Segmenter` (it lives in `es2022.intl`), so
 * we describe just the slice we use and reach it through a guarded cast. This
 * compiles whether or not the ambient lib happens to include the full types.
 */
interface SegmentData {
  segment: string;
  isWordLike?: boolean;
}
interface SegmenterLike {
  segment(input: string): Iterable<SegmentData>;
}
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' }
) => SegmenterLike;

/** The `Intl.Segmenter` constructor if the engine provides it, else null. */
function segmenterCtor(): SegmenterCtor | null {
  const intl = Intl as unknown as { Segmenter?: SegmenterCtor };
  return typeof intl.Segmenter === 'function' ? intl.Segmenter : null;
}

/**
 * True when the platform can do dictionary-based word segmentation. Drives the
 * parser selection in `parserFor`: when false, CJK uses the character parser.
 */
export function hasIntlSegmenter(): boolean {
  return segmenterCtor() !== null;
}

/** Build a word-granularity segmenter for a locale, tolerating unknown tags. */
function makeSegmenter(locale: string | undefined): SegmenterLike | null {
  const Ctor = segmenterCtor();
  if (!Ctor) {
    return null;
  }
  try {
    return new Ctor(locale, { granularity: 'word' });
  } catch {
    // Unknown/unsupported locale tag — fall back to the engine default locale,
    // which still applies the ICU CJK word dictionary (it is script-driven).
    try {
      return new Ctor(undefined, { granularity: 'word' });
    } catch {
      return null;
    }
  }
}

/**
 * The Intl.Segmenter CJK tokenizer. `parserFor` only routes here when
 * `hasIntlSegmenter()` is true; the in-parse guard below covers direct misuse.
 */
export const segmenterParser: Parser = {
  type: 'segmenter',
  parse(text: string, config: ParserConfig): ParserResult {
    const segmenter = makeSegmenter(config.languageCode);
    if (!segmenter) {
      // Defensive: degrade to a no-token single-sentence result rather than
      // throw. Callers go through `parserFor`, which avoids this path.
      return { sentences: [text], tokens: [] };
    }

    // "Contains a word character" / "contains a sentence-ending mark", using
    // the language's own classes so per-language config (which scripts count as
    // words, which marks end a sentence) is honoured — matching the character
    // parser. Embedded ASCII digits/Latin in CJK text are thus treated as
    // non-words exactly as the character parser treats them.
    const wordRe = new RegExp(
      '[' + normalizeClassFragment(config.regexpWordCharacters) + ']',
      'u'
    );
    const splitRe = new RegExp(
      '[' + normalizeClassFragment(config.regexpSplitSentences) + ']',
      'u'
    );

    const sentences: string[] = [];
    const tokens: Token[] = [];
    let sentenceIndex = 0;
    let order = 0;
    let parts: string[] = [];

    const push = (segment: string, isWord: boolean): void => {
      parts.push(segment);
      tokens.push({
        text: segment,
        sentenceIndex,
        order,
        isWord,
        wordCount: isWord ? 1 : 0,
      });
      order++;
    };
    const endSentence = (): void => {
      sentences.push(parts.join(''));
      parts = [];
      sentenceIndex++;
      order = 0;
    };

    for (const { segment, isWordLike } of segmenter.segment(text)) {
      // Paragraph/line break ends the current sentence (mirrors the character
      // parser): the newline itself is not emitted as a token.
      if (/[\n\r]/u.test(segment)) {
        if (parts.length > 0) {
          endSentence();
        }
        continue;
      }
      // A dictionary word: keep multi-character segments whole — that is the
      // whole point (「学習」 is one term, not two single-character terms).
      if (isWordLike && wordRe.test(segment)) {
        push(segment, true);
        continue;
      }
      // Whitespace run: dropped for CJK (removeSpaces), else kept as a non-word.
      if (/^\s+$/u.test(segment)) {
        if (config.removeSpaces) {
          continue;
        }
        push(segment, false);
        continue;
      }
      // Punctuation / symbols / other non-word runs.
      push(segment, false);
      if (splitRe.test(segment)) {
        endSentence();
      }
    }

    if (parts.length > 0) {
      endSentence();
    }
    if (sentences.length === 0) {
      sentences.push('');
    }

    return { sentences, tokens };
  },
};
