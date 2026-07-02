/**
 * Text repository — on-device text import, reading, statistics and bulk
 * actions. This is where a raw text becomes sentences + word-occurrences via
 * the local tokenizer, freeing the read path from the server.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalLanguage, type LocalText, type LocalWord } from '../schema';
import { parseText, type ParserResult } from '../parser';
import { remoteParse, serverParserFor } from '@shared/offline/nlp/parse';
import {
  buildStructures,
  toLocalOccurrences,
  assembleTextWords,
  buildReadingConfig,
  lowerCaseTerm,
} from '../text-assembly';
import {
  WordStatus,
} from '../schema';
import {
  buildWordRow,
  languageToParserConfig,
  nowMs,
} from './helpers';
import { setTextTags, getTextTagNames, clearTextTags } from './tags';
import type {
  TextCreateRequest,
  TextCreateResponse,
  TextRecord,
  TextUpdateRequest,
  TextUpdateResponse,
  TextWordsResponse,
  TextCheckRequest,
  TextCheckResult,
  TextCheckWordRow,
  TextCheckNonWordRow,
  MarkAllResponse,
  MarkedWordData,
} from '@modules/text/api/texts_api';
import { toClassName } from '../class-name';

/**
 * Tokenize a text with the best tokenizer available: the optional server parser
 * for languages whose on-device tokenizer is coarse (Korean → Kiwi morphemes),
 * falling back to the on-device parser when there is no server or the server
 * result can't be trusted. Never blocks the offline path — `remoteParse` fails
 * soft and times out.
 */
async function parseBest(
  rawText: string,
  language: LocalLanguage
): Promise<ParserResult> {
  const config = languageToParserConfig(language);
  const parser = serverParserFor(language.code);
  if (parser && rawText.trim() !== '') {
    const remote = await remoteParse(rawText, parser);
    if (remote) {
      return remote;
    }
  }
  return parseText(rawText, config);
}

/**
 * (Re)parse a text's body into sentences + occurrences, linking occurrences to
 * any existing words. Replaces previously stored structures for the text.
 */
async function storeParsedText(
  textId: number,
  language: LocalLanguage,
  rawText: string
): Promise<void> {
  const langId = language.id ?? 0;
  const parse = await parseBest(rawText, language);
  const built = buildStructures(parse);

  const words = await localDb.words
    .where('langId')
    .equals(langId)
    .and((w) => w.deletedAt == null)
    .toArray();
  const wordIdByTextLc = new Map<string, number>();
  for (const w of words) {
    if (w.id != null) {
      wordIdByTextLc.set(w.textLc, w.id);
    }
  }

  await localDb.transaction('rw', localDb.sentences, localDb.occurrences, async () => {
    await localDb.sentences.where('textId').equals(textId).delete();
    await localDb.occurrences.where('textId').equals(textId).delete();

    const sentenceIdByOrder = new Map<number, number>();
    for (const s of built.sentences) {
      const id = await localDb.sentences.add({
        langId,
        textId,
        order: s.order,
        text: s.text,
        firstPos: s.firstPos,
      });
      sentenceIdByOrder.set(s.order, id);
    }

    const occ = toLocalOccurrences(
      built.occurrences,
      textId,
      langId,
      sentenceIdByOrder,
      wordIdByTextLc
    );
    await localDb.occurrences.bulkAdd(occ);
  });
}

/** Create a text and parse it on-device. */
export async function createText(
  req: TextCreateRequest
): Promise<TextCreateResponse> {
  const language = await localDb.languages.get(req.langId);
  if (!language) {
    return { error: 'Language not found' };
  }
  const now = nowMs();
  const id = await localDb.texts.add({
    langId: req.langId,
    title: req.title,
    text: req.text,
    audioUri: req.audioUri ?? null,
    sourceUri: req.sourceUri ?? null,
    position: 0,
    audioPosition: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await storeParsedText(id, language, req.text);
  await setTextTags(id as number, req.tags);
  return { id };
}

/**
 * Load one text's editable fields for the bundled edit form (local-first only —
 * the server has no `/api/v1/texts/{id}` GET; see TextRecord).
 */
export async function getText(
  id: number
): Promise<TextRecord | { error: string }> {
  const t = await localDb.texts.get(id);
  if (!t || t.deletedAt != null) {
    return { error: 'Text not found' };
  }
  return {
    id: t.id ?? id,
    langId: t.langId,
    title: t.title,
    text: t.text,
    sourceUri: t.sourceUri ?? '',
    audioUri: t.audioUri ?? '',
    tags: await getTextTagNames(id),
    archived: t.archivedAt != null,
  };
}

/**
 * Update one text's editable fields. Re-parses (rebuilds sentences +
 * occurrences) when the body or language changed, so the reader reflects the
 * edit. Mirrors the server's web-route "save text and reparse"; local-first only.
 */
export async function updateText(
  id: number,
  req: TextUpdateRequest
): Promise<TextUpdateResponse> {
  const t = await localDb.texts.get(id);
  if (!t || t.deletedAt != null) {
    return { updated: false, error: 'Text not found' };
  }
  const langId = req.langId || t.langId;
  const language = await localDb.languages.get(langId);
  if (!language) {
    return { updated: false, error: 'Language not found' };
  }
  const now = nowMs();
  const reparse = req.text !== t.text || langId !== t.langId;
  await localDb.texts.update(id, {
    langId,
    title: req.title,
    text: req.text,
    sourceUri: req.sourceUri ?? null,
    audioUri: req.audioUri ?? null,
    updatedAt: now,
  });
  if (reparse) {
    await storeParsedText(id, language, req.text);
  }
  // Always pass an array (even empty) so cleared tags are actually removed —
  // setTextTags only no-ops on `undefined`.
  await setTextTags(id, req.tags ?? []);
  return { updated: true, reparsed: reparse };
}

/** Re-parse every text in a language (after parsing settings change). */
export async function reparseLanguage(langId: number): Promise<number> {
  const language = await localDb.languages.get(langId);
  if (!language) {
    return 0;
  }
  const texts = await localDb.texts
    .where('langId')
    .equals(langId)
    .and((t) => t.deletedAt == null)
    .toArray();
  for (const text of texts) {
    if (text.id != null) {
      await storeParsedText(text.id, language, text.text);
    }
  }
  return texts.length;
}

/** Load a text's words + reading config for the reader. */
export async function getTextWords(
  textId: number
): Promise<TextWordsResponse | { error: string }> {
  const text = await localDb.texts.get(textId);
  if (!text) {
    return { error: 'Text not found' };
  }
  const language = await localDb.languages.get(text.langId);
  if (!language) {
    return { error: 'Language not found' };
  }

  const occ = await localDb.occurrences
    .where('textId')
    .equals(textId)
    .sortBy('order');

  const ids = [
    ...new Set(occ.map((o) => o.woId).filter((x): x is number => x != null)),
  ];
  const wordsById = new Map<number, LocalWord>();
  for (const w of await localDb.words.bulkGet(ids)) {
    if (w && w.id != null) {
      wordsById.set(w.id, w);
    }
  }

  return {
    words: assembleTextWords(occ, wordsById),
    config: buildReadingConfig(text, language),
  };
}

/**
 * Preview how a raw text parses for a language — the on-device equivalent of the
 * server's "check a text" tool (`TextParsingPersistence::checkValid` +
 * `displayStatistics`). Tokenizes with the local parser, then reports the
 * reconstructed sentences and the distinct word / non-word tokens with their
 * occurrence counts; each word carries its saved translation (`''` when unknown,
 * which the UI flags as already-saved). Multi-word expression matching stays
 * server-enhanced (multi-word terms are not created on-device), so `multiWords`
 * is always empty here. Local-first only — the server's `/text/check` is a
 * native web-route form, not `/api/v1`.
 */
export async function checkText(
  req: TextCheckRequest
): Promise<TextCheckResult | { error: string }> {
  const language = await localDb.languages.get(req.langId);
  if (!language) {
    return { error: 'Language not found' };
  }

  const parse = parseText(req.text, languageToParserConfig(language));

  // Reconstruct each sentence by concatenating its tokens in reading order,
  // mirroring the server's GROUP_CONCAT(text ORDER BY position SEPARATOR '').
  const sentenceText = new Map<number, string>();
  for (const token of parse.tokens) {
    sentenceText.set(
      token.sentenceIndex,
      (sentenceText.get(token.sentenceIndex) ?? '') + token.text
    );
  }
  const sentences = [...sentenceText.keys()]
    .sort((a, b) => a - b)
    .map((i) => sentenceText.get(i) ?? '');

  // Group distinct tokens (case-insensitively) into words vs non-words, the way
  // the server GROUPs by LOWER(text) and splits on word_count.
  const wordCounts = new Map<string, number>();
  const nonWordCounts = new Map<string, number>();
  for (const token of parse.tokens) {
    const lc = lowerCaseTerm(token.text);
    const bucket = token.isWord ? wordCounts : nonWordCounts;
    bucket.set(lc, (bucket.get(lc) ?? 0) + 1);
  }

  // Saved-word translations for this language, to flag already-known words (the
  // server's LEFT JOIN words ON text_lc). A blank translation is still "saved"
  // but renders un-highlighted, matching the server's red = non-empty rule.
  const transByLc = new Map<string, string>();
  for (const w of await localDb.words
    .where('langId')
    .equals(req.langId)
    .and((w) => w.deletedAt == null)
    .toArray()) {
    transByLc.set(w.textLc, w.translation ?? '');
  }

  const words: TextCheckWordRow[] = [...wordCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lc, count]): TextCheckWordRow => [lc, count, transByLc.get(lc) ?? '']);

  const nonWords: TextCheckNonWordRow[] = [...nonWordCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lc, count]): TextCheckNonWordRow => [lc, count]);

  return {
    sentences,
    words,
    multiWords: [],
    nonWords,
    rtlScript: language.rightToLeft,
  };
}

/** Audio config for the reader's player (mirrors `GET /texts/{id}/audio`). */
export async function getAudioInfo(textId: number): Promise<{
  uri: string;
  position: number;
  playerSettings: { repeatMode: boolean; skipSeconds: number; playbackRate: number };
}> {
  const text = await localDb.texts.get(textId);
  // The player only reveals itself when `uri` is non-empty, so a pasted text
  // with no audio resolves to a hidden player rather than a failed request.
  return {
    uri: text?.audioUri ?? '',
    position: text?.audioPosition ?? 0,
    playerSettings: { repeatMode: false, skipSeconds: 5, playbackRate: 1 },
  };
}

/** Per-text word-status statistics (the library list's `TextStats` shape). */
export interface LibraryTextStats {
  total: number;
  saved: number;
  unknown: number;
  unknownPercent: number;
  /** Running-word counts per status string ("1".."5","98","99"); 0 is `unknown`. */
  statusCounts: Record<string, number>;
}

/**
 * Word-status counts for one or more texts, keyed by text id as a string.
 *
 * Mirrors the server's `/texts/statistics` response: the library page iterates
 * the result with `Object.entries` and reads `total`/`saved`/`unknown`/
 * `unknownPercent`/`statusCounts` per text, so this returns a per-text map (not
 * an aggregate). Counts are over running words (word occurrences).
 */
export async function getStatistics(
  textIds: number[]
): Promise<Record<string, LibraryTextStats>> {
  const result: Record<string, LibraryTextStats> = {};

  for (const textId of textIds) {
    const occ = await localDb.occurrences
      .where('textId')
      .equals(textId)
      .and((o) => o.isWord)
      .toArray();
    const ids = [
      ...new Set(occ.map((o) => o.woId).filter((x): x is number => x != null)),
    ];
    const wordsById = new Map<number, LocalWord>();
    for (const w of await localDb.words.bulkGet(ids)) {
      if (w && w.id != null) {
        wordsById.set(w.id, w);
      }
    }

    let total = 0;
    let unknown = 0;
    const statusCounts: Record<string, number> = {};
    for (const o of occ) {
      total += 1;
      const word = o.woId != null ? wordsById.get(o.woId) : undefined;
      const status = word ? word.status : WordStatus.UNKNOWN;
      if (status === WordStatus.UNKNOWN) {
        unknown += 1;
      } else {
        const key = String(status);
        statusCounts[key] = (statusCounts[key] ?? 0) + 1;
      }
    }

    result[String(textId)] = {
      total,
      saved: total - unknown,
      unknown,
      unknownPercent: total > 0 ? Math.round((unknown / total) * 100) : 0,
      statusCounts,
    };
  }

  return result;
}

/** A library list item (mirrors `texts_grouped_app`'s `TextItem`). */
export interface LibraryTextItem {
  id: number;
  title: string;
  has_audio: boolean;
  source_uri: string;
  has_source: boolean;
  annotated: boolean;
  taglist: string;
}

/** Paginated text list, matching the `/texts/by-language` response shape. */
export interface TextsByLanguageResult {
  texts: LibraryTextItem[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

/** Order texts like the server's sort map `['title','id desc','id asc']`. */
function sortTexts(texts: LocalText[], sort: number): LocalText[] {
  const arr = [...texts];
  switch (sort) {
    case 2: // newest first (id desc)
      return arr.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    case 3: // oldest first (id asc)
      return arr.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    case 1:
    default: // title A–Z (title)
      return arr.sort((a, b) => a.title.localeCompare(b.title));
  }
}

/** Page through a language's active or archived texts for the library list. */
async function listTextsByLanguage(
  langId: number,
  page: number,
  perPage: number,
  sort: number,
  archived: boolean
): Promise<TextsByLanguageResult> {
  const all = await localDb.texts
    .where('langId')
    .equals(langId)
    .and(
      (t) => t.deletedAt == null && (archived ? t.archivedAt != null : t.archivedAt == null)
    )
    .toArray();

  const sorted = sortTexts(all, sort);
  const total = sorted.length;
  const perPageClamped = Math.max(1, Math.min(100, perPage || 10));
  const totalPages = Math.max(1, Math.ceil(total / perPageClamped));
  const currentPage = Math.max(1, Math.min(page || 1, totalPages));
  const start = (currentPage - 1) * perPageClamped;

  const pageItems = sorted.slice(start, start + perPageClamped);
  const texts = await Promise.all(
    pageItems.map(async (t) => ({
      id: t.id ?? 0,
      title: t.title,
      has_audio: !!(t.audioUri && t.audioUri !== ''),
      source_uri: t.sourceUri ?? '',
      has_source: !!(t.sourceUri && t.sourceUri !== ''),
      // Annotated texts are not modelled locally yet.
      annotated: false,
      taglist: (await getTextTagNames(t.id ?? 0)).join(', '),
    }))
  );

  return {
    texts,
    pagination: {
      current_page: currentPage,
      per_page: perPageClamped,
      total,
      total_pages: totalPages,
    },
  };
}

/** Active texts for a language (the library landing list). */
export function getTextsByLanguage(
  langId: number,
  page: number,
  perPage: number,
  sort: number
): Promise<TextsByLanguageResult> {
  return listTextsByLanguage(langId, page, perPage, sort, false);
}

/** Archived texts for a language. */
export function getArchivedTextsByLanguage(
  langId: number,
  page: number,
  perPage: number,
  sort: number
): Promise<TextsByLanguageResult> {
  return listTextsByLanguage(langId, page, perPage, sort, true);
}

/** Archive or delete a set of texts (soft-delete / tombstone). */
export async function bulkAction(
  action: 'archive' | 'delete',
  ids: number[]
): Promise<{ count: number }> {
  const now = nowMs();
  if (action === 'archive') {
    await localDb.texts.bulkUpdate(
      ids.map((id) => ({ key: id, changes: { archivedAt: now, updatedAt: now } }))
    );
  } else {
    await localDb.texts.bulkUpdate(
      ids.map((id) => ({ key: id, changes: { deletedAt: now, updatedAt: now } }))
    );
    for (const id of ids) {
      await localDb.occurrences.where('textId').equals(id).delete();
      await localDb.sentences.where('textId').equals(id).delete();
      await clearTextTags(id);
    }
  }
  return { count: ids.length };
}

/**
 * Archive a single text (mirrors the web route `POST /texts/{id}/archive`).
 *
 * The on-device model keeps active and archived texts in one store, flagged by
 * `archivedAt`, so archiving is a soft state flip — symmetric with
 * {@link unarchiveText} and reversible.
 */
export async function archiveText(
  id: number
): Promise<{ archived: boolean } | { error: string }> {
  const text = await localDb.texts.get(id);
  if (!text || text.deletedAt != null) {
    return { error: 'Text not found' };
  }
  const now = nowMs();
  await localDb.texts.update(id, { archivedAt: now, updatedAt: now });
  return { archived: true };
}

/** Restore a single archived text (mirrors `POST /texts/{id}/unarchive`). */
export async function unarchiveText(
  id: number
): Promise<{ unarchived: boolean } | { error: string }> {
  const text = await localDb.texts.get(id);
  if (!text || text.deletedAt != null) {
    return { error: 'Text not found' };
  }
  const now = nowMs();
  await localDb.texts.update(id, { archivedAt: null, updatedAt: now });
  return { unarchived: true };
}

/**
 * Delete a single text (mirrors the web route `DELETE /texts/{id}`).
 *
 * Tombstones the row and drops its parsed structures + tags, the same way
 * {@link bulkAction}'s delete branch does for a set. Works for active and
 * archived texts alike (the on-device store is unified).
 */
export async function deleteText(
  id: number
): Promise<{ deleted: boolean } | { error: string }> {
  const text = await localDb.texts.get(id);
  if (!text || text.deletedAt != null) {
    return { error: 'Text not found' };
  }
  const now = nowMs();
  await localDb.texts.update(id, { deletedAt: now, updatedAt: now });
  await localDb.occurrences.where('textId').equals(id).delete();
  await localDb.sentences.where('textId').equals(id).delete();
  await clearTextTags(id);
  return { deleted: true };
}

/**
 * Mark every still-unknown word in a text with a terminal status (well-known or
 * ignored), creating the word rows and linking occurrences.
 */
async function markAll(textId: number, status: number): Promise<MarkAllResponse> {
  const text = await localDb.texts.get(textId);
  if (!text) {
    return { count: 0 };
  }
  const langId = text.langId;
  const occ = await localDb.occurrences
    .where('textId')
    .equals(textId)
    .and((o) => o.isWord && o.woId == null)
    .toArray();

  const seen = new Map<string, MarkedWordData>();
  for (const o of occ) {
    if (seen.has(o.textLc)) {
      continue;
    }
    const woId = (await localDb.words.add(
      buildWordRow(langId, o.text, status)
    )) as number;
    await localDb.occurrences
      .where('[langId+textLc]')
      .equals([langId, o.textLc])
      .and((x) => x.isWord)
      .modify({ woId });
    seen.set(o.textLc, {
      wid: woId,
      hex: toClassName(o.textLc),
      term: o.text,
      status,
    });
  }

  return { count: seen.size, words: [...seen.values()] };
}

/** Mark all unknown words well-known (status 99). */
export function markAllWellKnown(textId: number): Promise<MarkAllResponse> {
  return markAll(textId, WordStatus.WELL_KNOWN);
}

/** Mark all unknown words ignored (status 98). */
export function markAllIgnored(textId: number): Promise<MarkAllResponse> {
  return markAll(textId, WordStatus.IGNORED);
}
