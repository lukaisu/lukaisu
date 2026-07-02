/**
 * Built-in language presets for offline-first setup.
 *
 * Pure data module: no project imports. The values mirror the per-language
 * parsing/display settings used by the LWT regex parsers and are seeded from
 * `db/seeds/demo.sql` (where available) plus sensible defaults for languages
 * not present in the demo seed.
 *
 * Note on regex character classes: PHP-style `\x{XXXX}` ranges from the SQL
 * seed are converted to JavaScript `\u{XXXX}` escapes here, since these
 * strings are embedded inside `new RegExp(..., 'u')` character classes.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * A single built-in language configuration.
 */
export interface LanguagePreset {
  /** Display name, e.g. 'French'. */
  name: string;
  /** BCP-47-ish source language code, e.g. 'fr' (the language being learned). */
  code: string;
  /** Primary dictionary URL template; 'lukaisu_term' is the placeholder replaced with the looked-up term. */
  dict1Uri: string;
  /** Secondary dictionary URL template, or '' if none. */
  dict2Uri: string;
  /** Google Translate URL template ('lukaisu_term' placeholder), or ''. */
  translatorUri: string;
  /** Default reading text size (percent), e.g. 100. */
  textSize: number;
  /** Character substitution rules, pipe-separated 'from=to' pairs, or ''. */
  characterSubstitutions: string;
  /** Regex char class contents marking sentence ends, e.g. '.!?:;'. */
  regexpSplitSentences: string;
  /** Exceptions to sentence splitting (e.g. 'Mr.|Dr.'), or ''. */
  exceptionsSplitSentences: string;
  /** Regex char class contents defining word characters, e.g. 'a-zA-ZÀ-ÖØ-öø-ȳ'. Use \u{XXXX} unicode escapes (NOT PHP \x{XXXX}). */
  regexpWordCharacters: string;
  /** CJK: remove spaces between tokens. */
  removeSpaces: boolean;
  /** CJK: split each character as its own word. */
  splitEachChar: boolean;
  /** Right-to-left script. */
  rightToLeft: boolean;
  /** Show romanization field by default. */
  showRomanization: boolean;
}

/**
 * Built-in presets covering common world languages. The first entries are
 * seeded directly from the demo database; the rest use well-known dictionary
 * templates and correct word-character ranges.
 */
export const LANGUAGE_PRESETS: LanguagePreset[] = [
  {
    name: 'English',
    code: 'en',
    dict1Uri: 'https://en.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=en&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].',
    regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'French',
    code: 'fr',
    dict1Uri: 'http://www.wordreference.com/fren/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=fr&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '[A-Z].|Dr.',
    regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'German',
    code: 'de',
    dict1Uri: 'http://de-en.syn.dict.cc/?s=lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=de&tl=en&text=lukaisu_term',
    textSize: 150,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '[A-Z].|Dr.',
    regexpWordCharacters: 'a-zA-ZäöüÄÖÜß',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'Spanish',
    code: 'es',
    dict1Uri: 'https://es.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=es&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;¿¡',
    exceptionsSplitSentences: '[A-Z].|Sr.|Sra.|Dr.',
    regexpWordCharacters: 'a-zA-ZáéíóúüñÁÉÍÓÚÜÑ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'Italian',
    code: 'it',
    dict1Uri: 'https://it.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=it&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '[A-Z].|Sig.|Dott.',
    regexpWordCharacters: 'a-zA-ZàèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'Portuguese',
    code: 'pt',
    dict1Uri: 'https://pt.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=pt&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '[A-Z].|Sr.|Sra.|Dr.',
    regexpWordCharacters: 'a-zA-ZáàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'Russian',
    code: 'ru',
    dict1Uri: 'https://ru.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=ru&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '´=\'|`=\'|’=\'|‘=\'|...=…|..=‥',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '',
    regexpWordCharacters: 'А-Яа-яЁё',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: false
  },
  {
    name: 'Arabic',
    code: 'ar',
    dict1Uri: 'https://en.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=ar&tl=en&text=lukaisu_term',
    textSize: 150,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;؟',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '\\u{0600}-\\u{06FF}',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: true,
    showRomanization: true
  },
  {
    name: 'Hebrew',
    code: 'he',
    dict1Uri: 'http://dictionary.reverso.net/hebrew-english/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=iw&tl=en&text=lukaisu_term',
    textSize: 150,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '\\u{0590}-\\u{05FF}',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: true,
    showRomanization: true
  },
  {
    name: 'Greek',
    code: 'el',
    dict1Uri: 'https://en.wiktionary.org/wiki/lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=el&tl=en&text=lukaisu_term',
    textSize: 100,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;',
    exceptionsSplitSentences: '',
    regexpWordCharacters: 'Α-Ωα-ωΆ-ώ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: true
  },
  {
    name: 'Chinese',
    code: 'zh',
    dict1Uri:
      'https://ce.linedict.com/dict.html#/cnen/search?query=lukaisu_term',
    dict2Uri:
      'http://chinesedictionary.mobi/?handler=QueryWorddict&mwdqb=lukaisu_term',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=zh&tl=en&text=lukaisu_term',
    textSize: 200,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;。！？：；',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '一-龥',
    removeSpaces: true,
    splitEachChar: true,
    rightToLeft: false,
    showRomanization: true
  },
  {
    name: 'Japanese',
    code: 'ja',
    dict1Uri: 'https://jisho.org/words?eng=&dict=edict&jap=lukaisu_term',
    dict2Uri: 'http://jisho.org/kanji/details/lukaisu_term',
    translatorUri:
      'https://translate.google.com/?ie=UTF-8&sl=ja&tl=en&text=lukaisu_term',
    textSize: 200,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;。！？：；',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '一-龥ぁ-ヾ',
    removeSpaces: true,
    splitEachChar: true,
    rightToLeft: false,
    showRomanization: true
  },
  {
    name: 'Korean',
    code: 'ko',
    dict1Uri:
      'http://endic.naver.com/search.nhn?sLn=kr&isOnlyViewEE=N&query=lukaisu_term',
    dict2Uri: '',
    translatorUri:
      'https://translate.google.com/?text=lukaisu_term&ie=UTF-8&sl=ko&tl=en',
    textSize: 150,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;。！？：；',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '가-힣ᄀ-ᇂ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    showRomanization: true
  }
];
