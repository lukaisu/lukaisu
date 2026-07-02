/**
 * Tests for the trimmed offline review helpers. The Leitner score model was
 * replaced by FSRS (issue #238, Phase 2) — scheduling is covered by
 * `tests/frontend/shared/fsrs.test.ts`; this only locks the status predicates
 * that remain.
 */

import { describe, it, expect } from 'vitest';
import {
  isLearningStatus,
  hasUsableTranslation,
  nextStatus,
} from '@shared/offline/local/review-scoring';

describe('review helpers', () => {
  it('classifies learning statuses', () => {
    expect(isLearningStatus(1)).toBe(true);
    expect(isLearningStatus(5)).toBe(true);
    expect(isLearningStatus(98)).toBe(false);
    expect(isLearningStatus(99)).toBe(false);
    expect(isLearningStatus(0)).toBe(false);
  });

  it('detects usable translations', () => {
    expect(hasUsableTranslation('cat')).toBe(true);
    expect(hasUsableTranslation('*')).toBe(false);
    expect(hasUsableTranslation('')).toBe(false);
    expect(hasUsableTranslation(null)).toBe(false);
    expect(hasUsableTranslation(undefined)).toBe(false);
  });

  it('advances and retreats status within bounds', () => {
    expect(nextStatus(1, true)).toBe(2);
    expect(nextStatus(5, true)).toBe(5);
    expect(nextStatus(3, false)).toBe(2);
    expect(nextStatus(1, false)).toBe(1);
    expect(nextStatus(99, true)).toBe(99);
  });
});
