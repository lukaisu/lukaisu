/**
 * Regex helpers shared by the local tokenizers.
 *
 * The PHP parsers interpolate per-language settings (sentence-split chars,
 * word chars) directly into PCRE patterns with the `/u` modifier. The
 * equivalent in JavaScript is the `u` flag, with two differences handled here:
 *
 * 1. PCRE accepts a literal `]` immediately after `[`; JS treats `[]` as an
 *    empty class, so any literal `]` in a class must be escaped as `\]`.
 * 2. PCRE uses `\x{HHHH}` for unicode code points; JS (with the `u` flag) uses
 *    `\u{HHHH}`. Language presets stored in the server DB use the `\x{...}`
 *    form, so we normalize it.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * Normalize a regex character-class *fragment* coming from language settings
 * (e.g. `regexp_word_characters`) into a JS-compatible fragment for use with
 * the `u` flag. Converts PHP `\x{HHHH}` escapes to JS `\u{HHHH}`.
 *
 * The fragment is inserted verbatim into a character class, so ranges like
 * `a-z` and escapes like `\u{0590}-\u{05FF}` are preserved.
 */
export function normalizeClassFragment(fragment: string): string {
  return fragment.replace(/\\x\{([0-9a-fA-F]+)\}/g, '\\u{$1}');
}

/**
 * Escape a run of *literal* characters so they are safe inside a JS character
 * class. Used for the fixed sets of closing quotes/brackets the parser knows
 * about (which include a literal `]`).
 */
export function escapeForClass(literal: string): string {
  return literal.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * Closing punctuation that may trail a sentence-ending mark (and so belongs to
 * the sentence being closed): `]'`"”)‘’‹›“„«»』」`. Matches the set the PHP
 * parsers use in their sentence-end regex.
 */
export const CLOSERS =
  ']\'`"”)‘’‹›“„«»』」';

/**
 * Loosely mirror PHP `is_numeric()` for parser purposes: a string that is a
 * decimal integer or float (optionally signed), e.g. `12`, `-3.5`, `.5`.
 */
export function isNumeric(value: string): boolean {
  return value !== '' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value);
}
