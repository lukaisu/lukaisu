/**
 * Sentence-end heuristic — a faithful port of
 * `TextParsingService::findLatinSentenceEnd()` from the server.
 *
 * Given the capture groups of the sentence-candidate regex (see
 * `regex-parser.ts`), decide whether a punctuation mark really ends a sentence.
 * It rejects common false positives: decimals (`3.14`), initials (`A.`),
 * abbreviations of all-consonant words (`Mr.`, `Dr.`), a lower-case word
 * following `.`/`:`, and any caller-supplied exception pattern.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * @param groups   The regex match `[full, g1, g2, g3, g4, g5, g6, g7]`, where
 *                  g1 = word before the mark, g2 = the mark (`.+` or split
 *                  char), g3 = the dot-run (if any), g5 = trailing closers,
 *                  g6 = whitespace after, g7 = next token (or end).
 * @param noSentenceEnd Pipe-separated exception patterns (`Mr.|Dr.`), or ''.
 * @returns The matched text, with a `\t` inserted after dots in some abbrev
 *          cases and a trailing `\r` when this IS a sentence end.
 */
export function findLatinSentenceEnd(
  groups: (string | undefined)[],
  noSentenceEnd: string
): string {
  const full = groups[0] ?? '';
  const g1 = groups[1] ?? '';
  const g2 = groups[2] ?? '';
  const g3 = groups[3] ?? '';
  const g6 = groups[6] ?? '';
  const g7 = groups[7] ?? '';

  // No whitespace before the next token, but there IS a next token, and the
  // word before ends in an alphanumeric: treat dots as intra-word (abbrev.).
  if (g6.length === 0 && g7.length > 0 && /[a-zA-Z0-9]/.test(g1.slice(-1))) {
    return full.replace(/[.]/g, '.\t');
  }

  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(g1) && g1 !== '') {
    // Short numbers (e.g. "12.") are not sentence ends; long ones may be.
    if (g1.length < 3) {
      return full;
    }
  } else if (
    g3 &&
    (/^[B-DF-HJ-NP-TV-XZb-df-hj-np-tv-xzñ]*$/u.test(g1) ||
      /^[AEIOUY]$/.test(g1))
  ) {
    // All-consonant token before a dot (abbreviation) or a single uppercase
    // vowel (initial): not a sentence end.
    return full;
  }

  if (/[.:]/.test(g2) && /^[a-z]/.test(g7)) {
    // ". word" / ": word" with a lower-case next word: not a sentence end.
    return full;
  }

  if (noSentenceEnd !== '' && new RegExp('^(' + noSentenceEnd + ')$').test(full)) {
    return full;
  }

  return full + '\r';
}
