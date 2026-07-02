/**
 * Server-enhanced tokenization client.
 *
 * For languages whose on-device tokenizer is coarse, re-parse the text with a
 * server-side tokenizer (Korean → Kiwi morphemes, vs. the on-device eojeol-level
 * regex parser) and adapt the result back into the local `ParserResult` the
 * reader consumes. Calls the standalone NLP edge directly (see `endpoint.ts`),
 * gated on its `/capabilities`, so it never POSTs to a server without a parser.
 *
 * An *enhancement, never a dependency*: any failure (no server, offline,
 * timeout, malformed or untrustworthy response) returns null so the caller
 * keeps the on-device parse. The text is always readable offline.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import type { ParserResult, Token } from '@shared/offline/local/parser';
import { nlpUrl, nlpCapable } from './endpoint';

/** Map a language code to the server tokenizer that improves on the on-device
 * one, or null when on-device is already adequate. Korean only for now; add
 * `ja → mecab` / `zh → jieba` here to extend (their on-device path is the
 * Intl.Segmenter parser). */
export function serverParserFor(languageCode: string): 'kiwi' | null {
  return languageCode.slice(0, 2).toLowerCase() === 'ko' ? 'kiwi' : null;
}

/** Generous: text import is a deliberate action, but a hung server must not
 * stall it forever — fall back to the on-device parse instead. */
const DEFAULT_TIMEOUT_MS = 8000;

/** The NLP service shape; a PHP `/api/v1` proxy may wrap it under `data`. */
interface ServerToken {
  text: string;
  is_word: boolean;
  reading?: string | null;
}
interface ServerParseResult {
  sentences: string[];
  tokens: ServerToken[];
}
interface ParseResponse {
  sentences?: string[];
  tokens?: ServerToken[];
  data?: ServerParseResult;
}

/**
 * Adapt a server `{ sentences, flat tokens }` result into a local
 * `ParserResult`. The server emits tokens in reading order without a
 * per-token sentence index, so assign one by consuming token text until it
 * reconstructs each sentence string. Returns null if the tokens do not
 * reconstruct the sentences exactly (or any are left over) — the caller then
 * keeps the trustworthy on-device parse rather than render misaligned tokens.
 */
export function adaptParse(server: ServerParseResult): ParserResult | null {
  const { sentences, tokens } = server;
  if (!Array.isArray(sentences) || !Array.isArray(tokens) || tokens.length === 0) {
    return null;
  }

  const out: Token[] = [];
  let ti = 0;
  for (let si = 0; si < sentences.length; si++) {
    const target = sentences[si] ?? '';
    let acc = '';
    let order = 0;
    while (ti < tokens.length && acc.length < target.length) {
      const t = tokens[ti];
      acc += t.text;
      out.push({
        text: t.text,
        sentenceIndex: si,
        order,
        isWord: !!t.is_word,
        wordCount: t.is_word ? 1 : 0,
      });
      order += 1;
      ti += 1;
    }
    if (acc !== target) {
      return null; // reconstruction mismatch — don't trust this parse
    }
  }
  if (ti !== tokens.length) {
    return null; // tokens left unassigned — don't trust this parse
  }

  return { sentences, tokens: out };
}

/**
 * Re-parse `text` with a server tokenizer. Returns a local `ParserResult`, or
 * null on no-server / offline / timeout / error / untrustworthy response so the
 * caller falls back to the on-device parser. Never throws.
 */
export async function remoteParse(
  text: string,
  parser: 'kiwi' | 'mecab' | 'jieba',
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ParserResult | null> {
  if (text.trim() === '' || !(await nlpCapable('parse'))) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(nlpUrl('/parse/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parser }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as ParseResponse;
    const server =
      body.data ??
      (body.sentences && body.tokens
        ? { sentences: body.sentences, tokens: body.tokens }
        : null);
    return server ? adaptParse(server) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
