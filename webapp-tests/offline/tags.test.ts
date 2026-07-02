/**
 * Tests the offline tag layer: the `/tags*` list endpoints, word-tag
 * read-back (edit form + list), tag-based vocabulary filtering, and text tags.
 * Mirrors the PHP Tags module's behaviour with no server.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { localDb } from '@shared/offline/local/schema';
import { setLocalFirst } from '@shared/offline/local/router';
import { createLanguage } from '@shared/offline/local/repositories/languages';
import { createText, getTextsByLanguage } from '@shared/offline/local/repositories/texts';
import { createFull, getForEdit } from '@shared/offline/local/repositories/terms';
import { getList, getFilterOptions } from '@shared/offline/local/repositories/words';
import {
  getAllTermTags,
  getAllTextTags,
  listTagsForManagement,
  renameTermTag,
  deleteTermTag,
  renameTextTag,
  deleteTextTag,
  getWordTagNames,
} from '@shared/offline/local/repositories/tags';
import { apiGet } from '@shared/api/client';
import { TagsApi } from '@modules/tags/api/tags_api';
import type { LanguageCreateRequest } from '@modules/language/api/languages_api';
import type { TextWordsResponse } from '@modules/text/api/texts_api';
import { getTextWords } from '@shared/offline/local/repositories/texts';

const ENGLISH: LanguageCreateRequest = {
  name: 'English',
  sourceLang: 'en',
  dict1Uri: 'https://en.wiktionary.org/wiki/lukaisu_term',
  translatorUri: '',
  regexpSplitSentences: '.!?:;',
  exceptionsSplitSentences: 'Mr.|Mrs.|Dr.|[A-Z].',
  regexpWordCharacters: 'a-zA-ZÀ-ÖØ-öø-ȳ',
};

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
  setLocalFirst(false);
});

afterAll(() => {
  setLocalFirst(false);
});

function words(resp: TextWordsResponse | { error: string }): TextWordsResponse {
  if ('error' in resp) {
    throw new Error(resp.error);
  }
  return resp;
}

/** Save `word` at its first occurrence with the given tags; return its id. */
async function saveWordWithTags(
  textId: number,
  textLc: string,
  tags: string[],
  status = 1
): Promise<number> {
  const snapshot = words(await getTextWords(textId));
  const occ = snapshot.words.find((w) => w.textLc === textLc);
  if (!occ) {
    throw new Error(`occurrence not found: ${textLc}`);
  }
  const full = await createFull({
    textId,
    position: occ.position,
    translation: textLc,
    status,
    tags,
  });
  return full.term!.id;
}

async function setup(): Promise<{ langId: number; textId: number }> {
  const lang = await createLanguage(ENGLISH);
  const langId = lang.id as number;
  const text = await createText({
    langId,
    title: 'Sample',
    text: 'The cat sat. The dog ran. The bird flew.',
  });
  return { langId, textId: text.id as number };
}

describe('term tags', () => {
  it('persists tags and reads them back in the edit form', async () => {
    const { textId } = await setup();
    const id = await saveWordWithTags(textId, 'cat', ['animal', 'pet']);

    const snapshot = words(await getTextWords(textId));
    const occ = snapshot.words.find((w) => w.textLc === 'cat')!;
    const edit = await getForEdit(textId, occ.position, id);
    if ('error' in edit) {
      throw new Error(edit.error);
    }
    expect(edit.term.tags).toEqual(['animal', 'pet']);
    // All known tag names show up for autocomplete.
    expect(edit.allTags.sort()).toEqual(['animal', 'pet']);
  });

  it('replaces tags on update rather than appending', async () => {
    const { textId } = await setup();
    const id = await saveWordWithTags(textId, 'cat', ['animal', 'pet']);
    // Re-save with a different set.
    const snapshot = words(await getTextWords(textId));
    const occ = snapshot.words.find((w) => w.textLc === 'cat')!;
    await createFull({ textId, position: occ.position, translation: 'cat', status: 1, tags: ['wild'] });

    const edit = await getForEdit(textId, occ.position, id);
    if ('error' in edit) {
      throw new Error(edit.error);
    }
    expect(edit.term.tags).toEqual(['wild']);
  });

  it('lists all term tags via getAllTermTags (sorted, unique)', async () => {
    const { textId } = await setup();
    await saveWordWithTags(textId, 'cat', ['pet', 'animal']);
    await saveWordWithTags(textId, 'dog', ['animal']);
    expect(await getAllTermTags()).toEqual(['animal', 'pet']);
  });
});

describe('vocabulary list tag filter', () => {
  it('renders a word’s tags and filters by tag id, untagged, AND/OR', async () => {
    const { langId, textId } = await setup();
    await saveWordWithTags(textId, 'cat', ['animal', 'pet']);
    await saveWordWithTags(textId, 'dog', ['animal']);
    await saveWordWithTags(textId, 'bird', []); // untagged

    const opts = await getFilterOptions(langId);
    const animal = opts.tags.find((t) => t.name === 'animal')!.id;
    const pet = opts.tags.find((t) => t.name === 'pet')!.id;

    // Tags are rendered on each row.
    const all = await getList({ lang: langId });
    const catRow = all.words.find((w) => w.text === 'cat')!;
    expect(catRow.tags).toBe('animal, pet');

    // Single tag.
    const animals = await getList({ lang: langId, tag1: animal });
    expect(animals.words.map((w) => w.text).sort()).toEqual(['cat', 'dog']);

    // Untagged (-1).
    const untagged = await getList({ lang: langId, tag1: -1 });
    expect(untagged.words.map((w) => w.text)).toEqual(['bird']);

    // AND: animal AND pet -> cat only.
    const both = await getList({ lang: langId, tag1: animal, tag2: pet, tag12: 1 });
    expect(both.words.map((w) => w.text)).toEqual(['cat']);

    // OR: animal OR pet -> cat + dog.
    const either = await getList({ lang: langId, tag1: animal, tag2: pet, tag12: 0 });
    expect(either.words.map((w) => w.text).sort()).toEqual(['cat', 'dog']);
  });
});

describe('text tags', () => {
  it('stores text tags on create and surfaces them in the library list', async () => {
    const lang = await createLanguage(ENGLISH);
    const langId = lang.id as number;
    await createText({
      langId,
      title: 'Tagged',
      text: 'Hello world.',
      tags: ['news', 'beginner'],
    });

    expect(await getAllTextTags()).toEqual(['beginner', 'news']);

    const list = await getTextsByLanguage(langId, 1, 10, 1);
    expect(list.texts[0].taglist).toContain('news');
    expect(list.texts[0].taglist).toContain('beginner');
  });
});

describe('tag endpoints through the local seam', () => {
  it('serves /tags, /tags/term and /tags/text from the on-device DB', async () => {
    const { textId } = await setup();
    await saveWordWithTags(textId, 'cat', ['animal']);
    const langId = (await localDb.languages.toCollection().first())!.id as number;
    await createText({ langId, title: 'T', text: 'Hi.', tags: ['news'] });

    setLocalFirst(true);

    const term = await apiGet<string[]>('/tags/term');
    expect(term.error).toBeUndefined();
    expect(term.data).toEqual(['animal']);

    const text = await apiGet<string[]>('/tags/text');
    expect(text.data).toEqual(['news']);

    const both = await apiGet<{ term: string[]; text: string[] }>('/tags');
    expect(both.data).toEqual({ term: ['animal'], text: ['news'] });
  });
});

describe('tag management (rename / delete)', () => {
  /** Seed one term tag ('animal' on cat+dog) and one text tag ('news'). */
  async function seedTags(): Promise<{ termId: number; textTagId: number; catId: number }> {
    const { langId, textId } = await setup();
    const catId = await saveWordWithTags(textId, 'cat', ['animal']);
    await saveWordWithTags(textId, 'dog', ['animal']);
    await createText({ langId, title: 'T', text: 'Hi.', tags: ['news'] });
    const termId = (await localDb.tags.where('text').equals('animal').first())!.id as number;
    const textTagId = (await localDb.textTags.where('text').equals('news').first())!.id as number;
    return { termId, textTagId, catId };
  }

  it('lists term + text tags with ids and usage counts', async () => {
    const { termId, textTagId } = await seedTags();
    const manage = await listTagsForManagement();
    expect(manage.term).toEqual([{ id: termId, name: 'animal', count: 2 }]);
    expect(manage.text).toEqual([{ id: textTagId, name: 'news', count: 1 }]);
  });

  it('renames a term tag everywhere it is applied', async () => {
    const { termId, catId } = await seedTags();
    const res = await renameTermTag(termId, 'creature');
    expect(res.success).toBe(true);
    expect(await getAllTermTags()).toEqual(['creature']);
    // The rename is by tag row, so every tagged term reflects it.
    expect(await getWordTagNames(catId)).toEqual(['creature']);
  });

  it('rejects a blank or duplicate term-tag name', async () => {
    const { langId, textId } = await setup();
    await saveWordWithTags(textId, 'cat', ['animal']);
    await saveWordWithTags(textId, 'dog', ['pet']);
    void langId;
    const animalId = (await localDb.tags.where('text').equals('animal').first())!.id as number;
    expect((await renameTermTag(animalId, '   ')).error).toBeTruthy();
    expect((await renameTermTag(animalId, 'pet')).error).toBeTruthy();
    // Unchanged.
    expect(await getAllTermTags()).toEqual(['animal', 'pet']);
  });

  it('deletes a term tag and unassigns it from its terms', async () => {
    const { termId, catId } = await seedTags();
    const res = await deleteTermTag(termId);
    expect(res.success).toBe(true);
    expect(await getAllTermTags()).toEqual([]);
    expect(await getWordTagNames(catId)).toEqual([]);
    expect(await localDb.wordTags.where('tgId').equals(termId).count()).toBe(0);
  });

  it('renames and deletes a text tag', async () => {
    const { textTagId } = await seedTags();
    expect((await renameTextTag(textTagId, 'headlines')).success).toBe(true);
    expect(await getAllTextTags()).toEqual(['headlines']);

    expect((await deleteTextTag(textTagId)).success).toBe(true);
    expect(await getAllTextTags()).toEqual([]);
    expect(await localDb.textTagMap.where('t2Id').equals(textTagId).count()).toBe(0);
  });

  it('errors on missing tags', async () => {
    expect((await renameTermTag(999999, 'x')).error).toBeTruthy();
    expect((await deleteTermTag(999999)).error).toBeTruthy();
    expect((await deleteTextTag(999999)).error).toBeTruthy();
  });

  it('drives the management arms through the local API seam', async () => {
    const { termId } = await seedTags();
    setLocalFirst(true);

    const list = await TagsApi.listForManagement();
    expect(list.error).toBeUndefined();
    expect(list.data?.term.find((t) => t.id === termId)?.count).toBe(2);

    const renamed = await TagsApi.renameTerm(termId, 'creature');
    expect(renamed.data?.success).toBe(true);

    const deleted = await TagsApi.deleteTerm(termId);
    expect(deleted.data?.success).toBe(true);
    expect((await TagsApi.listForManagement()).data?.term).toEqual([]);
  });
});
