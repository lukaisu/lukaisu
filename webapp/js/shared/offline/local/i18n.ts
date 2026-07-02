/**
 * Offline UI translations.
 *
 * The translator (`shared/i18n/translator.ts`) fetches `GET /api/v1/i18n[/{locale}]`
 * on a shell-free client, expecting `{ locale, messages }` where `messages` is a
 * flat `"namespace.key" => string` map. With no server that fetch fails and the
 * UI falls back to raw keys (e.g. `navbar.texts`). We bundle the English catalog
 * (`locale/en/*.json`) and serve it from the local router instead.
 *
 * Only English is bundled; any requested locale resolves to English offline.
 * The flattening mirrors the server's `Translator::getAllTranslations`: each
 * namespace file `{ns}.json` contributes `{ns}.{key} => value`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

// Eagerly import every English namespace file at build time. The path is
// relative to this module (five levels up to the repo root, then `locale/en`).
const NAMESPACE_FILES = import.meta.glob('../../../../../locale/en/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, string>>;

let cached: Record<string, string> | null = null;

/** Flat `"namespace.key" => string` map from the bundled English catalog. */
export function englishMessages(): Record<string, string> {
  if (cached) {
    return cached;
  }
  const messages: Record<string, string> = {};
  for (const [path, strings] of Object.entries(NAMESPACE_FILES)) {
    const namespace = (path.split('/').pop() ?? '').replace(/\.json$/, '');
    for (const [key, value] of Object.entries(strings)) {
      messages[`${namespace}.${key}`] = value;
    }
  }
  cached = messages;
  return messages;
}

/** The bundle the translator expects from `GET /api/v1/i18n[/{locale}]`. */
export function getI18nBundle(): { locale: string; messages: Record<string, string> } {
  return { locale: 'en', messages: englishMessages() };
}
