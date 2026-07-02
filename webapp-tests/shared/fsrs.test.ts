/**
 * FSRS scheduling adapter (issue #238, Phase 2).
 *
 * The algorithm itself is ts-fsrs (the reference implementation), so these
 * tests lock our *adapter* behaviour: new/grade/retrievability round-tripping,
 * grade ordering, day-based determinism, the status⇄stability seed inverse, and
 * the display-status buckets.
 */

import { describe, it, expect } from 'vitest';
import {
  GRADE,
  isValidGrade,
  newFsrsState,
  reviewFsrsState,
  retrievability,
  isDue,
  seedFromStatus,
  STATUS_SEED_STABILITY,
  type FsrsState,
} from '@shared/offline/local/fsrs';
import { statusFromStability } from '@shared/stores/statuses';

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed instant for determinism
const DAY = 86_400_000;
const dueDays = (s: FsrsState) => (s.due - T0) / DAY;

describe('fsrs adapter — new card', () => {
  it('creates an unreviewed card due immediately', () => {
    const c = newFsrsState(T0);
    expect(c.state).toBe(0); // New
    expect(c.stability).toBe(0);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.lastReview).toBeNull();
    expect(c.due).toBe(T0);
  });
});

describe('fsrs adapter — grading', () => {
  it('graduates a new card to Review with a positive interval', () => {
    for (const g of [GRADE.AGAIN, GRADE.HARD, GRADE.GOOD, GRADE.EASY] as const) {
      const { state, log } = reviewFsrsState(newFsrsState(T0), g, T0);
      expect(state.state).toBe(2); // Review (short-term steps disabled)
      expect(state.stability).toBeGreaterThan(0);
      expect(state.reps).toBe(1);
      expect(state.lastReview).toBe(T0);
      expect(state.due).toBeGreaterThan(T0);
      expect(log.grade).toBe(g);
      expect(log.reviewedAt).toBe(T0);
      expect(log.scheduledDays).toBeGreaterThanOrEqual(1);
    }
  });

  it('orders intervals Easy > Good >= Hard >= Again', () => {
    const fresh = () => newFsrsState(T0);
    const again = dueDays(reviewFsrsState(fresh(), GRADE.AGAIN, T0).state);
    const hard = dueDays(reviewFsrsState(fresh(), GRADE.HARD, T0).state);
    const good = dueDays(reviewFsrsState(fresh(), GRADE.GOOD, T0).state);
    const easy = dueDays(reviewFsrsState(fresh(), GRADE.EASY, T0).state);
    expect(easy).toBeGreaterThan(good);
    expect(good).toBeGreaterThanOrEqual(hard);
    expect(hard).toBeGreaterThanOrEqual(again);
  });

  it('is deterministic (fuzzing disabled)', () => {
    const a = reviewFsrsState(newFsrsState(T0), GRADE.GOOD, T0).state;
    const b = reviewFsrsState(newFsrsState(T0), GRADE.GOOD, T0).state;
    expect(a).toEqual(b);
  });

  it('counts a lapse when a learned card is forgotten', () => {
    const learned = reviewFsrsState(newFsrsState(T0), GRADE.GOOD, T0).state;
    const reviewAt = learned.due; // grade it again on its due date
    const lapsed = reviewFsrsState(learned, GRADE.AGAIN, reviewAt).state;
    expect(lapsed.reps).toBe(2);
    expect(lapsed.lapses).toBe(1);
  });
});

describe('fsrs adapter — retrievability', () => {
  it('is ~1 right after review and ~0.9 (target) at the due date', () => {
    const c = reviewFsrsState(newFsrsState(T0), GRADE.GOOD, T0).state;
    expect(retrievability(c, T0)).toBeCloseTo(1, 5);
    expect(retrievability(c, c.due)).toBeGreaterThan(0.87);
    expect(retrievability(c, c.due)).toBeLessThan(0.94);
  });

  it('decreases over time', () => {
    const c = reviewFsrsState(newFsrsState(T0), GRADE.EASY, T0).state;
    const early = retrievability(c, T0 + DAY);
    const late = retrievability(c, T0 + 30 * DAY);
    expect(late).toBeLessThan(early);
  });
});

describe('fsrs adapter — due check', () => {
  it('is due when due_at has passed', () => {
    const c = newFsrsState(T0);
    expect(isDue(c, T0)).toBe(true);
    expect(isDue({ ...c, due: T0 + DAY }, T0)).toBe(false);
    expect(isDue({ ...c, due: T0 - DAY }, T0)).toBe(true);
  });
});

describe('fsrs adapter — status seeding', () => {
  it('seeds each learning status so the derived status round-trips', () => {
    for (const status of [1, 2, 3, 4, 5]) {
      const seeded = seedFromStatus(status, T0);
      expect(statusFromStability(seeded.stability)).toBe(status);
      expect(seeded.state).toBe(2); // Review
      expect(seeded.lastReview).toBe(T0);
      expect(seeded.reps).toBe(1);
      expect(seeded.due).toBeGreaterThan(T0);
    }
  });

  it('exposes the seed stabilities for the SQL migration to mirror', () => {
    expect(STATUS_SEED_STABILITY).toEqual({ 1: 0.5, 2: 3, 3: 15, 4: 60, 5: 120 });
  });
});

describe('statusFromStability — buckets', () => {
  it('maps stability to the 1-5 display tiers', () => {
    expect(statusFromStability(0)).toBe(1);
    expect(statusFromStability(0.5)).toBe(1);
    expect(statusFromStability(1)).toBe(2);
    expect(statusFromStability(6.9)).toBe(2);
    expect(statusFromStability(7)).toBe(3);
    expect(statusFromStability(29)).toBe(3);
    expect(statusFromStability(30)).toBe(4);
    expect(statusFromStability(89)).toBe(4);
    expect(statusFromStability(90)).toBe(5);
    expect(statusFromStability(365)).toBe(5);
  });
});

describe('isValidGrade', () => {
  it('accepts 1-4 only', () => {
    expect([1, 2, 3, 4].every(isValidGrade)).toBe(true);
    expect([0, 5, -1, 1.5].some(isValidGrade)).toBe(false);
  });
});
