/**
 * Difficulty estimation for catalog suggestions — a faithful TypeScript port of
 * the server's `DifficultyEstimationService`
 * (`src/Modules/Text/Application/Services/DifficultyEstimationService.php`).
 *
 * Two coarse signals drive the suggestion UI:
 *  - a difficulty *tier* (easy/medium/hard) from a book's subject keywords,
 *    shifted by how many words the reader already knows in that language;
 *  - a *beginner* flag (known-word count below a threshold) that orders the
 *    GDL easy-readers row before/after the Gutenberg row.
 *
 * The known-word count is supplied by the caller (computed from the on-device
 * vocabulary), so this module stays pure and unit-testable.
 *
 * @license Unlicense <http://unlicense.org/>
 */

export type DifficultyTier = 'easy' | 'medium' | 'hard';

/** Subject keywords that mark a book as easy (children's/graded readers). */
export const EASY_SUBJECTS: readonly string[] = [
  'children',
  'juvenile',
  'fairy tale',
  'nursery',
  'picture book',
  'fable',
  'primer',
  'easy reading',
];

/** Subject keywords that mark a book as hard (dense non-fiction). */
export const HARD_SUBJECTS: readonly string[] = [
  'philosophy',
  'science',
  'law',
  'economics',
  'political science',
  'mathematics',
  'psychology',
  'theology',
  'metaphysics',
  'logic',
  'jurisprudence',
  'historiography',
];

/** Readers below this many known words are treated as beginners. */
export const BEGINNER_VOCAB_THRESHOLD = 500;

/**
 * Classify a subject list into a difficulty tier by keyword match. Picks the
 * most favorable (easy) match: any easy keyword wins, else any hard keyword,
 * else medium. Mirrors `DifficultyEstimationService::classifySubjects`.
 */
export function classifySubjects(subjects: string[]): DifficultyTier {
  const joined = subjects.map((s) => s.toLowerCase()).join(' | ');
  for (const keyword of EASY_SUBJECTS) {
    if (joined.includes(keyword)) {
      return 'easy';
    }
  }
  for (const keyword of HARD_SUBJECTS) {
    if (joined.includes(keyword)) {
      return 'hard';
    }
  }
  return 'medium';
}

/**
 * Shift the subject tier by the reader's vocabulary size. Mirrors
 * `DifficultyEstimationService::computeQuickTier`:
 *   - 0 known words           -> always hard
 *   - < 500 known words       -> shift up   (easy->medium, else->hard)
 *   - > 2000 known words      -> shift down (hard->medium, else->easy)
 *   - 500..2000 known words   -> the subject tier unchanged
 */
export function computeQuickTier(knownCount: number, subjects: string[]): DifficultyTier {
  const subjectTier = classifySubjects(subjects);

  if (knownCount === 0) {
    return 'hard';
  }
  if (knownCount < 500) {
    return subjectTier === 'easy' ? 'medium' : 'hard';
  }
  if (knownCount > 2000) {
    return subjectTier === 'hard' ? 'medium' : 'easy';
  }
  return subjectTier;
}

/** Whether a known-word count marks the reader as a beginner. */
export function isBeginnerVocabulary(knownCount: number): boolean {
  return knownCount < BEGINNER_VOCAB_THRESHOLD;
}

const TIER_ORDER: Record<DifficultyTier, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * Stable-sort books easy-first (then medium, then hard), matching the order
 * `GutenbergSuggestionService::getSuggestions` applies to browse results.
 * Books without a tier are treated as medium. Returns a new array.
 */
export function sortByTier<T extends { difficultyTier?: DifficultyTier }>(books: T[]): T[] {
  return books
    .map((book, index) => ({ book, index }))
    .sort((a, b) => {
      const rankA = TIER_ORDER[a.book.difficultyTier ?? 'medium'];
      const rankB = TIER_ORDER[b.book.difficultyTier ?? 'medium'];
      return rankA !== rankB ? rankA - rankB : a.index - b.index;
    })
    .map((entry) => entry.book);
}
