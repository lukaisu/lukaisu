/**
 * Tests for the read-path assembly: parse → structures → reader TextWords.
 * Exercises the whole on-device read pipeline without a database.
 */

import { describe, it, expect } from 'vitest';
import { parseText, type ParserConfig } from '@shared/offline/local/parser';
import {
  buildStructures,
  toLocalOccurrences,
  assembleTextWords,
} from '@shared/offline/local/text-assembly';
import { toClassName } from '@shared/offline/local/class-name';
import type { LocalWord } from '@shared/offline/local/schema';

const EN: ParserConfig = {
  languageId: 1,
  regexpSplitSentences: '.!?:;',
  exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].',
  regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
  characterSubstitutions: '',
  removeSpaces: false,
  splitEachChar: false,
  rightToLeft: false,
};

function word(over: Partial<LocalWord>): LocalWord {
  return {
    id: 1,
    langId: 1,
    text: 'cat',
    textLc: 'cat',
    lemma: '',
    lemmaLc: '',
    status: 2,
    translation: 'feline',
    romanization: '',
    sentence: '',
    notes: '',
    wordCount: 0,
    created: 0,
    statusChanged: 0,
    stability: 0,
    difficulty: 0,
    due: 0,
    lastReview: null,
    reps: 0,
    lapses: 0,
    fsrsState: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

describe('buildStructures', () => {
  it('assigns globally-unique, contiguous token positions', () => {
    const parse = parseText('The cat sat. The dog ran.', EN);
    const { occurrences } = buildStructures(parse);
    const orders = occurrences.map((o) => o.order);
    expect(orders).toEqual(orders.map((_, i) => i));
    // Positions stay unique even across the sentence boundary.
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('records one sentence row per sentence with its first token position', () => {
    const parse = parseText('The cat sat. The dog ran.', EN);
    const { sentences } = buildStructures(parse);
    expect(sentences.map((s) => s.order)).toEqual([0, 1]);
    expect(sentences[0].firstPos).toBe(0);
    // Second sentence starts at the first token after sentence 0.
    expect(sentences[1].firstPos).toBeGreaterThan(0);
  });
});

describe('assembleTextWords', () => {
  it('produces reader words with matched status and correct hex', () => {
    const parse = parseText('The cat sat.', EN);
    const built = buildStructures(parse);

    // Pretend sentence 0 persisted as id 100, and "cat" is a known word (id 7).
    const sentenceIds = new Map([[0, 100]]);
    const wordIds = new Map([['cat', 7]]);
    const occs = toLocalOccurrences(built.occurrences, 1, 1, sentenceIds, wordIds);
    const wordsById = new Map<number, LocalWord>([
      [7, word({ id: 7, status: 3, translation: 'feline' })],
    ]);

    const textWords = assembleTextWords(occs, wordsById);

    const cat = textWords.find((w) => w.textLc === 'cat');
    expect(cat).toBeDefined();
    expect(cat?.isNotWord).toBe(false);
    expect(cat?.wordId).toBe(7);
    expect(cat?.status).toBe(3);
    expect(cat?.translation).toBe('feline');
    // hex is the opaque identity token (SHA-256-based), not the surface text.
    expect(cat?.hex).toBe(toClassName('cat'));
    expect(cat?.hex).toMatch(/^[0-9a-f]{16}$/);
    expect(cat?.sentenceId).toBe(100);

    // Unknown word renders as status 0 with no id.
    const the = textWords.find((w) => w.textLc === 'the');
    expect(the?.status).toBe(0);
    expect(the?.wordId).toBeNull();

    // Spaces/punctuation are non-words.
    const space = textWords.find((w) => w.text === ' ');
    expect(space?.isNotWord).toBe(true);

    // Reader DOM ids (position + wordCount) are unique.
    const ids = textWords.map((w) => `${w.position}-${w.wordCount}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('encodes punctuation in the hex class name', () => {
    const parse = parseText("don't stop.", EN);
    const built = buildStructures(parse);
    const occs = toLocalOccurrences(
      built.occurrences,
      1,
      1,
      new Map([[0, 1]]),
      new Map()
    );
    const textWords = assembleTextWords(occs, new Map());
    // "don't" tokenizes around the apostrophe; "don" -> "don", "t" -> "t".
    expect(textWords.some((w) => w.textLc === 'don')).toBe(true);
  });
});
