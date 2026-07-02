/**
 * Term (word) repository — the save/learn side of the read path: quick status
 * marks, quick-create, full create/update, translations and deletion. New and
 * changed words are linked to their text occurrences so the reader updates.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalOccurrence, type LocalWord } from '../schema';
import { nextStatus } from '../review-scoring';
import { toClassName } from '../class-name';
import {
  applyStatus,
  buildWordRow,
  findWord,
  linkWordOccurrences,
  nowMs,
  unlinkWordOccurrences,
  type WordFields,
} from './helpers';
import { getWordTagNames } from './tags';
import { remoteLemmatize, lemmatizerFor } from '@shared/offline/nlp/lemmatize';
import type {
  Term,
  TermStatusResponse,
  TermQuickCreateResponse,
  TermTranslationResponse,
  TermDeleteResponse,
  TermCreateFullRequest,
  TermCreateStandaloneRequest,
  TermUpdateFullRequest,
  TermFullResponse,
  TermForEditResponse,
} from '@modules/vocabulary/api/terms_api';

/**
 * Best-effort dictionary form for a new term. A user-provided lemma always
 * wins; otherwise, for Korean (Kiwi), ask the optional NLP server. Returns ''
 * when none is available so the save never blocks on the network. Scoped to
 * Korean for now — dropping the `lemmatizerFor` guard would extend it to the
 * spaCy languages too.
 */
async function resolveLemma(
  langId: number,
  text: string,
  provided?: string
): Promise<string> {
  if (provided && provided.trim() !== '') {
    return provided;
  }
  const language = await localDb.languages.get(langId);
  if (!language || lemmatizerFor(language.code) !== 'kiwi') {
    return '';
  }
  return (await remoteLemmatize(text, language.code)) ?? '';
}

/** Fetch a single occurrence by text + position. */
async function getOccurrence(
  textId: number,
  position: number
): Promise<LocalOccurrence | undefined> {
  return localDb.occurrences.where('[textId+order]').equals([textId, position]).first();
}

/** Build the `term` payload returned by create/update-full. */
function termPayload(
  word: LocalWord,
  tags: string[] = []
): NonNullable<TermFullResponse['term']> {
  return {
    id: word.id ?? 0,
    text: word.text,
    textLc: word.textLc,
    lemma: word.lemma,
    lemmaLc: word.lemmaLc,
    hex: toClassName(word.textLc),
    translation: word.translation,
    romanization: word.romanization,
    sentence: word.sentence,
    status: word.status,
    tags,
  };
}

/** Replace a word's tags (create missing tag rows as needed). */
async function setWordTags(woId: number, tags: string[] | undefined): Promise<void> {
  if (!tags) {
    return;
  }
  await localDb.wordTags.where('woId').equals(woId).delete();
  for (const text of tags) {
    const name = text.trim();
    if (name === '') {
      continue;
    }
    let tag = await localDb.tags.where('text').equals(name).first();
    if (!tag) {
      const id = (await localDb.tags.add({ text: name, comment: '' })) as number;
      tag = { id, text: name, comment: '' };
    }
    if (tag.id != null) {
      await localDb.wordTags.add({ woId, tgId: tag.id });
    }
  }
}

/** Set a term's status to an absolute value. */
export async function setStatus(
  termId: number,
  status: number
): Promise<TermStatusResponse> {
  const result = await applyStatus(termId, status);
  if (result == null) {
    return { error: 'Term not found' };
  }
  return { set: status };
}

/** Nudge a term's status up or down by one learning level. */
export async function incrementStatus(
  termId: number,
  direction: 'up' | 'down'
): Promise<TermStatusResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { error: 'Term not found' };
  }
  const next = nextStatus(word.status, direction === 'up');
  await applyStatus(termId, next);
  return { set: next, increment: direction };
}

/**
 * Quick-create a word at a text position with a terminal status (98 ignored /
 * 99 well-known), with no translation needed.
 */
export async function createQuick(
  textId: number,
  position: number,
  status: 98 | 99
): Promise<TermQuickCreateResponse> {
  const occ = await getOccurrence(textId, position);
  if (!occ) {
    return { error: 'Word position not found' };
  }
  const existing = await findWord(occ.langId, occ.textLc);
  if (existing && existing.id != null) {
    await applyStatus(existing.id, status);
    return { term_id: existing.id, term_lc: occ.textLc };
  }
  const id = (await localDb.words.add(
    buildWordRow(occ.langId, occ.text, status)
  )) as number;
  await linkWordOccurrences(id, occ.langId, occ.textLc);
  return { term_id: id, term_lc: occ.textLc };
}

/**
 * Load a single term's full editable data by id (backs `GET /terms/{id}`).
 *
 * Superset of the server's `GET /terms/{id}`, which omits `notes` and `tags`:
 * offline we can return them so the standalone edit form (`word.html`) prefills
 * every field on-device. In server-backed mode the server omits notes/tags *and*
 * its PUT ignores them, so the form degrades gracefully without clobbering them.
 */
export async function getTerm(termId: number): Promise<Term | { error: string }> {
  const word = await localDb.words.get(termId);
  if (!word || word.id == null) {
    return { error: 'Term not found' };
  }
  return {
    id: word.id,
    text: word.text,
    textLc: word.textLc,
    lemma: word.lemma,
    lemmaLc: word.lemmaLc,
    translation: word.translation,
    romanization: word.romanization,
    notes: word.notes,
    sentence: word.sentence,
    status: word.status,
    langId: word.langId,
    tags: await getWordTagNames(word.id),
  };
}

/** Update an existing term's translation. */
export async function updateTranslation(
  termId: number,
  translation: string
): Promise<TermTranslationResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { error: 'Term not found' };
  }
  await localDb.words.update(termId, { translation, updatedAt: nowMs() });
  return { update: translation, term_id: termId, term_lc: word.textLc };
}

/** Create a word (status 1) with a translation, outside the reader. */
export async function addWithTranslation(
  text: string,
  langId: number,
  translation: string
): Promise<TermTranslationResponse> {
  const textLc = text.toLowerCase();
  const existing = await findWord(langId, textLc);
  if (existing && existing.id != null) {
    await localDb.words.update(existing.id, { translation, updatedAt: nowMs() });
    return { update: translation, term_id: existing.id, term_lc: textLc };
  }
  const lemma = await resolveLemma(langId, text);
  const id = (await localDb.words.add(
    buildWordRow(langId, text, 1, { translation, lemma })
  )) as number;
  await linkWordOccurrences(id, langId, textLc);
  return { add: translation, term_id: id, term_lc: textLc };
}

/** Create a fully-specified word from a text position. */
export async function createFull(
  req: TermCreateFullRequest
): Promise<TermFullResponse> {
  const occ = await getOccurrence(req.textId, req.position);
  if (!occ) {
    return { error: 'Word position not found' };
  }
  const fields: WordFields = {
    translation: req.translation,
    romanization: req.romanization,
    sentence: req.sentence,
    notes: req.notes,
    lemma: await resolveLemma(occ.langId, occ.text, req.lemma),
  };
  const existing = await findWord(occ.langId, occ.textLc);
  const row = buildWordRow(occ.langId, occ.text, req.status, fields);
  let id: number;
  if (existing && existing.id != null) {
    id = existing.id;
    await localDb.words.update(id, { ...row, created: existing.created });
  } else {
    id = (await localDb.words.add(row)) as number;
  }
  await linkWordOccurrences(id, occ.langId, occ.textLc);
  await setWordTags(id, req.tags);
  const saved = await localDb.words.get(id);
  return { success: true, term: termPayload(saved ?? row, await getWordTagNames(id)) };
}

/**
 * Create a term outside of any text (the standalone "new term" form). Mirrors
 * createFull but takes the language + text directly, so a term can be created
 * with no text occurrence. Still links the new word into any matching existing
 * text occurrences so the reader reflects it.
 */
export async function createStandalone(
  req: TermCreateStandaloneRequest
): Promise<TermFullResponse> {
  const text = req.text.trim();
  if (!req.langId || text === '') {
    return { error: 'Language and text are required' };
  }
  const textLc = text.toLowerCase();
  const existing = await findWord(req.langId, textLc);
  if (existing && existing.id != null) {
    return { error: `Duplicate entry for "${textLc}"` };
  }
  const fields: WordFields = {
    translation: req.translation,
    romanization: req.romanization,
    sentence: req.sentence,
    notes: req.notes,
    lemma: await resolveLemma(req.langId, text, req.lemma),
  };
  const row = buildWordRow(req.langId, text, req.status, fields);
  const id = (await localDb.words.add(row)) as number;
  await linkWordOccurrences(id, req.langId, textLc);
  await setWordTags(id, req.tags);
  const saved = await localDb.words.get(id);
  return { success: true, term: termPayload(saved ?? row, await getWordTagNames(id)) };
}

/** Update a fully-specified word by id. */
export async function updateFull(
  termId: number,
  req: TermUpdateFullRequest
): Promise<TermFullResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { error: 'Term not found' };
  }
  const now = nowMs();
  const statusChanged = req.status !== word.status ? now : word.statusChanged;
  await localDb.words.update(termId, {
    translation: req.translation,
    romanization: req.romanization ?? '',
    sentence: req.sentence ?? '',
    notes: req.notes ?? '',
    lemma: req.lemma ?? '',
    lemmaLc: (req.lemma ?? '').toLowerCase(),
    status: req.status,
    statusChanged,
    updatedAt: now,
  });
  if (req.status !== word.status) {
    await applyStatus(termId, req.status);
  }
  await setWordTags(termId, req.tags);
  const saved = await localDb.words.get(termId);
  return { success: true, term: termPayload(saved ?? word, await getWordTagNames(termId)) };
}

/** Delete a term and unlink its occurrences. */
export async function deleteTerm(termId: number): Promise<TermDeleteResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { error: 'Term not found' };
  }
  await unlinkWordOccurrences(termId);
  await localDb.wordTags.where('woId').equals(termId).delete();
  await localDb.words.delete(termId);
  return { deleted: true };
}

/** Build the edit-form payload for a (possibly new) word at a text position. */
export async function getForEdit(
  textId: number,
  position: number,
  wordId?: number
): Promise<TermForEditResponse | { error: string }> {
  const occ = await getOccurrence(textId, position);
  const text = await localDb.texts.get(textId);
  if (!text) {
    return { error: 'Text not found' };
  }
  const language = await localDb.languages.get(text.langId);
  if (!language) {
    return { error: 'Language not found' };
  }

  let word: LocalWord | undefined;
  if (wordId) {
    word = await localDb.words.get(wordId);
  } else if (occ) {
    word = await findWord(occ.langId, occ.textLc);
  }

  const termText = word?.text ?? occ?.text ?? '';
  const termLc = word?.textLc ?? occ?.textLc ?? '';

  // Example sentence: the occurrence's sentence with the term marked as {term}.
  let sentence = word?.sentence ?? '';
  if (!sentence && occ) {
    const se = await localDb.sentences.get(occ.sentenceId);
    if (se) {
      sentence = se.text.replace(termText, `{${termText}}`);
    }
  }

  const allTags = (await localDb.tags.toArray()).map((t) => t.text);
  const termTags = word?.id != null ? await getWordTagNames(word.id) : [];

  return {
    isNew: !word,
    term: {
      id: word?.id ?? null,
      text: termText,
      textLc: termLc,
      lemma: word?.lemma ?? '',
      lemmaLc: word?.lemmaLc ?? '',
      hex: toClassName(termLc),
      translation: word?.translation ?? '',
      romanization: word?.romanization ?? '',
      sentence,
      notes: word?.notes ?? '',
      status: word?.status ?? 1,
      tags: termTags,
    },
    language: {
      id: language.id ?? 0,
      name: language.name,
      showRomanization: language.showRomanization,
      translateUri: language.translatorUri,
    },
    allTags,
    similarTerms: [],
  };
}
