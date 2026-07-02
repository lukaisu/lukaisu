/**
 * Integration tests for the local-first repositories against a real Dexie
 * instance (fake-indexeddb). Exercises the milestone path end-to-end:
 * create a language → import a text → read with status highlighting →
 * save words → review them — all with no server.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '@shared/offline/local/schema';
import {
  createLanguage,
  listLanguagesWithArchivedTexts,
} from '@shared/offline/local/repositories/languages';
import {
  createText,
  getText,
  updateText,
  checkText,
  getTextWords,
  getStatistics,
  markAllWellKnown,
  archiveText,
  unarchiveText,
  deleteText,
  getTextsByLanguage,
  getArchivedTextsByLanguage,
} from '@shared/offline/local/repositories/texts';
import {
  createQuick,
  createFull,
  createStandalone,
  updateFull,
  deleteTerm,
  getTerm,
  setStatus,
  addWithTranslation,
} from '@shared/offline/local/repositories/terms';
import {
  getReviewConfig,
  getNextWord,
  updateStatus,
  getTomorrowCount,
} from '@shared/offline/local/repositories/review';
import { seedIfNeeded } from '@shared/offline/local/repositories/seed';
import type { TextWordsResponse } from '@modules/text/api/texts_api';
import type { LanguageCreateRequest } from '@modules/language/api/languages_api';

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
});

async function setupEnglishText(
  text = 'The cat sat. The cat ran.'
): Promise<{ langId: number; textId: number }> {
  const lang = await createLanguage(ENGLISH);
  const langId = lang.id as number;
  const created = await createText({ langId, title: 'Sample', text });
  return { langId, textId: created.id as number };
}

function words(resp: TextWordsResponse | { error: string }): TextWordsResponse {
  if ('error' in resp) {
    throw new Error(resp.error);
  }
  return resp;
}

describe('reading path', () => {
  it('imports a text and renders all words as unknown initially', async () => {
    const { textId } = await setupEnglishText();
    const resp = words(await getTextWords(textId));

    expect(resp.config.title).toBe('Sample');
    const wordTokens = resp.words.filter((w) => !w.isNotWord);
    expect(wordTokens.length).toBeGreaterThan(0);
    expect(wordTokens.every((w) => w.status === 0)).toBe(true);
    // Two sentences, so at least two distinct sentence ids.
    expect(new Set(resp.words.map((w) => w.sentenceId)).size).toBe(2);
  });

  it('reflects a saved word across every occurrence in the text', async () => {
    const { textId } = await setupEnglishText();

    // Find the position of the first "cat" occurrence.
    const before = words(await getTextWords(textId));
    const cat = before.words.find((w) => w.textLc === 'cat');
    expect(cat).toBeDefined();

    const quick = await createQuick(textId, cat!.position, 99);
    expect(quick.term_id).toBeGreaterThan(0);

    const after = words(await getTextWords(textId));
    const catOccurrences = after.words.filter((w) => w.textLc === 'cat');
    // "cat" appears twice; both should now show status 99.
    expect(catOccurrences.length).toBe(2);
    expect(catOccurrences.every((w) => w.status === 99)).toBe(true);
    expect(catOccurrences.every((w) => w.wordId === quick.term_id)).toBe(true);
  });

  it('computes status statistics for a text', async () => {
    const { textId } = await setupEnglishText();
    const before = words(await getTextWords(textId));
    const cat = before.words.find((w) => w.textLc === 'cat')!;
    await createQuick(textId, cat.position, 99);

    // Per-text map keyed by text id (the shape the library list consumes).
    const stats = await getStatistics([textId]);
    const textStats = stats[String(textId)];
    expect(textStats.total).toBeGreaterThan(0);
    expect(textStats.statusCounts['99']).toBe(2); // both "cat" occurrences
    expect(textStats.unknown).toBeGreaterThan(0);
    expect(textStats.saved).toBe(textStats.total - textStats.unknown);
    expect(textStats.unknownPercent).toBe(
      Math.round((textStats.unknown / textStats.total) * 100)
    );
  });

  it('marks all unknown words well-known', async () => {
    const { textId } = await setupEnglishText();
    const result = await markAllWellKnown(textId);
    expect(result.count).toBeGreaterThan(0);

    const after = words(await getTextWords(textId));
    expect(after.words.filter((w) => !w.isNotWord).every((w) => w.status === 99)).toBe(true);
  });
});

describe('text management (archive / unarchive / delete)', () => {
  it('archives a text out of the active list and into the archived list', async () => {
    const { langId, textId } = await setupEnglishText();

    // Starts active.
    expect((await getTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(1);
    expect((await getArchivedTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(0);

    const res = await archiveText(textId);
    expect('archived' in res && res.archived).toBe(true);

    // Now archived: gone from active, present in archived.
    expect((await getTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(0);
    expect((await getArchivedTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(1);
  });

  it('unarchives a text back into the active list', async () => {
    const { langId, textId } = await setupEnglishText();
    await archiveText(textId);

    const res = await unarchiveText(textId);
    expect('unarchived' in res && res.unarchived).toBe(true);

    expect((await getTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(1);
    expect((await getArchivedTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(0);
  });

  it('deletes a text and drops its parsed structures', async () => {
    const { langId, textId } = await setupEnglishText();
    expect((await localDb.occurrences.where('textId').equals(textId).count())).toBeGreaterThan(0);

    const res = await deleteText(textId);
    expect('deleted' in res && res.deleted).toBe(true);

    expect((await getTextsByLanguage(langId, 1, 10, 1)).pagination.total).toBe(0);
    expect(await localDb.occurrences.where('textId').equals(textId).count()).toBe(0);
    expect(await localDb.sentences.where('textId').equals(textId).count()).toBe(0);
  });

  it('errors when archiving / deleting a missing text', async () => {
    const archived = await archiveText(999999);
    expect('error' in archived).toBe(true);
    const deleted = await deleteText(999999);
    expect('error' in deleted).toBe(true);
  });

  it('reports only languages that have archived texts, with their counts', async () => {
    const { langId, textId } = await setupEnglishText();

    // No archived texts yet -> the language is absent from the grouped view.
    expect((await listLanguagesWithArchivedTexts()).languages).toHaveLength(0);

    await archiveText(textId);
    const withArchived = await listLanguagesWithArchivedTexts();
    expect(withArchived.languages).toHaveLength(1);
    expect(withArchived.languages[0].id).toBe(langId);
    expect(withArchived.languages[0].text_count).toBe(1);
  });
});

describe('single text edit (text-edit.html)', () => {
  it('loads a text\'s editable fields, with tags and archived flag', async () => {
    const { textId } = await setupEnglishText();
    await archiveText(textId);

    const rec = await getText(textId);
    if ('error' in rec) throw new Error(rec.error);
    expect(rec.title).toBe('Sample');
    expect(rec.text).toBe('The cat sat. The cat ran.');
    expect(rec.archived).toBe(true);
    expect(rec.tags).toEqual([]);
  });

  it('errors when loading a missing text', async () => {
    expect('error' in (await getText(999999))).toBe(true);
  });

  it('updates fields without re-parsing when the body is unchanged', async () => {
    const { langId, textId } = await setupEnglishText();
    const occBefore = await localDb.occurrences.where('textId').equals(textId).toArray();

    const res = await updateText(textId, {
      title: 'Renamed',
      langId,
      text: 'The cat sat. The cat ran.',
      tags: ['news'],
    });
    expect(res.updated).toBe(true);
    expect(res.reparsed).toBe(false);

    const rec = await getText(textId);
    if ('error' in rec) throw new Error(rec.error);
    expect(rec.title).toBe('Renamed');
    expect(rec.tags).toEqual(['news']);
    // Occurrence rows are untouched (ids stable) when the body didn't change.
    const occAfter = await localDb.occurrences.where('textId').equals(textId).toArray();
    expect(occAfter.map((o) => o.id)).toEqual(occBefore.map((o) => o.id));
  });

  it('re-parses (rebuilds sentences + occurrences) when the body changes', async () => {
    const { langId, textId } = await setupEnglishText();
    const sentBefore = await localDb.sentences.where('textId').equals(textId).count();

    const res = await updateText(textId, {
      title: 'Sample',
      langId,
      text: 'A dog barks. A dog runs. A dog sleeps.',
    });
    expect(res.updated).toBe(true);
    expect(res.reparsed).toBe(true);

    // The reader now reflects the new body.
    const rendered = words(await getTextWords(textId));
    expect(rendered.words.some((w) => w.text === 'dog')).toBe(true);
    expect(rendered.words.some((w) => w.text === 'cat')).toBe(false);
    const sentAfter = await localDb.sentences.where('textId').equals(textId).count();
    expect(sentAfter).toBeGreaterThan(sentBefore);
  });

  it('clears tags when an empty tag list is saved', async () => {
    const { langId, textId } = await setupEnglishText();
    const body = 'The cat sat. The cat ran.';
    await updateText(textId, { title: 'Sample', langId, text: body, tags: ['keep'] });
    await updateText(textId, { title: 'Sample', langId, text: body, tags: [] });
    const rec = await getText(textId);
    if ('error' in rec) throw new Error(rec.error);
    expect(rec.tags).toEqual([]);
  });

  it('errors when updating a missing text', async () => {
    const res = await updateText(999999, { title: 'x', langId: 1, text: 'y' });
    expect(res.updated).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe('parse preview (text-check.html)', () => {
  function ok(
    res: Awaited<ReturnType<typeof checkText>>
  ): Exclude<Awaited<ReturnType<typeof checkText>>, { error: string }> {
    if ('error' in res) throw new Error(res.error);
    return res;
  }

  it('reports sentences and distinct word counts without persisting anything', async () => {
    const { langId } = await setupEnglishText();
    const textsBefore = await localDb.texts.count();

    const res = ok(await checkText({ langId, text: 'The cat sat. The cat ran.' }));

    // Two sentences, reconstructed from the tokens.
    expect(res.sentences.length).toBe(2);
    expect(res.sentences.join(' ')).toContain('cat');

    // "cat" occurs twice; "the" twice; "sat"/"ran" once each.
    const cat = res.words.find((w) => w[0] === 'cat');
    expect(cat).toEqual(['cat', 2, '']);
    expect(res.words.find((w) => w[0] === 'sat')?.[1]).toBe(1);
    // The non-word list captures punctuation/whitespace.
    expect(res.nonWords.length).toBeGreaterThan(0);
    // Expression matching stays server-enhanced.
    expect(res.multiWords).toEqual([]);

    // Checking is a read-only diagnostic — no new text was created.
    expect(await localDb.texts.count()).toBe(textsBefore);
  });

  it('flags an already-saved word with its translation', async () => {
    const { langId } = await setupEnglishText();
    await addWithTranslation('cat', langId, 'gato');

    const res = ok(await checkText({ langId, text: 'The cat sat.' }));
    expect(res.words.find((w) => w[0] === 'cat')).toEqual(['cat', 1, 'gato']);
    // An unsaved word carries no translation (renders un-highlighted).
    expect(res.words.find((w) => w[0] === 'sat')?.[2]).toBe('');
  });

  it('errors on a missing language', async () => {
    expect('error' in (await checkText({ langId: 999999, text: 'hi' }))).toBe(true);
  });
});

describe('review path', () => {
  it('schedules a learned word and advances it on a correct answer', async () => {
    const { langId, textId } = await setupEnglishText();
    const snapshot = words(await getTextWords(textId));
    const cat = snapshot.words.find((w) => w.textLc === 'cat')!;

    // Save "cat" as a status-1 word with a translation.
    const full = await createFull({
      textId,
      position: cat.position,
      translation: 'feline',
      status: 1,
    });
    const termId = full.term!.id;

    // Backdate the status change so the word is due today.
    await localDb.words.update(termId, {
      statusChanged: Date.now() - 3 * 86_400_000,
    });

    const config = await getReviewConfig({ lang: langId });
    if ('error' in config) {
      throw new Error(config.error);
    }
    expect(config.progress.total).toBe(1);

    const next = await getNextWord({
      reviewKey: config.reviewKey,
      selection: config.selection,
      wordMode: true,
      lgId: langId,
      wordRegex: config.wordRegex,
      type: 0,
    });
    expect(next.term_id).toBe(termId);
    expect(next.solution).toBe('feline');

    // Answer correctly: status advances 1 -> 2 and it is no longer due.
    const updated = await updateStatus(termId, undefined, 1);
    expect(updated.status).toBe(2);

    const afterConfig = await getReviewConfig({ lang: langId });
    if ('error' in afterConfig) {
      throw new Error(afterConfig.error);
    }
    expect(afterConfig.progress.total).toBe(0);
  });

  it('does not surface words without a usable translation', async () => {
    const { langId, textId } = await setupEnglishText();
    const snapshot = words(await getTextWords(textId));
    const cat = snapshot.words.find((w) => w.textLc === 'cat')!;
    // Quick-create leaves translation empty; set a learning status + backdate.
    await setStatus((await createQuick(textId, cat.position, 99)).term_id!, 1);
    const w = await localDb.words.where('textLc').equals('cat').first();
    await localDb.words.update(w!.id!, { statusChanged: Date.now() - 5 * 86_400_000 });

    const tomorrow = await getTomorrowCount('local', `lang:${langId}`);
    expect(tomorrow.count).toBe(0); // no translation -> never reviewable
  });
});

describe('standalone term create (word-new.html)', () => {
  it('creates a term with no text context and stores every field', async () => {
    const { langId } = await setupEnglishText();
    const res = await createStandalone({
      langId,
      text: 'hello',
      status: 3,
      translation: 'a greeting',
      romanization: '',
      sentence: 'Say hello.',
      notes: 'informal',
      lemma: 'hello',
      tags: ['greeting'],
    });
    expect(res.success).toBe(true);
    expect(res.term!.id).toBeGreaterThan(0);
    expect(res.term!.tags).toContain('greeting');

    const row = await localDb.words.where('textLc').equals('hello').first();
    expect(row).toBeDefined();
    expect(row!.status).toBe(3);
    expect(row!.translation).toBe('a greeting');
    expect(row!.notes).toBe('informal');
  });

  it('links the new term into existing text occurrences', async () => {
    const { langId, textId } = await setupEnglishText();
    // "cat" appears twice in the sample text but has no word row yet.
    const res = await createStandalone({
      langId, text: 'cat', status: 5, translation: 'feline',
      romanization: '', sentence: '', notes: '', tags: [],
    });
    expect(res.success).toBe(true);

    const after = words(await getTextWords(textId));
    const cats = after.words.filter((w) => w.textLc === 'cat');
    expect(cats.length).toBe(2);
    expect(cats.every((w) => w.status === 5)).toBe(true);
  });

  it('rejects a duplicate term for the same language', async () => {
    const { langId } = await setupEnglishText();
    const first = await createStandalone({
      langId, text: 'dog', status: 1, translation: '',
      romanization: '', sentence: '', notes: '', tags: [],
    });
    expect(first.success).toBe(true);

    const dup = await createStandalone({
      langId, text: 'dog', status: 1, translation: '',
      romanization: '', sentence: '', notes: '', tags: [],
    });
    expect(dup.success).toBeUndefined();
    expect(dup.error).toBeDefined();
  });
});

describe('standalone term edit (word.html)', () => {
  it('loads a term by id, round-trips a full edit, and deletes it', async () => {
    const { textId } = await setupEnglishText();
    const snapshot = words(await getTextWords(textId));
    const cat = snapshot.words.find((w) => w.textLc === 'cat')!;

    const full = await createFull({
      textId,
      position: cat.position,
      translation: 'feline',
      romanization: 'kat',
      sentence: 'The {cat} sat.',
      notes: 'a note',
      status: 1,
      tags: ['animal'],
    });
    const termId = full.term!.id;

    // GET /terms/{id} returns the full editable shape — incl. notes + tags, which
    // the form prefills (the server's GET omits them; offline we have them).
    const loaded = await getTerm(termId);
    if ('error' in loaded) {
      throw new Error(loaded.error);
    }
    expect(loaded.text).toBe('cat');
    expect(loaded.translation).toBe('feline');
    expect(loaded.romanization).toBe('kat');
    expect(loaded.notes).toBe('a note');
    expect(loaded.status).toBe(1);
    expect(loaded.tags).toEqual(['animal']);

    // The form's save (updateFull) changes every field; reload reflects it.
    await updateFull(termId, {
      translation: 'a cat',
      romanization: 'neko',
      sentence: 'The {cat} ran.',
      notes: 'updated',
      lemma: 'cat',
      status: 3,
      tags: ['animal', 'noun'],
    });
    const after = await getTerm(termId);
    if ('error' in after) {
      throw new Error(after.error);
    }
    expect(after.translation).toBe('a cat');
    expect(after.status).toBe(3);
    expect(after.lemma).toBe('cat');
    expect((after.tags ?? []).sort()).toEqual(['animal', 'noun']);

    // The form's delete removes it; a subsequent load errors.
    expect(await deleteTerm(termId)).toEqual({ deleted: true });
    expect(await getTerm(termId)).toEqual({ error: 'Term not found' });
  });
});

describe('seeding', () => {
  it('seeds languages and sample texts on first run only', async () => {
    const first = await seedIfNeeded();
    expect(first).toBe(true);
    const langCount = await localDb.languages.count();
    expect(langCount).toBeGreaterThan(0);
    const textCount = await localDb.texts.count();
    expect(textCount).toBeGreaterThan(0);

    // A seeded text actually parsed into readable words.
    const someText = await localDb.texts.toCollection().first();
    const resp = words(await getTextWords(someText!.id!));
    expect(resp.words.some((w) => !w.isNotWord)).toBe(true);

    // Idempotent.
    const second = await seedIfNeeded();
    expect(second).toBe(false);
  });
});
