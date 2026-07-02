/**
 * Small string helpers ported from the server `StringUtils`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/**
 * Remove all spaces from a string when `remove` is truthy (port of
 * `StringUtils::removeSpaces`). Used for CJK where spaces are not meaningful.
 */
export function removeSpaces(value: string, remove: boolean): string {
  if (!remove) {
    return value;
  }
  return value.split(' ').join('');
}

/**
 * Apply pipe-separated `from=to` character substitutions (the
 * `character_substitutions` setting), e.g. `´='|...=…`. Applied before
 * parsing. Empty/blank rules are skipped.
 */
export function applyCharacterSubstitutions(text: string, rules: string): string {
  if (!rules) {
    return text;
  }
  for (const rule of rules.split('|')) {
    const eq = rule.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const from = rule.slice(0, eq);
    const to = rule.slice(eq + 1);
    if (from === '') {
      continue;
    }
    text = text.split(from).join(to);
  }
  return text;
}
