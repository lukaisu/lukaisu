/**
 * Character parser — the CJK fallback tokenizer (each character is its own
 * word). This is a clean reimplementation rather than a port: the server's
 * `CharacterParser` emits empty tokens and a stray marker token for the same
 * input, so porting it faithfully would carry those bugs into the offline path.
 * The behaviour here matches the *intent* (one token per character, sentence
 * breaks on the language's sentence marks, spaces dropped) and is what the
 * reader needs for a functional — if lower-quality — offline CJK experience.
 * High-quality CJK tokenization (MeCab/jieba) stays server-enhanced.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import type { Parser, ParserConfig, ParserResult, Token } from './types';
import { normalizeClassFragment } from './regex-utils';

/** The character-by-character tokenizer for CJK and similar scripts. */
export const characterParser: Parser = {
  type: 'character',
  parse(text: string, config: ParserConfig): ParserResult {
    const wordRe = new RegExp(
      '^[' + normalizeClassFragment(config.regexpWordCharacters) + ']$',
      'u'
    );
    const splitRe = new RegExp(
      '^[' + normalizeClassFragment(config.regexpSplitSentences) + ']$',
      'u'
    );

    const sentences: string[] = [];
    const tokens: Token[] = [];
    let sentenceIndex = 0;
    let order = 0;
    let parts: string[] = [];

    const push = (ch: string, isWord: boolean): void => {
      parts.push(ch);
      tokens.push({
        text: ch,
        sentenceIndex,
        order,
        isWord,
        wordCount: isWord ? 1 : 0,
      });
      order++;
    };
    const endSentence = (): void => {
      sentences.push(parts.join(''));
      parts = [];
      sentenceIndex++;
      order = 0;
    };

    // Iterate by code point so astral characters stay intact.
    for (const ch of Array.from(text)) {
      if (ch === '\n' || ch === '\r') {
        // Paragraph/line break ends the current sentence.
        if (parts.length > 0) {
          endSentence();
        }
        continue;
      }
      if (/\s/u.test(ch)) {
        if (config.removeSpaces) {
          continue;
        }
        push(ch, false);
        continue;
      }
      const isWord = wordRe.test(ch);
      push(ch, isWord);
      if (!isWord && splitRe.test(ch)) {
        endSentence();
      }
    }

    if (parts.length > 0) {
      endSentence();
    }
    if (sentences.length === 0) {
      sentences.push('');
    }

    return { sentences, tokens };
  },
};
