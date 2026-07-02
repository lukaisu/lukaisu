/**
 * Small review/status helpers shared by the offline repositories.
 *
 * Spaced-repetition *scheduling* now lives in `./fsrs.ts` (ts-fsrs). The old
 * Leitner score model (`calculateScore`, `computeScoreFields`,
 * `today_score`/`tomorrow_score` mirrors) was removed in issue #238, Phase 2;
 * a word is due when its FSRS `due` has passed. Only the status predicates that
 * are still needed remain here.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Learning statuses that participate in review (1 = new … 5 = learned). */
export const MIN_LEARNING_STATUS = 1;
export const MAX_LEARNING_STATUS = 5;
/** Special statuses excluded from review. */
export const STATUS_IGNORED = 98;
export const STATUS_WELL_KNOWN = 99;

/** True if `status` is a learning status (1–5) that can appear in review. */
export function isLearningStatus(status: number): boolean {
  return status >= MIN_LEARNING_STATUS && status <= MAX_LEARNING_STATUS;
}

/** A word has a usable translation if it is neither empty nor the `*` stub. */
export function hasUsableTranslation(translation: string | null | undefined): boolean {
  return translation != null && translation !== '' && translation !== '*';
}

/**
 * New status one learning level up or down. Retained for the legacy ±1 status
 * controls until they are removed with the 1-5 picker (issue #238, Phase 2);
 * reviews now grade via FSRS instead. Special statuses (98/99) are unchanged.
 */
export function nextStatus(status: number, correct: boolean): number {
  if (!isLearningStatus(status)) {
    return status;
  }
  return correct
    ? Math.min(MAX_LEARNING_STATUS, status + 1)
    : Math.max(MIN_LEARNING_STATUS, status - 1);
}
