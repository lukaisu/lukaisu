/**
 * Pure helpers that bridge the tokenizer and the reader's data shape.
 *
 * `buildStructures` turns a `ParserResult` into the sentence + occurrence rows
 * to persist; `assembleTextWords` turns stored occurrences (+ matched words)
 * into the `TextWord[]` / `TextReadingConfig` the reader renders. Keeping these
 * pure makes the read path testable without a database.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import type { ParserResult } from './parser';
import type { LocalLanguage, LocalOccurrence, LocalText, LocalWord } from './schema';
import { toClassName } from './class-name';
import type {
  TextWord,
  TextReadingConfig,
} from '@modules/text/api/texts_api';

/** Lower-case a token consistently with the way words are keyed. */
export function lowerCaseTerm(text: string): string {
  return text.toLowerCase();
}

/** A sentence row to persist (without ids). */
export interface BuiltSentence {
  order: number;
  text: string;
  /** Global occurrence order of this sentence's first token. */
  firstPos: number;
}

/** An occurrence row to persist (without ids). */
export interface BuiltOccurrence {
  /** Global token order within the text (unique; drives DOM ids). */
  order: number;
  /** 0-based sentence index this token belongs to. */
  sentenceOrder: number;
  text: string;
  textLc: string;
  isWord: boolean;
  wordCount: number;
}

/** The sentence + occurrence structures derived from a parse result. */
export interface BuiltStructures {
  sentences: BuiltSentence[];
  occurrences: BuiltOccurrence[];
}

/**
 * Flatten a parse result into sentences and occurrences. Token order is made
 * *global* across the text (the per-sentence order from the parser is not
 * unique, and the reader needs unique positions for DOM ids and navigation).
 */
export function buildStructures(parse: ParserResult): BuiltStructures {
  const sentences: BuiltSentence[] = [];
  const occurrences: BuiltOccurrence[] = [];
  let order = 0;
  let currentSentence = -1;

  for (const token of parse.tokens) {
    if (token.sentenceIndex !== currentSentence) {
      currentSentence = token.sentenceIndex;
      sentences.push({
        order: currentSentence,
        text: parse.sentences[currentSentence] ?? '',
        firstPos: order,
      });
    }
    occurrences.push({
      order,
      sentenceOrder: token.sentenceIndex,
      text: token.text,
      textLc: lowerCaseTerm(token.text),
      isWord: token.isWord,
      wordCount: 1,
    });
    order += 1;
  }

  return { sentences, occurrences };
}

/**
 * Resolve built occurrences into storable `LocalOccurrence` rows: attach the
 * text/language ids, the persisted sentence id, and the matching word id (by
 * lower-cased term) for word tokens.
 */
export function toLocalOccurrences(
  built: BuiltOccurrence[],
  textId: number,
  langId: number,
  sentenceIdByOrder: Map<number, number>,
  wordIdByTextLc: Map<string, number>
): LocalOccurrence[] {
  return built.map((o) => ({
    textId,
    langId,
    sentenceId: sentenceIdByOrder.get(o.sentenceOrder) ?? 0,
    order: o.order,
    wordCount: o.wordCount,
    text: o.text,
    textLc: o.textLc,
    isWord: o.isWord,
    woId: o.isWord ? wordIdByTextLc.get(o.textLc) ?? null : null,
  }));
}

/**
 * Assemble the reader's `TextWord[]` from stored occurrences and the words they
 * resolve to. `wordsById` maps a word id to its row; unmatched/non-word
 * occurrences render as unknown (status 0).
 */
export function assembleTextWords(
  occurrences: LocalOccurrence[],
  wordsById: Map<number, LocalWord>
): TextWord[] {
  const words: TextWord[] = [];
  for (const occ of occurrences) {
    const word = occ.woId != null ? wordsById.get(occ.woId) : undefined;
    words.push({
      position: occ.order,
      sentenceId: occ.sentenceId,
      text: occ.text,
      textLc: occ.textLc,
      hex: toClassName(occ.textLc),
      isNotWord: !occ.isWord,
      wordCount: occ.wordCount < 1 ? 1 : occ.wordCount,
      hidden: false,
      wordId: word?.id ?? null,
      status: word ? word.status : 0,
      translation: word?.translation ?? '',
      romanization: word?.romanization ?? '',
      notes: word?.notes ?? '',
      tags: '',
    });
  }
  return words;
}

/** Build the reading configuration the reader needs from a text + language. */
export function buildReadingConfig(
  text: LocalText,
  language: LocalLanguage
): TextReadingConfig {
  return {
    textId: text.id ?? 0,
    langId: text.langId,
    title: text.title,
    audioUri: text.audioUri,
    sourceUri: text.sourceUri,
    audioPosition: text.audioPosition,
    rightToLeft: language.rightToLeft,
    textSize: language.textSize,
    removeSpaces: language.removeSpaces,
    dictLinks: {
      dict1: language.dict1Uri,
      dict2: language.dict2Uri,
      translator: language.translatorUri,
    },
    showLearning: 1,
    displayStatTrans: 1,
    modeTrans: 2,
    termDelimiter: '',
    annTextSize: 50,
    readerWidth: 100,
  };
}
