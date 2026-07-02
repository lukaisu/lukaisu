/**
 * Shared helpers for the local repositories: word construction, score
 * maintenance, and occurrence (un)linking.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalLanguage, type LocalWord } from '../schema';
import { fsrsForStatus, type FsrsState, type FsrsLogEntry } from '../fsrs';
import { statusFromStability } from '@shared/stores/statuses';
import type { ParserConfig } from '../parser';

/** Map a stored language to the tokenizer configuration. */
export function languageToParserConfig(language: LocalLanguage): ParserConfig {
  return {
    languageId: language.id ?? 0,
    languageCode: language.code,
    regexpSplitSentences: language.regexpSplitSentences,
    exceptionsSplitSentences: language.exceptionsSplitSentences,
    regexpWordCharacters: language.regexpWordCharacters,
    characterSubstitutions: language.characterSubstitutions,
    removeSpaces: language.removeSpaces,
    splitEachChar: language.splitEachChar,
    rightToLeft: language.rightToLeft,
  };
}

/** Current time as epoch ms (single call site eases testing/mocking). */
export function nowMs(): number {
  return Date.now();
}

/** Fields a caller may supply when creating/updating a word. */
export interface WordFields {
  translation?: string;
  romanization?: string;
  sentence?: string;
  notes?: string;
  lemma?: string;
  wordCount?: number;
}

/**
 * Build a `LocalWord` row for insertion, computing the review scores from the
 * status and the current time.
 */
export function buildWordRow(
  langId: number,
  text: string,
  status: number,
  fields: WordFields = {}
): LocalWord {
  const now = nowMs();
  const lemma = fields.lemma ?? '';
  const fsrs = fsrsForStatus(status, now);
  return {
    langId,
    text,
    textLc: text.toLowerCase(),
    lemma,
    lemmaLc: lemma.toLowerCase(),
    status,
    translation: fields.translation ?? '',
    romanization: fields.romanization ?? '',
    sentence: fields.sentence ?? '',
    notes: fields.notes ?? '',
    wordCount: fields.wordCount ?? 0,
    created: now,
    statusChanged: now,
    stability: fsrs.stability,
    difficulty: fsrs.difficulty,
    due: fsrs.due,
    lastReview: fsrs.lastReview,
    reps: fsrs.reps,
    lapses: fsrs.lapses,
    fsrsState: fsrs.state,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Point every matching occurrence (same language + lower-cased term) at a word
 * so the reader reflects its status. Only word tokens are linked.
 */
export async function linkWordOccurrences(
  woId: number,
  langId: number,
  textLc: string
): Promise<void> {
  await localDb.occurrences
    .where('[langId+textLc]')
    .equals([langId, textLc])
    .and((o) => o.isWord)
    .modify({ woId });
}

/** Detach a word from all occurrences (used on delete). */
export async function unlinkWordOccurrences(woId: number): Promise<void> {
  await localDb.occurrences.where('woId').equals(woId).modify({ woId: null });
}

/**
 * Update a word's status and refresh its review scores + change timestamp.
 * Returns the new status, or null if the word is gone.
 */
export async function applyStatus(
  woId: number,
  newStatus: number
): Promise<number | null> {
  const word = await localDb.words.get(woId);
  if (!word) {
    return null;
  }
  const now = nowMs();
  const fsrs = fsrsForStatus(newStatus, now);
  await localDb.words.update(woId, {
    status: newStatus,
    statusChanged: now,
    stability: fsrs.stability,
    difficulty: fsrs.difficulty,
    due: fsrs.due,
    lastReview: fsrs.lastReview,
    reps: fsrs.reps,
    lapses: fsrs.lapses,
    fsrsState: fsrs.state,
    updatedAt: now,
  });
  return newStatus;
}

/**
 * Persist a graded review. The client (`../fsrs.ts`) computes the updated card;
 * this only stores it: it writes the FSRS fields, re-derives the display status
 * from the new stability, and appends a `reviewLog` row. Returns the new status
 * and due, or null if the word is gone.
 */
export async function persistGrade(
  woId: number,
  card: FsrsState,
  log: FsrsLogEntry
): Promise<{ status: number; due: number } | null> {
  const word = await localDb.words.get(woId);
  if (!word) {
    return null;
  }
  const now = nowMs();
  const status = statusFromStability(card.stability);
  await localDb.words.update(woId, {
    status,
    statusChanged: status !== word.status ? now : word.statusChanged,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    lastReview: card.lastReview,
    reps: card.reps,
    lapses: card.lapses,
    fsrsState: card.state,
    updatedAt: now,
  });
  await localDb.reviewLog.add({
    woId,
    grade: log.grade,
    fsrsState: log.state,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsedDays,
    scheduledDays: log.scheduledDays,
    reviewedAt: log.reviewedAt,
  });
  return { status, due: card.due };
}

/** Look up an active word by language + lower-cased term, if any. */
export async function findWord(
  langId: number,
  textLc: string
): Promise<LocalWord | undefined> {
  const word = await localDb.words.where('[textLc+langId]').equals([textLc, langId]).first();
  return word && word.deletedAt == null ? word : undefined;
}
