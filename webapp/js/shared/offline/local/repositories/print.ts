/**
 * Plain-print items for the bundled client.
 *
 * Backs `GET /texts/{id}/print-items` on-device: turns a text's stored
 * occurrences (+ the words they resolve to) into the `PrintItem[]` / `PrintConfig`
 * the print component renders — the same data the reader assembles. This mirrors
 * the server's `TextPrintService::getTextItemsForApi` + `preparePlainPrintData`
 * (see `TextAnnotationApiHandler::getPrintItems`).
 *
 * This is the offline-capable half of the print view: plain print with
 * per-status word annotations. The "improved annotated text" (the annotated /
 * edit modes) is a server-only feature — it persists a hand-edited annotation
 * blob the bundle has no on-device store for — so those modes stay server-backed
 * and the bundled page is plain-only (`hasAnnotation` is always false here).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalWord } from '../schema';
import { buildWordTagIndex, buildTagNameIndex } from './tags';
import { getSetting } from './settings';
import type {
  PrintItem,
  PrintItemsResponse,
} from '@modules/text/api/texts_api';

/** Default print filters, mirroring `TextPrintService`'s setting getters. */
const DEFAULT_ANN = 3; // romanization + translation
const DEFAULT_STATUS = 14; // status range 1..4
const DEFAULT_PLACEMENT = 0; // behind the term

/** Read an integer setting, falling back like the PHP `get*Setting(null)`. */
async function settingInt(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key, '');
  return raw !== '' ? parseInt(raw, 10) : fallback;
}

/**
 * Build the plain-print items + config for a text, fully on-device.
 * Returns `{ error }` (which the local router surfaces) when the text or its
 * language is missing.
 */
export async function getPrintItems(
  textId: number
): Promise<PrintItemsResponse | { error: string }> {
  const text = await localDb.texts.get(textId);
  if (!text || text.deletedAt != null) {
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

  // Word tags back the "show tags" annotation option, joined like the server's
  // `getWordTagList` (`implode(', ', ...)`). Built once rather than per word.
  const tagIdsByWord = await buildWordTagIndex();
  const tagNameById = await buildTagNameIndex();
  const tagsFor = (woId: number): string =>
    (tagIdsByWord.get(woId) ?? [])
      .map((id) => tagNameById.get(id) ?? '')
      .filter((name) => name !== '')
      .join(', ');

  const items: PrintItem[] = occ.map((o) => {
    if (!o.isWord) {
      return {
        position: o.order,
        text: o.text,
        // Paragraph breaks are non-word tokens carrying the ¶ marker (the
        // local parser inserts them); the component turns these into <p> breaks.
        isParagraph: o.text.includes('¶'),
        isWord: false,
        wordId: null,
        status: null,
        translation: '',
        romanization: '',
        tags: '',
      };
    }
    const word = o.woId != null ? wordsById.get(o.woId) : undefined;
    // The bare `*` marker means "no gloss" (matches getTextItemsForApi).
    const translation = word?.translation === '*' ? '' : word?.translation ?? '';
    return {
      position: o.order,
      text: o.text,
      isParagraph: false,
      isWord: true,
      wordId: word?.id ?? null,
      status: word ? word.status : null,
      translation,
      romanization: (word?.romanization ?? '').trim(),
      tags: word?.id != null ? tagsFor(word.id) : '',
    };
  });

  return {
    items,
    config: {
      textId,
      title: text.title,
      sourceUri: text.sourceUri ?? '',
      audioUri: (text.audioUri ?? '').trim(),
      langId: text.langId,
      textSize: language.textSize,
      rtlScript: language.rightToLeft,
      // No on-device annotation store — the improved annotated text is
      // server-only, so plain print is all the bundle offers.
      hasAnnotation: false,
      savedAnn: await settingInt('currentprintannotation', DEFAULT_ANN),
      savedStatus: await settingInt('currentprintstatus', DEFAULT_STATUS),
      savedPlacement: await settingInt('currentprintannotationplacement', DEFAULT_PLACEMENT),
    },
  };
}
