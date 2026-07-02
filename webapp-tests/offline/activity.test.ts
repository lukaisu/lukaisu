/**
 * Tests the on-device activity streak: derived from word save/review and text
 * timestamps, mirroring the server's "consecutive days, current counts only if
 * today/yesterday" rule, and served through the local router (no server).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { localDb, type LocalWord, type LocalText } from '@shared/offline/local/schema';
import { setLocalFirst } from '@shared/offline/local/router';
import { getStreak } from '@shared/offline/local/repositories/activity';
import { apiGet } from '@shared/api/client';

/** Epoch ms for local noon, `offset` days from today (boundary-safe). */
function noon(offset: number): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

function word(suffix: string, statusChanged: number, created = statusChanged): LocalWord {
  return {
    langId: 1,
    text: 'w' + suffix,
    textLc: 'w' + suffix,
    lemma: '',
    lemmaLc: '',
    status: 1,
    translation: '',
    romanization: '',
    sentence: '',
    notes: '',
    wordCount: 0,
    created,
    statusChanged,
    stability: 0,
    difficulty: 0,
    due: statusChanged,
    lastReview: null,
    reps: 0,
    lapses: 0,
    fsrsState: 0,
    updatedAt: statusChanged,
    deletedAt: null,
  };
}

function text(createdAt: number): LocalText {
  return {
    langId: 1,
    title: 'T',
    text: 'hi',
    audioUri: null,
    sourceUri: null,
    position: 0,
    audioPosition: 0,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
  setLocalFirst(true);
});

afterAll(() => {
  setLocalFirst(false);
});

describe('activity streak (offline)', () => {
  it('is zero with no activity', async () => {
    expect(await getStreak()).toEqual({
      current_streak: 0,
      best_streak: 0,
      total_active_days: 0,
    });
  });

  it('counts consecutive days ending today', async () => {
    await localDb.words.bulkAdd([word('a', noon(0)), word('b', noon(-1)), word('c', noon(-2))]);
    expect(await getStreak()).toEqual({
      current_streak: 3,
      best_streak: 3,
      total_active_days: 3,
    });
  });

  it('still counts when the most recent activity was yesterday', async () => {
    await localDb.words.bulkAdd([word('a', noon(-1)), word('b', noon(-2))]);
    expect((await getStreak()).current_streak).toBe(2);
  });

  it('drops the current streak after a gap but keeps the best run', async () => {
    await localDb.words.bulkAdd([word('a', noon(-3)), word('b', noon(-4))]);
    const streak = await getStreak();
    expect(streak.current_streak).toBe(0); // most recent activity was 3 days ago
    expect(streak.best_streak).toBe(2);
  });

  it('counts a text created today as activity', async () => {
    await localDb.texts.add(text(noon(0)));
    expect((await getStreak()).current_streak).toBe(1);
  });

  it('serves /activity/streak through the local router', async () => {
    await localDb.words.bulkAdd([word('a', noon(0)), word('b', noon(-1))]);
    const res = await apiGet<{ current_streak: number }>('/activity/streak');
    expect(res.error).toBeUndefined();
    expect(res.data?.current_streak).toBe(2);
  });
});
