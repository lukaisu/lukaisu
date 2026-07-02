/**
 * FSRS review-scheduling adapter.
 *
 * Thin wrapper over **ts-fsrs** (the official Free Spaced Repetition Scheduler,
 * MIT-licensed). This is the *single* copy of the scheduling algorithm in the
 * codebase: it runs on-device when offline and in the browser client when a
 * server is connected. The PHP server only stores the resulting card fields
 * (`stability`, `difficulty`, `due_at`, …) and selects due rows — it never runs
 * the algorithm. So scheduling logic lives here, once.
 *
 * We persist a compact {@link FsrsState} per word: the subset of a ts-fsrs
 * `Card` needed to schedule the next review. It maps 1:1 onto the `words` FSRS
 * columns and the on-device `LocalWord` fields.
 *
 * Intervals are **whole days**: short-term (minute-level) learning steps are
 * disabled (`enable_short_term: false`), matching the day-based model the old
 * Leitner system used and keeping `due` predictable across the offline/online
 * seam. Fuzzing is off so the same review always yields the same due date.
 *
 * @license Unlicense (this file); depends on ts-fsrs (MIT).
 */

import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  State,
  type Card as FsrsCard,
  type CardInput,
  type Grade,
} from 'ts-fsrs';

/** Review grades — ts-fsrs `Rating` without `Manual`. 1=Again … 4=Easy. */
export const GRADE = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
} as const;

/** A review grade: 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type ReviewGrade = 1 | 2 | 3 | 4;

/** True for a valid 1-4 review grade. */
export function isValidGrade(grade: number): grade is ReviewGrade {
  return grade === 1 || grade === 2 || grade === 3 || grade === 4;
}

/**
 * FSRS memory state persisted per word. Mirrors the `words` FSRS columns
 * (`stability`, `difficulty`, `due_at`, `last_reviewed_at`, `reps`, `lapses`,
 * `fsrs_state`) and the on-device `LocalWord` fields.
 */
export interface FsrsState {
  /** Memory stability in days (days for retrievability to fall to 90%). */
  stability: number;
  /** Item difficulty, ~1-10. */
  difficulty: number;
  /** Next review due, epoch ms. */
  due: number;
  /** Last review, epoch ms, or null if never reviewed. */
  lastReview: number | null;
  /** Total reviews. */
  reps: number;
  /** Times forgotten (Again while in Review). */
  lapses: number;
  /** ts-fsrs state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
}

/** A review-log entry produced by a grade, for the `review_log` table. */
export interface FsrsLogEntry {
  grade: ReviewGrade;
  /** Card state at review time (ts-fsrs convention). */
  state: number;
  /** Resulting stability. */
  stability: number;
  /** Resulting difficulty. */
  difficulty: number;
  /** Days since the previous review. */
  elapsedDays: number;
  /** Scheduled interval in days. */
  scheduledDays: number;
  /** When the review happened, epoch ms. */
  reviewedAt: number;
}

const DAY_MS = 86_400_000;

/** The shared scheduler: FSRS-6 defaults, day-based, deterministic. */
const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: false,
  })
);

/**
 * Seed stability (days) per legacy learning status (1-5), chosen so
 * {@link import('@shared/stores/statuses').statusFromStability} maps each seed
 * back to its original status. **Keep in sync** with the SQL migration's `CASE`
 * and the buckets in `shared/stores/statuses.ts`.
 */
export const STATUS_SEED_STABILITY: Readonly<Record<number, number>> = {
  1: 0.5,
  2: 3,
  3: 15,
  4: 60,
  5: 120,
};

/** Mid-scale difficulty seeded for migrated/imported words; the first real review adjusts it. */
const SEED_DIFFICULTY = 5;

/** Rebuild a ts-fsrs card input from our persisted state. */
function toCardInput(s: FsrsState): CardInput {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ?? undefined,
  };
}

/** Extract our persisted state from a ts-fsrs card. */
function fromCard(c: FsrsCard): FsrsState {
  return {
    stability: c.stability,
    difficulty: c.difficulty,
    due: c.due.getTime(),
    lastReview: c.last_review ? c.last_review.getTime() : null,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
  };
}

/** A brand-new, unreviewed card (state New, stability 0, due immediately). */
export function newFsrsState(nowMs: number = Date.now()): FsrsState {
  return fromCard(createEmptyCard(new Date(nowMs)));
}

/**
 * Grade a card. Returns the updated state to persist and a log entry to append
 * to `review_log`.
 */
export function reviewFsrsState(
  prev: FsrsState,
  grade: ReviewGrade,
  nowMs: number = Date.now()
): { state: FsrsState; log: FsrsLogEntry } {
  const { card, log } = scheduler.next(toCardInput(prev), new Date(nowMs), grade as Grade);
  const elapsedDays =
    prev.lastReview === null ? 0 : Math.max(0, Math.floor((nowMs - prev.lastReview) / DAY_MS));
  return {
    state: fromCard(card),
    log: {
      grade,
      state: log.state, // card state at review time (pre-transition)
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays,
      scheduledDays: card.scheduled_days, // the newly scheduled interval, in days
      reviewedAt: nowMs,
    },
  };
}

/** Current recall probability (0-1) for a card at `nowMs`. */
export function retrievability(s: FsrsState, nowMs: number = Date.now()): number {
  return scheduler.get_retrievability(toCardInput(s), new Date(nowMs), false);
}

/** Whether the card is due for review at `nowMs`. */
export function isDue(s: FsrsState, nowMs: number = Date.now()): boolean {
  return s.due <= nowMs;
}

/**
 * Seed FSRS state from a legacy learning status (1-5) and when that status was
 * set. Used by the on-device Dexie upgrade and the server import/migration
 * backfill; the seed is chosen so the *derived* display status equals the
 * original status immediately after seeding. Mirrors the SQL migration `CASE`.
 */
export function seedFromStatus(status: number, statusChangedMs: number): FsrsState {
  const stability = STATUS_SEED_STABILITY[status] ?? STATUS_SEED_STABILITY[1];
  const intervalDays = Math.max(1, Math.round(stability));
  return {
    stability,
    difficulty: SEED_DIFFICULTY,
    due: statusChangedMs + intervalDays * DAY_MS,
    lastReview: statusChangedMs,
    reps: 1,
    lapses: 0,
    state: State.Review,
  };
}

/** FSRS state for a word taken out of scheduling (ignored 98 / well-known 99). */
export function unscheduledFsrsState(nowMs: number = Date.now()): FsrsState {
  return {
    stability: 0,
    difficulty: 0,
    due: nowMs,
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: State.New,
  };
}

/**
 * FSRS state to persist when a status is set *directly* (reading-view "start
 * Learning", import, bulk edit) rather than by grading a review:
 *
 * - `1` → a fresh New card, due immediately (a brand-new learning word);
 * - `2`-`5` → {@link seedFromStatus} so the derived status matches;
 * - `98`/`99` → unscheduled.
 */
export function fsrsForStatus(status: number, nowMs: number = Date.now()): FsrsState {
  if (status === 1) {
    return newFsrsState(nowMs);
  }
  if (status >= 2 && status <= 5) {
    return seedFromStatus(status, nowMs);
  }
  return unscheduledFsrsState(nowMs);
}
