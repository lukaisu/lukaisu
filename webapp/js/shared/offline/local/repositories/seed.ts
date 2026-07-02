/**
 * First-run seeding — gives a fresh, server-less install something to read.
 *
 * Languages that have a bundled sample text are created from their preset and
 * the sample texts are imported (and parsed) on-device. The full preset list
 * stays available to the new-language wizard via `getDefinitions`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb } from '../schema';
import { LANGUAGE_PRESETS, type LanguagePreset } from '../language-presets';
import { SAMPLE_TEXTS } from '../sample-texts';
import { createLanguage } from './languages';
import { createText } from './texts';
import {
  SettingKeys,
  getSetting,
  setSetting,
  setCurrentLanguageId,
} from './settings';
import type { LanguageCreateRequest } from '@modules/language/api/languages_api';

function presetToRequest(p: LanguagePreset): LanguageCreateRequest {
  return {
    name: p.name,
    sourceLang: p.code,
    dict1Uri: p.dict1Uri,
    dict2Uri: p.dict2Uri,
    translatorUri: p.translatorUri,
    textSize: p.textSize,
    characterSubstitutions: p.characterSubstitutions,
    regexpSplitSentences: p.regexpSplitSentences,
    exceptionsSplitSentences: p.exceptionsSplitSentences,
    regexpWordCharacters: p.regexpWordCharacters,
    removeSpaces: p.removeSpaces,
    splitEachChar: p.splitEachChar,
    rightToLeft: p.rightToLeft,
    showRomanization: p.showRomanization,
  };
}

/**
 * Seed the local DB on first run. No-op if already seeded or non-empty, so it
 * is safe to call on every launch.
 */
export async function seedIfNeeded(): Promise<boolean> {
  const seeded = await getSetting(SettingKeys.SEEDED, '');
  if (seeded === '1' || (await localDb.languages.count()) > 0) {
    return false;
  }

  const neededNames = new Set(SAMPLE_TEXTS.map((s) => s.languageName));
  const idByName = new Map<string, number>();
  let firstId = 0;

  for (const preset of LANGUAGE_PRESETS) {
    if (!neededNames.has(preset.name)) {
      continue;
    }
    const result = await createLanguage(presetToRequest(preset));
    if (result.success && result.id != null) {
      idByName.set(preset.name, result.id);
      if (!firstId) {
        firstId = result.id;
      }
    }
  }

  for (const sample of SAMPLE_TEXTS) {
    const langId = idByName.get(sample.languageName);
    if (!langId) {
      continue;
    }
    await createText({
      langId,
      title: sample.title,
      text: sample.text,
      sourceUri: sample.sourceUri || undefined,
    });
  }

  if (firstId) {
    await setCurrentLanguageId(firstId);
  }
  await setSetting(SettingKeys.SEEDED, '1');
  return true;
}
