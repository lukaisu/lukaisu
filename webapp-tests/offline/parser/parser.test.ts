/**
 * Tests for the local-first tokenizer.
 *
 * Latin cases are asserted to match, byte-for-byte, fixtures generated from the
 * server's PHP `RegexParser` (see parser-fixtures.json) — this proves the
 * sentence-splitting heuristics (abbreviations, decimals, quotes, paragraphs)
 * were ported faithfully. RTL / CJK / numeric cases assert the *corrected*
 * behaviour, where the PHP reference is known to be buggy (see regex-parser.ts
 * and character-parser.ts headers).
 */

import { describe, it, expect } from 'vitest';
import fixtures from './parser-fixtures.json';
import {
  parseText,
  characterParser,
  type ParserConfig,
  type ParserResult,
} from '@shared/offline/local/parser';

type FixtureToken = { text: string; s: number; o: number; w: boolean };
type Fixture = {
  parser: string;
  text: string;
  result: { sentences: string[]; tokens: FixtureToken[] };
};
const F = fixtures as Record<string, Fixture>;

function cfg(over: Partial<ParserConfig>): ParserConfig {
  return {
    languageId: 1,
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '',
    regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
    characterSubstitutions: '',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    ...over,
  };
}

const CONFIGS: Record<string, ParserConfig> = {
  english_basic: cfg({ exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].' }),
  english_abbrev: cfg({ exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].' }),
  english_paragraphs: cfg({ exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].' }),
  english_quotes: cfg({ exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].' }),
  french_basic: cfg({ exceptionsSplitSentences: '[A-Z].|Dr.' }),
  german_basic: cfg({
    regexpWordCharacters: 'a-zA-ZäöüÄÖÜß',
    exceptionsSplitSentences: '[A-Z].|Dr.',
  }),
  hebrew_rtl: cfg({
    regexpWordCharacters: '\\u{0590}-\\u{05FF}',
    rightToLeft: true,
  }),
  chinese_char: cfg({
    regexpSplitSentences: '.!?:;。！？：；',
    regexpWordCharacters: '一-龥',
    removeSpaces: true,
    splitEachChar: true,
  }),
  japanese_char: cfg({
    regexpSplitSentences: '.!?:;。！？：；',
    regexpWordCharacters: '一-龥ぁ-ヾ',
    removeSpaces: true,
    splitEachChar: true,
  }),
  numbers_mixed: cfg({ exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].' }),
};

function asFixtureShape(r: ParserResult): {
  sentences: string[];
  tokens: FixtureToken[];
} {
  return {
    sentences: r.sentences,
    tokens: r.tokens.map((t) => ({
      text: t.text,
      s: t.sentenceIndex,
      o: t.order,
      w: t.isWord,
    })),
  };
}

describe('regex parser matches the PHP reference on Latin text', () => {
  const latin = [
    'english_basic',
    'english_abbrev',
    'english_paragraphs',
    'english_quotes',
    'french_basic',
    'german_basic',
  ];
  for (const name of latin) {
    it(name, () => {
      const r = parseText(F[name].text, CONFIGS[name]);
      expect(asFixtureShape(r)).toEqual(F[name].result);
    });
  }
});

describe('sentence splitting heuristics', () => {
  it('keeps abbreviations from ending a sentence', () => {
    const r = parseText('Mr. Smith met Dr. Jones. They left!', CONFIGS.english_abbrev);
    expect(r.sentences).toEqual(['Mr. Smith met Dr. Jones.', ' They left!']);
  });

  it('treats each terminal punctuation as its own sentence', () => {
    const r = parseText('One. Two? Three!', CONFIGS.english_basic);
    expect(r.sentences.length).toBe(3);
  });

  it('never marks a token containing whitespace as a word', () => {
    const r = parseText('Plenty of  spaces   here.', CONFIGS.english_basic);
    for (const t of r.tokens) {
      if (t.isWord) {
        expect(t.text).not.toMatch(/\s/);
      }
    }
  });
});

describe('right-to-left text (corrected vs PHP)', () => {
  it('splits Hebrew sentences identically to the reference', () => {
    const r = parseText(F.hebrew_rtl.text, CONFIGS.hebrew_rtl);
    expect(r.sentences).toEqual(F.hebrew_rtl.result.sentences);
  });

  it('marks Hebrew words as words (PHP wrongly marks them non-words)', () => {
    const r = parseText(F.hebrew_rtl.text, CONFIGS.hebrew_rtl);
    const words = r.tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words).toEqual(['שלום', 'עולם', 'מה', 'שלומך']);
  });
});

// The character parser is the CJK *fallback* (used when the engine lacks
// Intl.Segmenter). `parseText` now prefers the segmenter for splitEachChar
// languages, so exercise the fallback directly to keep its char-by-char
// behaviour covered. Substitutions are empty for these fixtures, so calling
// `parse` directly matches what `parseText` would feed it.
describe('character parser (CJK fallback)', () => {
  it('tokenizes Chinese one character per word with clean sentences', () => {
    const r = characterParser.parse(F.chinese_char.text, CONFIGS.chinese_char);
    expect(r.sentences).toEqual(['你好世界。', '我爱学习。']);
    expect(r.tokens.filter((t) => t.isWord).map((t) => t.text)).toEqual([
      '你', '好', '世', '界', '我', '爱', '学', '习',
    ]);
    expect(r.tokens.filter((t) => !t.isWord).map((t) => t.text)).toEqual(['。', '。']);
    // No empty tokens (a bug in the PHP CharacterParser).
    expect(r.tokens.every((t) => t.text.length > 0)).toBe(true);
  });

  it('keeps kana and kanji as words and punctuation as non-words', () => {
    const r = characterParser.parse(F.japanese_char.text, CONFIGS.japanese_char);
    expect(r.sentences).toEqual(['日本語を話します。', 'はい、少し。']);
    expect(r.tokens.filter((t) => !t.isWord).map((t) => t.text)).toEqual(['。', '、', '。']);
  });
});

describe('numbers (corrected vs PHP)', () => {
  it('keeps the same sentence as the reference', () => {
    const r = parseText(F.numbers_mixed.text, CONFIGS.numbers_mixed);
    expect(r.sentences).toEqual(F.numbers_mixed.result.sentences);
  });

  it('does not mark numeric runs (excluded from word chars) as words', () => {
    const r = parseText(F.numbers_mixed.text, CONFIGS.numbers_mixed);
    const words = r.tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words).toEqual(['I', 'have', 'apples', 'and', 'oranges']);
  });
});
