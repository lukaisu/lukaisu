/**
 * Tests for the client-side coverage preview — the TS port of
 * `DifficultyEstimationService::analyzeTextSample`. Pure (text + known set in,
 * preview out), so no network or DB.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenizeSample,
  labelFromCoverage,
  computeCoverage,
} from '@shared/offline/local/content/coverage';

const LATIN = 'a-zA-Z';

describe('tokenizeSample', () => {
  it('splits alphabetic text on non-word runs', () => {
    expect(tokenizeSample('The cat sat on the mat.', LATIN, false)).toEqual([
      'The', 'cat', 'sat', 'on', 'the', 'mat',
    ]);
  });

  it('caps at maxWords', () => {
    expect(tokenizeSample('one two three four five', LATIN, false, 3)).toEqual([
      'one', 'two', 'three',
    ]);
  });

  it('emits one token per character when splitEachChar is set', () => {
    expect(tokenizeSample('abc', LATIN, true)).toEqual(['a', 'b', 'c']);
    expect(tokenizeSample('abcd', LATIN, true, 2)).toEqual(['a', 'b']);
  });
});

describe('labelFromCoverage', () => {
  it('maps >=95 to easy, >=85 to medium, else hard', () => {
    expect(labelFromCoverage(100)).toBe('easy');
    expect(labelFromCoverage(95)).toBe('easy');
    expect(labelFromCoverage(94.9)).toBe('medium');
    expect(labelFromCoverage(85)).toBe('medium');
    expect(labelFromCoverage(84.9)).toBe('hard');
    expect(labelFromCoverage(0)).toBe('hard');
  });
});

describe('computeCoverage', () => {
  it('measures unique/known/coverage against the known set', () => {
    const known = new Set(['the', 'cat']);
    const result = computeCoverage('the cat sat the cat', known, LATIN, false);
    expect(result).not.toBeNull();
    expect(result!.total_unique_words).toBe(3); // the, cat, sat
    expect(result!.known_words).toBe(2);
    expect(result!.unknown_words).toBe(1);
    expect(result!.coverage_percent).toBe(66.7); // 2/3, rounded to 1 dp
    expect(result!.difficulty_label).toBe('hard');
    expect(result!.sample_unknown_words).toEqual(['sat']);
  });

  it('reports full coverage when every word is known', () => {
    const result = computeCoverage('alpha beta alpha', new Set(['alpha', 'beta']), LATIN, false);
    expect(result!.coverage_percent).toBe(100);
    expect(result!.difficulty_label).toBe('easy');
    expect(result!.sample_unknown_words).toEqual([]);
  });

  it('extrapolates the total word count (short text: sampled in full)', () => {
    // Below the 2000-word sample cap, so the whole text is sampled and the
    // length ratio is 1 — the extrapolated total equals the actual count.
    const text = 'aa bb cc dd ee ff gg hh ii jj';
    const result = computeCoverage(text, new Set(), LATIN, false);
    expect(result!.total_words).toBe(10);
  });

  it('returns null when no words can be extracted', () => {
    expect(computeCoverage('....', new Set(), LATIN, false)).toBeNull();
  });
});
