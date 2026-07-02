/**
 * Vocabulary-coverage preview — a faithful TS port of
 * `DifficultyEstimationService::analyzeTextSample`.
 *
 * Given a book's text and the reader's known words, it estimates how readable
 * the book is: tokenize a sample (up to {@link SAMPLE_WORD_COUNT} words),
 * extrapolate the total word count from the sample/full-text length ratio,
 * dedupe to unique lowercased words, and measure what fraction the reader
 * already knows. A coverage percentage maps to an easy/medium/hard label.
 *
 * Pure (no network, no DB): the caller supplies the fetched text and the set of
 * known lowercased words, so this stays unit-testable. Only the structured,
 * fixed-host catalog text (Gutenberg plain text) is fetched client-side;
 * arbitrary-URL coverage stays server-enhanced.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Max words sampled from the start of a text (matches the PHP constant). */
export const SAMPLE_WORD_COUNT = 2000;

/** The coverage analysis result (the server's `library-preview` shape). */
export interface CoveragePreview {
  total_words: number;
  total_unique_words: number;
  known_words: number;
  unknown_words: number;
  coverage_percent: number;
  difficulty_label: 'easy' | 'medium' | 'hard';
  sample_unknown_words: string[];
}

/**
 * Extract up to `maxWords` word tokens from the start of `text`, driven by the
 * language's word-character set. Mirrors `DifficultyEstimationService::tokenize`:
 * for CJK (`splitEachChar`) each matching character is a token; otherwise the
 * text is split on runs of non-word characters.
 */
export function tokenizeSample(
  text: string,
  wordChars: string,
  splitEachChar: boolean,
  maxWords: number = SAMPLE_WORD_COUNT
): string[] {
  const out: string[] = [];
  if (splitEachChar) {
    const re = new RegExp('[' + wordChars + ']', 'gu');
    for (const match of text.matchAll(re)) {
      out.push(match[0]);
      if (out.length >= maxWords) {
        break;
      }
    }
    return out;
  }

  const re = new RegExp('[^' + wordChars + ']+', 'gu');
  for (const token of text.split(re)) {
    if (token.length >= 1) {
      out.push(token);
      if (out.length >= maxWords) {
        break;
      }
    }
  }
  return out;
}

/** Map a coverage percentage to a tier: >=95 easy, >=85 medium, else hard. */
export function labelFromCoverage(percent: number): 'easy' | 'medium' | 'hard' {
  if (percent >= 95) {
    return 'easy';
  }
  if (percent >= 85) {
    return 'medium';
  }
  return 'hard';
}

/**
 * Compute the coverage preview from already-fetched text and the reader's known
 * (lowercased) words. Returns null when no words can be extracted.
 */
export function computeCoverage(
  text: string,
  knownLc: Set<string>,
  wordChars: string,
  splitEachChar: boolean
): CoveragePreview | null {
  const tokens = tokenizeSample(text, wordChars, splitEachChar);
  if (tokens.length === 0) {
    return null;
  }

  // Extrapolate the full word count from the sampled vs. total text length.
  const sampleLen = tokens.join(' ').length;
  const totalLen = text.length;
  const sampleCount = tokens.length;
  const totalWords =
    sampleLen > 0 ? Math.round(sampleCount * (totalLen / sampleLen)) : sampleCount;

  const unique = Array.from(new Set(tokens.map((t) => t.toLowerCase())));
  const totalUnique = unique.length;
  if (totalUnique === 0) {
    return null;
  }

  const known = unique.filter((w) => knownLc.has(w));
  const knownCount = known.length;
  const unknownWords = unique.filter((w) => !knownLc.has(w));
  // Round to one decimal, matching PHP round($pct, 1).
  const coveragePercent = Math.round((knownCount / totalUnique) * 1000) / 10;

  return {
    total_words: totalWords,
    total_unique_words: totalUnique,
    known_words: knownCount,
    unknown_words: totalUnique - knownCount,
    coverage_percent: coveragePercent,
    difficulty_label: labelFromCoverage(coveragePercent),
    sample_unknown_words: unknownWords.slice(0, 20),
  };
}
