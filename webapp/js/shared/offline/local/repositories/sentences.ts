/**
 * Example-sentence repository — serves `GET /api/v1/sentences-with-term` and
 * `GET /api/v1/sentences-with-term/{woid}` from the local DB so the term editor
 * can show example sentences with no server.
 *
 * Mirrors `SentenceService::formatSentence`: each result is a tuple
 * `[displayHtml, copyText]` — `[0]` highlights the term with `<b>…</b>` for
 * display, `[1]` wraps it in `{…}` for copying into the term's sentence field.
 * Like the server, results are de-duplicated, shortest-first, and capped.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalSentence } from '../schema';
import { escapeHtml } from '@shared/utils/html_utils';

/** Match the server's 20-sentence cap. */
const LIMIT = 20;

/** Escape a literal term for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format one sentence as `[displayHtml, copyText]`, or `null` when the term is
 * not present (so the caller drops it, like the server's `}`-presence check).
 *
 * `wordChars` is the language's word-character class; for space-separated
 * scripts the term is matched on word boundaries, while remove-spaces /
 * split-each-char languages use a loose substring match (boundaries don't
 * apply there).
 */
function formatSentence(
  text: string,
  termLc: string,
  wordChars: string,
  loose: boolean
): [string, string] | null {
  const term = escapeRegExp(termLc);
  let pattern: RegExp;
  try {
    pattern = loose
      ? new RegExp(`(${term})`, 'giu')
      : new RegExp(`(?<![${wordChars}])(${term})(?![${wordChars}])`, 'giu');
  } catch {
    // A malformed word-character class falls back to a plain substring match.
    pattern = new RegExp(`(${term})`, 'giu');
  }

  // The copy text keeps the raw sentence with the term wrapped in braces; if
  // nothing changed the term was not found, so this sentence is skipped.
  const copyText = text.replace(pattern, '{$1}');
  if (copyText === text) {
    return null;
  }
  // Highlight on the HTML-escaped sentence so user content can't inject markup.
  const displayHtml = escapeHtml(text).replace(pattern, '<b>$1</b>');
  return [displayHtml, copyText];
}

/**
 * Sentences in the language's texts that contain a term. When `wordId` is a
 * saved term it matches that term's occurrences; otherwise it matches the
 * lower-cased surface form (mirrors the server's `word_id = wid` vs surface
 * lookup).
 */
export async function getSentencesWithTerm(
  langId: number,
  termLc: string,
  wordId?: number
): Promise<[string, string][]> {
  const lang = await localDb.languages.get(langId);
  if (!lang) {
    return [];
  }

  const occurrences =
    wordId != null && wordId > 0
      ? await localDb.occurrences.where('woId').equals(wordId).toArray()
      : await localDb.occurrences
          .where('[langId+textLc]')
          .equals([langId, termLc])
          .and((o) => o.isWord)
          .toArray();

  const sentenceIds = [...new Set(occurrences.map((o) => o.sentenceId))];
  const sentences = (await localDb.sentences.bulkGet(sentenceIds))
    .filter((s): s is LocalSentence => s != null)
    // Shortest sentences first, like the server's `ORDER BY CHAR_LENGTH(text)`.
    .sort((a, b) => a.text.length - b.text.length);

  const wordChars = lang.regexpWordCharacters || 'a-zA-Z';
  const loose = lang.removeSpaces || lang.splitEachChar;
  const results: [string, string][] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    if (results.length >= LIMIT) {
      break;
    }
    const trimmed = sentence.text.trim();
    if (trimmed === '' || trimmed === '¶' || seen.has(sentence.text)) {
      continue;
    }
    seen.add(sentence.text);
    const formatted = formatSentence(sentence.text, termLc, wordChars, loose);
    if (formatted) {
      results.push(formatted);
    }
  }

  return results;
}
