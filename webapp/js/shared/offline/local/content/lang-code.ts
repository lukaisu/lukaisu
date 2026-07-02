/**
 * Resolve a local language to the ISO 639-1 code the catalog APIs expect.
 *
 * The on-device `languages.code` is usually already an ISO-ish code (e.g. `fr`,
 * `zh-CN`); we strip any region/script subtag. As a fallback (older rows whose
 * code is empty or a full language name) we fuzzy-match the language *name*
 * against the same map the server's `GutenbergClient` uses, so behavior matches
 * the proxied path. The Global Digital Library uses the same slugs for the
 * common languages, so this resolver serves both catalogs.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Language name -> ISO 639-1, mirroring `GutenbergClient::LANGUAGE_NAME_MAP`. */
const LANGUAGE_NAME_MAP: Record<string, string> = {
  english: 'en',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  dutch: 'nl',
  finnish: 'fi',
  swedish: 'sv',
  danish: 'da',
  norwegian: 'no',
  hungarian: 'hu',
  polish: 'pl',
  czech: 'cs',
  greek: 'el',
  russian: 'ru',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  arabic: 'ar',
  hebrew: 'he',
  turkish: 'tr',
  romanian: 'ro',
  catalan: 'ca',
  latin: 'la',
  esperanto: 'eo',
  tagalog: 'tl',
};

/**
 * Resolve a `{ code, name }` language to an ISO 639-1 code, or null when no
 * match is found (the caller then browses the catalog without a language
 * filter, exactly as the server does).
 */
export function resolveLanguageCode(
  lang: { code?: string; name?: string } | undefined | null
): string | null {
  if (!lang) {
    return null;
  }

  const code = (lang.code ?? '').trim().toLowerCase();
  if (code) {
    const base = code.split(/[-_]/)[0];
    if (base) {
      return base;
    }
  }

  const name = (lang.name ?? '').trim().toLowerCase();
  if (name) {
    if (LANGUAGE_NAME_MAP[name]) {
      return LANGUAGE_NAME_MAP[name];
    }
    for (const [key, iso] of Object.entries(LANGUAGE_NAME_MAP)) {
      if (name.includes(key)) {
        return iso;
      }
    }
  }

  return null;
}
