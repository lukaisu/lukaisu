/**
 * Regex parser — a faithful TypeScript port of the server's `RegexParser`
 * (`src/Modules/Language/Infrastructure/Parser/RegexParser.php`), for
 * space-separated and right-to-left languages.
 *
 * One deliberate, documented deviation: the word/non-word marker is driven by
 * the language's word-character class (`regexpWordCharacters`) instead of the
 * server's hard-coded `[a-zA-Z0-9]`. The hard-coded form marks any non-Latin
 * script (Hebrew, Arabic, Cyrillic, Greek, …) as non-words, which would make
 * those languages unlearnable offline — directly counter to the milestone of
 * shipping space-separated AND right-to-left languages with no server. Driving
 * it from the per-language regex (as the briefing instructs) makes RTL and
 * other scripts work, and is identical to the server's behaviour for the Latin
 * cases (validated against fixtures generated from the PHP parser).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import type { Parser, ParserConfig, ParserResult, Token } from './types';
import {
  CLOSERS,
  escapeForClass,
  normalizeClassFragment,
} from './regex-utils';
import { findLatinSentenceEnd } from './sentence-end';
import { removeSpaces } from './string-utils';

/** Closing punctuation as a ready-to-embed character-class body. */
const CLOSER_CLASS = escapeForClass(CLOSERS);

/**
 * Quote/closer set used in the cleanup phase:
 * `]'`" + “”‘’‹›„«»』」 + space` (note: no `)`), matching the PHP
 * `$quoteChars` set.
 */
const CLEAN_CLASS = escapeForClass(']\'`"“”‘’‹›„«»』」 ');

/** Normalize newlines to paragraph markers and collapse whitespace. */
function applyInitialTransformations(text: string): string {
  text = text.split('\n').join(' ¶');
  text = text.trim();
  return text.replace(/\s+/gu, ' ');
}

/**
 * Mark sentence (`\r`) and token (`\n`/`\t`) boundaries using the per-language
 * regexes. Mirrors `RegexParser::applyWordSplitting`.
 */
function applyWordSplitting(
  text: string,
  splitSentence: string,
  noSentenceEnd: string,
  termChar: string
): string {
  const split = normalizeClassFragment(splitSentence);
  const term = normalizeClassFragment(termChar);

  // Detect sentence ends after a token + sentence mark + trailing closers.
  const sentenceRe = new RegExp(
    '(\\S+)\\s*((\\.+)|([' +
      split +
      ']))([' +
      CLOSER_CLASS +
      ']*)(?=(\\s*)(\\S+|$))',
    'gu'
  );
  text = text.replace(
    sentenceRe,
    (...groups: (string | undefined)[]): string =>
      findLatinSentenceEnd(groups, noSentenceEnd)
  );

  // Paragraph markers become a combination of ¶ and \r (sequential, as PHP).
  text = text.split('¶').join('¶\r');
  text = text.split(' ¶').join('\r¶');

  // Isolate non-word characters onto their own lines, then repair over-splits.
  text = text.replace(new RegExp('([^' + term + '])', 'gu'), '\n$1\n');
  text = text.replace(
    new RegExp('\\n([' + split + '][' + CLOSER_CLASS + ']*)\\n\\t', 'gu'),
    '$1'
  );
  text = text.replace(/([0-9])[\n]([:.,])[\n]([0-9])/gu, '$1$2$3');

  return text;
}

/**
 * Turn the boundary-marked text into sentences + tokens. Mirrors
 * `RegexParser::parseToResult`, with the word marker driven by `termChar`.
 */
function parseToResult(
  text: string,
  shouldRemoveSpaces: boolean,
  termChar: string
): ParserResult {
  const term = normalizeClassFragment(termChar);

  // Collapse the tab/word markers, then normalize sentence (\r) boundaries.
  let s = text.split('\t').join('\n');
  s = s.split('\n\n').join('');
  s = s.replace(new RegExp('\\r(?=[' + CLEAN_CLASS + ']*\\r)', 'gu'), '');
  s = s.replace(/[\n]+\r/gu, '\r');
  s = s.replace(/\r([^\n])/gu, '\r\n$1');
  s = s.replace(new RegExp('\\n[.](?![' + CLEAN_CLASS + ']*\\r)', 'gu'), '.\n');

  // Mark word lines (first/second char is a word char). The word test uses the
  // language's class, not a Latin literal. This runs BEFORE the trim (matching
  // PHP), so the leading marker newline is trimmed away and the first line
  // already starts with `1\t` when the non-word marker runs.
  s = s.replace(
    new RegExp('(\\n|^)(?=.?[' + term + '][^\\n]*(\\n|$))', 'gu'),
    '\n1\t'
  );
  s = s.trim();
  s = s.replace(/(\n|^)(?!1\t)/gu, '\n0\t');

  if (shouldRemoveSpaces) {
    s = removeSpaces(s, true);
  }

  return assembleResult(s);
}

/**
 * Walk the marked lines (`1\tword` / `0\tnonword`, sentence ends flagged with a
 * trailing `\r`) into the sentence + token arrays. Shared shape with the
 * character parser.
 */
export function assembleResult(marked: string): ParserResult {
  const sentences: string[] = [];
  const tokens: Token[] = [];
  let sentenceIndex = 0;
  let order = 0;
  let parts: string[] = [];

  for (const line of marked.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab === -1) {
      continue;
    }
    const isWord = line.slice(0, tab) === '1';
    let term = line.slice(tab + 1);

    const endsSentence = term.endsWith('\r');
    if (endsSentence) {
      term = term.split('\r').join('');
    }

    parts.push(term);
    tokens.push({
      text: term,
      sentenceIndex,
      order,
      isWord,
      wordCount: isWord ? 1 : 0,
    });
    order++;

    if (endsSentence) {
      sentences.push(parts.join(''));
      parts = [];
      sentenceIndex++;
      order = 0;
    }
  }

  if (parts.length > 0) {
    sentences.push(parts.join(''));
  }
  if (sentences.length === 0) {
    sentences.push('');
  }

  return { sentences, tokens };
}

/** The space-separated / RTL tokenizer. */
export const regexParser: Parser = {
  type: 'regex',
  parse(text: string, config: ParserConfig): ParserResult {
    const transformed = applyWordSplitting(
      applyInitialTransformations(text),
      config.regexpSplitSentences,
      config.exceptionsSplitSentences,
      config.regexpWordCharacters
    );
    return parseToResult(
      transformed,
      config.removeSpaces,
      config.regexpWordCharacters
    );
  },
};
