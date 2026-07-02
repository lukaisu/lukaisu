/**
 * Language repository — CRUD over local languages, plus the preset definitions
 * used by the new-language wizard offline.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalLanguage } from '../schema';
import { LANGUAGE_PRESETS } from '../language-presets';
import { nowMs } from './helpers';
import {
  getCurrentLanguageId,
  setCurrentLanguageId,
} from './settings';
import { reparseLanguage } from './texts';
import type {
  LanguageListResponse,
  LanguageListItem,
  LanguageGetResponse,
  LanguageFull,
  LanguageCreateRequest,
  LanguageCreateResponse,
  LanguageUpdateRequest,
  LanguageUpdateResponse,
  LanguageDeleteResponse,
  LanguageStatsResponse,
  LanguageDefinitionsResponse,
  LanguageDefinition,
} from '@modules/language/api/languages_api';

const DEFAULTS = {
  regexpSplitSentences: '.!?:;',
  regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
  textSize: 100,
};

/** Build a stored language row from a create/update request. */
function rowFromRequest(req: LanguageCreateRequest): Omit<LocalLanguage, 'id'> {
  const now = nowMs();
  return {
    name: req.name,
    code: req.sourceLang ?? '',
    dict1Uri: req.dict1Uri ?? '',
    dict2Uri: req.dict2Uri ?? '',
    translatorUri: req.translatorUri ?? '',
    exportTemplate: req.exportTemplate ?? '',
    textSize: req.textSize ?? DEFAULTS.textSize,
    characterSubstitutions: req.characterSubstitutions ?? '',
    regexpSplitSentences: req.regexpSplitSentences ?? DEFAULTS.regexpSplitSentences,
    exceptionsSplitSentences: req.exceptionsSplitSentences ?? '',
    regexpWordCharacters: req.regexpWordCharacters ?? DEFAULTS.regexpWordCharacters,
    removeSpaces: req.removeSpaces ?? false,
    splitEachChar: req.splitEachChar ?? false,
    rightToLeft: req.rightToLeft ?? false,
    ttsVoiceApi: req.ttsVoiceApi ?? '',
    showRomanization: req.showRomanization ?? false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Map a stored language to the editor's `LanguageFull` shape. */
function toFull(l: LocalLanguage): LanguageFull {
  return {
    id: l.id ?? 0,
    name: l.name,
    dict1Uri: l.dict1Uri,
    dict2Uri: l.dict2Uri,
    translatorUri: l.translatorUri,
    dict1PopUp: false,
    dict2PopUp: false,
    translatorPopUp: false,
    sourceLang: l.code || null,
    targetLang: null,
    exportTemplate: l.exportTemplate,
    textSize: l.textSize,
    characterSubstitutions: l.characterSubstitutions,
    regexpSplitSentences: l.regexpSplitSentences,
    exceptionsSplitSentences: l.exceptionsSplitSentences,
    regexpWordCharacters: l.regexpWordCharacters,
    removeSpaces: l.removeSpaces,
    splitEachChar: l.splitEachChar,
    rightToLeft: l.rightToLeft,
    ttsVoiceApi: l.ttsVoiceApi,
    showRomanization: l.showRomanization,
  };
}

/** Active (non-deleted) languages. */
async function activeLanguages(): Promise<LocalLanguage[]> {
  return localDb.languages.filter((l) => l.deletedAt == null).toArray();
}

/** List languages with summary counts + the current language id. */
export async function listLanguages(): Promise<LanguageListResponse> {
  const langs = await activeLanguages();
  const languages: LanguageListItem[] = [];
  for (const l of langs) {
    const id = l.id ?? 0;
    const texts = await localDb.texts.where('langId').equals(id).and((t) => t.deletedAt == null).toArray();
    const wordCount = await localDb.words.where('langId').equals(id).and((w) => w.deletedAt == null).count();
    languages.push({
      id,
      name: l.name,
      hasExportTemplate: l.exportTemplate !== '',
      textCount: texts.filter((t) => t.archivedAt == null).length,
      archivedTextCount: texts.filter((t) => t.archivedAt != null).length,
      wordCount,
      feedCount: 0,
      articleCount: 0,
    });
  }
  let current = await getCurrentLanguageId();
  if (!current && langs.length > 0) {
    current = langs[0].id ?? 0;
  }
  return { languages, currentLanguageId: current };
}

/** Get one language plus a name→id map of all languages. */
export async function getLanguage(id: number): Promise<LanguageGetResponse | { error: string }> {
  const l = await localDb.languages.get(id);
  if (!l || l.deletedAt != null) {
    return { error: 'Language not found' };
  }
  const all: Record<string, number> = {};
  for (const lang of await activeLanguages()) {
    all[lang.name] = lang.id ?? 0;
  }
  return { language: toFull(l), allLanguages: all };
}

/** Create a language; the first one becomes the current language. */
export async function createLanguage(
  req: LanguageCreateRequest
): Promise<LanguageCreateResponse> {
  if (!req.name || req.name.trim() === '') {
    return { success: false, error: 'Name is required' };
  }
  const existing = await localDb.languages.where('name').equals(req.name).first();
  if (existing && existing.deletedAt == null) {
    return { success: false, error: 'A language with that name already exists' };
  }
  const id = (await localDb.languages.add(rowFromRequest(req) as LocalLanguage)) as number;
  if ((await getCurrentLanguageId()) === 0) {
    await setCurrentLanguageId(id);
  }
  return { success: true, id };
}

/** Update a language and re-parse its texts (settings may affect tokenizing). */
export async function updateLanguage(
  id: number,
  req: LanguageUpdateRequest
): Promise<LanguageUpdateResponse> {
  const l = await localDb.languages.get(id);
  if (!l || l.deletedAt != null) {
    return { success: false, error: 'Language not found' };
  }
  const row = rowFromRequest(req);
  await localDb.languages.update(id, {
    ...row,
    createdAt: l.createdAt,
    updatedAt: nowMs(),
  });
  const reparsed = await reparseLanguage(id);
  return { success: true, reparsed };
}

/** Soft-delete a language and hard-delete its dependent rows. */
export async function deleteLanguage(id: number): Promise<LanguageDeleteResponse> {
  const l = await localDb.languages.get(id);
  if (!l) {
    return { success: false, error: 'Language not found' };
  }
  const now = nowMs();
  const textIds = (await localDb.texts.where('langId').equals(id).primaryKeys()) as number[];
  await localDb.transaction(
    'rw',
    [localDb.languages, localDb.texts, localDb.words, localDb.sentences, localDb.occurrences],
    async () => {
      await localDb.languages.update(id, { deletedAt: now });
      await localDb.texts.where('langId').equals(id).delete();
      await localDb.words.where('langId').equals(id).delete();
      await localDb.sentences.where('langId').equals(id).delete();
      for (const txId of textIds) {
        await localDb.occurrences.where('textId').equals(txId).delete();
      }
    }
  );
  if ((await getCurrentLanguageId()) === id) {
    const remaining = await activeLanguages();
    await setCurrentLanguageId(remaining[0]?.id ?? 0);
  }
  return { success: true };
}

/** Set the current/default language. */
export async function setDefaultLanguage(id: number): Promise<{ success: boolean }> {
  await setCurrentLanguageId(id);
  return { success: true };
}

/** Per-language counts. */
export async function getLanguageStats(id: number): Promise<LanguageStatsResponse> {
  const texts = await localDb.texts.where('langId').equals(id).and((t) => t.deletedAt == null).toArray();
  const words = await localDb.words.where('langId').equals(id).and((w) => w.deletedAt == null).count();
  return {
    texts: texts.filter((t) => t.archivedAt == null).length,
    archivedTexts: texts.filter((t) => t.archivedAt != null).length,
    words,
    feeds: 0,
  };
}

/**
 * Languages that have at least one archived text, with their archived count.
 *
 * Backs the archived-texts page's `GET /languages/with-archived-texts` (the
 * grouped archived view loads this first to render its language sections).
 * Mirrors the server's `{ languages: [{ id, name, text_count }] }` shape.
 */
export async function listLanguagesWithArchivedTexts(): Promise<{
  languages: Array<{ id: number; name: string; text_count: number }>;
}> {
  const langs = await activeLanguages();
  const languages: Array<{ id: number; name: string; text_count: number }> = [];
  for (const l of langs) {
    const id = l.id ?? 0;
    const text_count = await localDb.texts
      .where('langId')
      .equals(id)
      .and((t) => t.deletedAt == null && t.archivedAt != null)
      .count();
    if (text_count > 0) {
      languages.push({ id, name: l.name, text_count });
    }
  }
  return { languages };
}

/** Preset definitions for the new-language wizard, keyed by language name. */
export function getDefinitions(): LanguageDefinitionsResponse {
  const definitions: Record<string, LanguageDefinition> = {};
  for (const p of LANGUAGE_PRESETS) {
    definitions[p.name] = {
      glosbeIso: p.code,
      googleIso: p.code,
      biggerFont: p.textSize > 100,
      wordCharRegExp: p.regexpWordCharacters,
      sentSplRegExp: p.regexpSplitSentences,
      makeCharacterWord: p.splitEachChar,
      removeSpaces: p.removeSpaces,
      rightToLeft: p.rightToLeft,
    };
  }
  return { definitions };
}
