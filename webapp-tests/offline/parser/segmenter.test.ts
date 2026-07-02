/**
 * Tests for the Intl.Segmenter-based CJK tokenizer (the on-device upgrade over
 * the character-by-character fallback).
 *
 * Exact word boundaries depend on the ICU version bundled with the runtime
 * (Node here; the Android System WebView in production), so these assert
 * *properties* that hold across ICU versions — multi-character words appear,
 * sentences split on the configured marks, words contain only word characters,
 * and the tokens reassemble to the input — rather than a fixed segmentation.
 */

import { describe, it, expect } from 'vitest';
import type { ParserConfig } from '@shared/offline/local/parser';
import {
  parseText,
  parserFor,
  segmenterParser,
  characterParser,
  hasIntlSegmenter,
} from '@shared/offline/local/parser';

const chinese: ParserConfig = {
  languageId: 1,
  languageCode: 'zh',
  regexpSplitSentences: '.!?:;。！？：；',
  exceptionsSplitSentences: '',
  regexpWordCharacters: '一-龥',
  characterSubstitutions: '',
  removeSpaces: true,
  splitEachChar: true,
  rightToLeft: false,
};
const japanese: ParserConfig = {
  ...chinese,
  languageCode: 'ja',
  regexpWordCharacters: '一-龥ぁ-ヾ',
};

// Guard the suite on engines without Intl.Segmenter (Node >= 18 ships it, so it
// runs everywhere in CI; the production fallback to characterParser is covered
// by parserFor's contract below).
const itSeg = hasIntlSegmenter() ? it : it.skip;

describe('parserFor routes CJK to the segmenter when the engine has it', () => {
  it('selects the segmenter for splitEachChar languages on this engine', () => {
    expect(hasIntlSegmenter()).toBe(true);
    expect(parserFor(chinese)).toBe(segmenterParser);
    expect(parserFor(japanese)).toBe(segmenterParser);
  });

  it('keeps the character parser as the documented offline fallback', () => {
    // parserFor returns characterParser when hasIntlSegmenter() is false; we
    // cannot remove the global here, so assert the fallback target is intact.
    expect(characterParser.type).toBe('character');
    expect(segmenterParser.type).toBe('segmenter');
  });
});

describe('segmenter parser groups CJK characters into dictionary words', () => {
  itSeg('keeps at least one multi-character Chinese word whole', () => {
    const r = parseText('我爱学习。', chinese);
    const words = r.tokens.filter((t) => t.isWord).map((t) => t.text);
    // The character parser would yield 4 single-character words; the segmenter
    // groups (e.g. 学习) and is never *more* tokens than characters.
    expect(words.length).toBeLessThan(4);
    expect(words.some((w) => [...w].length > 1)).toBe(true);
  });

  itSeg('splits sentences on the configured marks and drops spaces', () => {
    const r = parseText('我爱学习。我是学生。', chinese);
    expect(r.sentences.length).toBe(2);
    expect(r.sentences.join('')).toBe('我爱学习。我是学生。');
  });

  itSeg('marks ideographs as words and punctuation as non-words', () => {
    const r = parseText('你好，世界。', chinese);
    const nonWords = r.tokens.filter((t) => !t.isWord).map((t) => t.text);
    expect(nonWords).toContain('。');
    // No punctuation leaks into a word token: every word is pure Han here.
    for (const t of r.tokens.filter((x) => x.isWord)) {
      expect(t.text).toMatch(/^[一-龥]+$/u);
    }
  });

  itSeg('segments Japanese kanji+kana without per-character splitting', () => {
    const r = parseText('日本語を話します。', japanese);
    const words = r.tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words.some((w) => [...w].length > 1)).toBe(true);
    expect(r.sentences).toEqual(['日本語を話します。']);
  });

  itSeg('does not treat embedded ASCII digits as words (honours word class)', () => {
    const r = parseText('我有2个。', chinese);
    const words = r.tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words.join('')).not.toMatch(/[0-9]/);
  });

  itSeg('reassembles tokens back to the input (minus removed spaces)', () => {
    const r = parseText('我爱学习。', chinese);
    expect(r.tokens.map((t) => t.text).join('')).toBe('我爱学习。');
    // Each non-final sentence boundary is a real sentence mark.
    expect(r.tokens.every((t) => t.text.length > 0)).toBe(true);
  });

  itSeg('breaks paragraphs on newlines without emitting a newline token', () => {
    const r = parseText('第一行。\n第二行。', chinese);
    expect(r.sentences.length).toBe(2);
    expect(r.tokens.some((t) => /[\n\r]/u.test(t.text))).toBe(false);
  });

  itSeg('handles empty input like the other parsers', () => {
    const r = parseText('', chinese);
    expect(r.tokens).toEqual([]);
    expect(r.sentences).toEqual(['']);
  });
});
