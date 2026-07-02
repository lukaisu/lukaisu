/**
 * Server-enhanced lemmatization client.
 *
 * Reduces an inflected surface form to its dictionary headword via the optional
 * NLP edge, called directly (see `endpoint.ts`) and gated on its
 * `/capabilities`. Korean is routed to Kiwi (morphological analysis), every
 * other language to spaCy.
 *
 * This is an *enhancement, never a dependency*: every call fails soft (returns
 * null) on no-server / offline / timeout / error, so the on-device save path is
 * never blocked — matching the briefing's "the client must never block on the
 * server" rule.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { nlpUrl, nlpCapable } from './endpoint';

/** The two-letter base of a (possibly regioned) code, e.g. `ko-KR` -> `ko`. */
function baseCode(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase();
}

/**
 * Default lemmatizer backend for a language. Korean morphology is handled far
 * better by Kiwi than spaCy; everything else uses spaCy.
 */
export function lemmatizerFor(languageCode: string): 'kiwi' | 'spacy' {
  return baseCode(languageCode) === 'ko' ? 'kiwi' : 'spacy';
}

/** Default per-request timeout; a slow/absent server must not stall a save. */
const DEFAULT_TIMEOUT_MS = 1500;

/**
 * The NLP service returns `{ word, lemma }`; a PHP `/api/v1` proxy may wrap the
 * payload under `data`. Accept either shape.
 */
interface LemmaResponse {
  lemma?: string | null;
  data?: { lemma?: string | null };
}

/**
 * Look up the dictionary form of `word` for a language. Returns the lemma, or
 * null when there is no server, the request fails/times out, or the word is
 * already in base form. Never throws.
 */
export async function remoteLemmatize(
  word: string,
  languageCode: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  const term = word.trim();
  if (!term || !(await nlpCapable('lemmatize'))) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(nlpUrl('/lemmatize/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: term,
        language: baseCode(languageCode),
        lemmatizer: lemmatizerFor(languageCode),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as LemmaResponse;
    const lemma = body.lemma ?? body.data?.lemma ?? null;
    // Treat "already base form" (lemma == word) and empties as no suggestion.
    return lemma && lemma !== term ? lemma : null;
  } catch {
    // No server / offline / aborted / malformed JSON: skip the enhancement.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
