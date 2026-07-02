/**
 * Activity repository — the on-device mirror of the PHP Activity module
 * (`src/Modules/Activity`). The server keeps an `activity_log`; offline we don't,
 * so "active days" are derived from the timestamps that already record learning
 * activity: a word saved or reviewed (`words.created` / `words.statusChanged`)
 * and a text created/pasted (`texts.createdAt`).
 *
 * `getStreak()` reproduces `GetStreakStatistics`: a streak is a run of
 * consecutive calendar days with any activity, and the current streak only
 * counts when the most recent active day is today or yesterday.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb } from '../schema';

/** Response shape of `GET /activity/streak` (mirrors `StreakResult::toArray`). */
export interface StreakResult {
  current_streak: number;
  best_streak: number;
  total_active_days: number;
}

/** Local calendar day key (YYYY-MM-DD) for an epoch-ms timestamp. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The day key `delta` days from `key`, computed in local time. */
function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day + delta).getTime());
}

/** Distinct calendar days with learning activity, most-recent first. */
async function activeDatesDescending(): Promise<string[]> {
  const days = new Set<string>();
  for (const word of await localDb.words.filter((w) => w.deletedAt == null).toArray()) {
    if (word.created) {
      days.add(dayKey(word.created));
    }
    if (word.statusChanged) {
      days.add(dayKey(word.statusChanged));
    }
  }
  for (const text of await localDb.texts.filter((t) => t.deletedAt == null).toArray()) {
    if (text.createdAt) {
      days.add(dayKey(text.createdAt));
    }
  }
  return [...days].sort().reverse();
}

/** Current/best streak + total active days, computed on-device. */
export async function getStreak(): Promise<StreakResult> {
  const dates = await activeDatesDescending();
  const total = dates.length;
  if (total === 0) {
    return { current_streak: 0, best_streak: 0, total_active_days: 0 };
  }

  // Best streak: longest run of consecutive days anywhere in the history.
  let best = 0;
  let run = 0;
  let expected: string | null = null;
  for (const date of dates) {
    if (expected === null || date === expected) {
      run = expected === null ? 1 : run + 1;
    } else {
      best = Math.max(best, run);
      run = 1;
    }
    expected = shiftDay(date, -1);
  }
  best = Math.max(best, run);

  // Current streak only counts when the most recent active day is today/yesterday.
  const today = dayKey(Date.now());
  const yesterday = shiftDay(today, -1);
  let current = 0;
  if (dates[0] === today || dates[0] === yesterday) {
    current = 1;
    let want = shiftDay(dates[0], -1);
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] !== want) {
        break;
      }
      current += 1;
      want = shiftDay(dates[i], -1);
    }
  }

  return { current_streak: current, best_streak: best, total_active_days: total };
}
