/**
 * Tag repository — the on-device mirror of the PHP Tags module
 * (`src/Modules/Tags`). Term (word) tag rows are written by the term repository
 * (`setWordTags` in `terms.ts`); text tags are written here. This module owns:
 *
 * - the `/tags`, `/tags/term`, `/tags/text` list endpoints (tag autocomplete +
 *   the vocabulary/library filter dropdowns), mirroring
 *   `TagsFacade::getAllTermTags()` / `getAllTextTags()`;
 * - the word→tag index used to filter the vocabulary list by tag;
 * - text-tag read/write so the library list can show a text's `taglist`.
 *
 * Like the server, tag rows persist independently of their mappings: a tag that
 * is unassigned from its last term still appears in the autocomplete list.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb } from '../schema';
import type {
  TagsManageResponse,
  TagMutationResponse,
} from '@modules/tags/api/tags_api';

/** All term (word) tag names, sorted — mirrors `TagsFacade::getAllTermTags()`. */
export async function getAllTermTags(): Promise<string[]> {
  const tags = await localDb.tags.toArray();
  return tags.map((t) => t.text).sort((a, b) => a.localeCompare(b));
}

/** All text tag names, sorted — mirrors `TagsFacade::getAllTextTags()`. */
export async function getAllTextTags(): Promise<string[]> {
  const tags = await localDb.textTags.toArray();
  return tags.map((t) => t.text).sort((a, b) => a.localeCompare(b));
}

/** Both tag lists — mirrors `GET /tags` (`{ term, text }`). */
export async function getAllTags(): Promise<{ term: string[]; text: string[] }> {
  const [term, text] = await Promise.all([getAllTermTags(), getAllTextTags()]);
  return { term, text };
}

/**
 * Map of word id → its tag ids. Built once per word-list query so the in-memory
 * tag filter avoids a per-word lookup.
 */
export async function buildWordTagIndex(): Promise<Map<number, number[]>> {
  const index = new Map<number, number[]>();
  for (const wt of await localDb.wordTags.toArray()) {
    const list = index.get(wt.woId);
    if (list) {
      list.push(wt.tgId);
    } else {
      index.set(wt.woId, [wt.tgId]);
    }
  }
  return index;
}

/** Map of tag id → tag name (for rendering a word's tags in the list). */
export async function buildTagNameIndex(): Promise<Map<number, string>> {
  const index = new Map<number, string>();
  for (const tag of await localDb.tags.toArray()) {
    if (tag.id != null) {
      index.set(tag.id, tag.text);
    }
  }
  return index;
}

/** The tag names attached to one word (edit form / single-term payloads). */
export async function getWordTagNames(woId: number): Promise<string[]> {
  const maps = await localDb.wordTags.where('woId').equals(woId).toArray();
  if (maps.length === 0) {
    return [];
  }
  const tags = await localDb.tags.bulkGet(maps.map((m) => m.tgId));
  return tags.filter((t): t is NonNullable<typeof t> => t != null).map((t) => t.text);
}

/**
 * Replace a text's tags, creating missing text-tag rows as needed. Mirrors the
 * word-tag writer (`setWordTags`): `undefined` means "leave tags unchanged".
 */
export async function setTextTags(txId: number, tags: string[] | undefined): Promise<void> {
  if (!tags) {
    return;
  }
  await localDb.textTagMap.where('txId').equals(txId).delete();
  for (const raw of tags) {
    const name = raw.trim();
    if (name === '') {
      continue;
    }
    let tag = await localDb.textTags.where('text').equals(name).first();
    if (!tag) {
      const id = (await localDb.textTags.add({ text: name, comment: '' })) as number;
      tag = { id, text: name, comment: '' };
    }
    if (tag.id != null) {
      await localDb.textTagMap.add({ txId, t2Id: tag.id });
    }
  }
}

/** The tag names attached to one text (for the library `taglist`). */
export async function getTextTagNames(txId: number): Promise<string[]> {
  const maps = await localDb.textTagMap.where('txId').equals(txId).toArray();
  if (maps.length === 0) {
    return [];
  }
  const tags = await localDb.textTags.bulkGet(maps.map((m) => m.t2Id));
  return tags.filter((t): t is NonNullable<typeof t> => t != null).map((t) => t.text);
}

/** Drop a text's tag mappings (on delete). Tag rows themselves are kept. */
export async function clearTextTags(txId: number): Promise<void> {
  await localDb.textTagMap.where('txId').equals(txId).delete();
}

// =========================================================================
// Tag management (the bundled tags.html page) — local-first only; the server
// exposes tag mutations as web-route forms, not `/api/v1`. See tags_api.ts.
// =========================================================================

/** Every term + text tag with the number of terms/texts that carry it. */
export async function listTagsForManagement(): Promise<TagsManageResponse> {
  const [termRows, textRows] = await Promise.all([
    localDb.tags.toArray(),
    localDb.textTags.toArray(),
  ]);
  const term = await Promise.all(
    termRows.map(async (t) => ({
      id: t.id ?? 0,
      name: t.text,
      count: await localDb.wordTags.where('tgId').equals(t.id ?? -1).count(),
    }))
  );
  const text = await Promise.all(
    textRows.map(async (t) => ({
      id: t.id ?? 0,
      name: t.text,
      count: await localDb.textTagMap.where('t2Id').equals(t.id ?? -1).count(),
    }))
  );
  const byName = (a: { name: string }, b: { name: string }): number =>
    a.name.localeCompare(b.name);
  return { term: term.sort(byName), text: text.sort(byName) };
}

/** Rename a term tag, rejecting blank or duplicate names. */
export async function renameTermTag(
  id: number,
  name: string
): Promise<TagMutationResponse> {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { success: false, error: 'Tag name is required' };
  }
  const tag = await localDb.tags.get(id);
  if (!tag) {
    return { success: false, error: 'Tag not found' };
  }
  const clash = await localDb.tags.where('text').equals(trimmed).first();
  if (clash && clash.id !== id) {
    return { success: false, error: 'A tag with that name already exists' };
  }
  await localDb.tags.update(id, { text: trimmed });
  return { success: true };
}

/** Delete a term tag and unassign it from every term. */
export async function deleteTermTag(id: number): Promise<TagMutationResponse> {
  const tag = await localDb.tags.get(id);
  if (!tag) {
    return { success: false, error: 'Tag not found' };
  }
  await localDb.transaction('rw', localDb.tags, localDb.wordTags, async () => {
    await localDb.wordTags.where('tgId').equals(id).delete();
    await localDb.tags.delete(id);
  });
  return { success: true };
}

/** Rename a text tag, rejecting blank or duplicate names. */
export async function renameTextTag(
  id: number,
  name: string
): Promise<TagMutationResponse> {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { success: false, error: 'Tag name is required' };
  }
  const tag = await localDb.textTags.get(id);
  if (!tag) {
    return { success: false, error: 'Tag not found' };
  }
  const clash = await localDb.textTags.where('text').equals(trimmed).first();
  if (clash && clash.id !== id) {
    return { success: false, error: 'A tag with that name already exists' };
  }
  await localDb.textTags.update(id, { text: trimmed });
  return { success: true };
}

/** Delete a text tag and unassign it from every text. */
export async function deleteTextTag(id: number): Promise<TagMutationResponse> {
  const tag = await localDb.textTags.get(id);
  if (!tag) {
    return { success: false, error: 'Tag not found' };
  }
  await localDb.transaction('rw', localDb.textTags, localDb.textTagMap, async () => {
    await localDb.textTagMap.where('t2Id').equals(id).delete();
    await localDb.textTags.delete(id);
  });
  return { success: true };
}
