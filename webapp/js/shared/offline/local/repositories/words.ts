/**
 * Word-list repository — backs the vocabulary table page (filter, paginate,
 * inline-edit). Read-mostly; bulk actions cover the common status/delete cases.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalWord } from '../schema';
import { retrievability } from '../fsrs';
import { applyStatus, nowMs } from './helpers';

const DAY_MS = 86_400_000;
import { buildWordTagIndex, buildTagNameIndex } from './tags';
import type {
  WordListFilters,
  WordListResponse,
  WordItem,
  FilterOptions,
  InlineEditResponse,
  BulkActionResponse,
} from '@modules/vocabulary/api/words_api';

const STATUS_LABELS: Record<number, string> = {
  1: 'New (1)',
  2: 'Learning (2)',
  3: 'Learning (3)',
  4: 'Learning (4)',
  5: 'Learned (5)',
  98: 'Ignored',
  99: 'Well known',
};

function toItem(
  word: LocalWord,
  langName: string,
  rtl: boolean,
  now: Date,
  tags: string
): WordItem {
  const days = Math.max(0, Math.floor((now.getTime() - word.statusChanged) / DAY_MS));
  return {
    id: word.id ?? 0,
    text: word.text,
    translation: word.translation,
    romanization: word.romanization,
    sentence: word.sentence,
    sentenceOk: word.sentence.includes('{'),
    status: word.status,
    statusAbbr: word.status <= 5 ? String(word.status) : '',
    statusLabel: STATUS_LABELS[word.status] ?? String(word.status),
    days: String(days),
    // FSRS view (issue #238): score = memory stability (days), score2 = current
    // recall probability (%). Replaces the old today/tomorrow Leitner scores.
    score: Math.round(word.stability),
    score2: Math.round(
      retrievability(
        {
          stability: word.stability,
          difficulty: word.difficulty,
          due: word.due,
          lastReview: word.lastReview,
          reps: word.reps,
          lapses: word.lapses,
          state: word.fsrsState,
        },
        now.getTime()
      ) * 100
    ),
    tags,
    langId: word.langId,
    langName,
    rightToLeft: rtl,
    ttsClass: null,
  };
}

/** Parse a tag filter id; '' / null / non-numeric mean "no filter". */
function tagFilterValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Whether a word's tag ids satisfy one filter (-1 = "untagged"). */
function matchesTag(tagIds: number[], filter: number): boolean {
  if (filter === -1) {
    return tagIds.length === 0;
  }
  return tagIds.includes(filter);
}

/** Filter + paginate the vocabulary list. */
export async function getList(filters: WordListFilters): Promise<WordListResponse> {
  const langId = filters.lang != null && filters.lang !== '' ? Number(filters.lang) : null;
  const statusFilter = filters.status && filters.status !== '' && filters.status !== 'all'
    ? Number(filters.status)
    : null;
  const query = (filters.query ?? '').toLowerCase();

  let words = await localDb.words.filter((w) => w.deletedAt == null).toArray();
  if (langId != null) {
    words = words.filter((w) => w.langId === langId);
  }
  if (statusFilter != null && !Number.isNaN(statusFilter)) {
    words = words.filter((w) => w.status === statusFilter);
  }
  if (filters.text_id != null && filters.text_id !== '') {
    const textId = Number(filters.text_id);
    const occ = await localDb.occurrences.where('textId').equals(textId).and((o) => o.woId != null).toArray();
    const ids = new Set(occ.map((o) => o.woId));
    words = words.filter((w) => ids.has(w.id ?? -1));
  }
  if (query) {
    words = words.filter(
      (w) => w.textLc.includes(query) || w.translation.toLowerCase().includes(query)
    );
  }

  // Tag filter (mirrors WordListFilterBuilder::buildTagCondition): tag1/tag2 are
  // tag ids (-1 = "untagged"), combined by tag12 (1 = AND, 0/absent = OR).
  const wordTagIndex = await buildWordTagIndex();
  const tag1 = tagFilterValue(filters.tag1);
  const tag2 = tagFilterValue(filters.tag2);
  if (tag1 != null || tag2 != null) {
    const andLogic = Number(filters.tag12 ?? 0) === 1;
    words = words.filter((w) => {
      const ids = wordTagIndex.get(w.id ?? -1) ?? [];
      const m1 = tag1 != null ? matchesTag(ids, tag1) : null;
      const m2 = tag2 != null ? matchesTag(ids, tag2) : null;
      if (m1 != null && m2 != null) {
        return andLogic ? m1 && m2 : m1 || m2;
      }
      return (m1 ?? m2) ?? true;
    });
  }

  words.sort((a, b) => a.textLc.localeCompare(b.textLc));

  const langNames = new Map<number, { name: string; rtl: boolean }>();
  for (const l of await localDb.languages.toArray()) {
    langNames.set(l.id ?? 0, { name: l.name, rtl: l.rightToLeft });
  }
  const tagNames = await buildTagNameIndex();

  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, filters.per_page ?? 100);
  const total = words.length;
  const start = (page - 1) * perPage;
  const now = new Date();
  const items = words.slice(start, start + perPage).map((w) => {
    const meta = langNames.get(w.langId) ?? { name: '', rtl: false };
    const tags = (wordTagIndex.get(w.id ?? -1) ?? [])
      .map((id) => tagNames.get(id))
      .filter((name): name is string => name != null && name !== '')
      .join(', ');
    return toItem(w, meta.name, meta.rtl, now, tags);
  });

  return {
    words: items,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

/** Dropdown options for the vocabulary filters. */
export async function getFilterOptions(langId?: number | null): Promise<FilterOptions> {
  const languages = (await localDb.languages.filter((l) => l.deletedAt == null).toArray()).map(
    (l) => ({ id: l.id ?? 0, name: l.name, showRomanization: l.showRomanization })
  );
  const textsQuery = localDb.texts.filter(
    (t) => t.deletedAt == null && (langId == null || t.langId === langId)
  );
  const texts = (await textsQuery.toArray()).map((t) => ({ id: t.id ?? 0, title: t.title }));
  const tags = (await localDb.tags.toArray()).map((t) => ({ id: t.id ?? 0, name: t.text }));

  return {
    languages,
    texts,
    tags,
    statuses: [
      { value: 'all', label: 'All' },
      { value: '1', label: 'New (1)' },
      { value: '2', label: 'Learning (2)' },
      { value: '3', label: 'Learning (3)' },
      { value: '4', label: 'Learning (4)' },
      { value: '5', label: 'Learned (5)' },
      { value: '99', label: 'Well known' },
      { value: '98', label: 'Ignored' },
    ],
    sorts: [
      { value: 1, label: 'Term A-Z' },
      { value: 2, label: 'Newest' },
      { value: 3, label: 'Status' },
    ],
  };
}

/** Inline-edit a single field of a term. */
export async function inlineEdit(
  termId: number,
  field: 'translation' | 'romanization',
  value: string
): Promise<InlineEditResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { success: false, value: '', error: 'Term not found' };
  }
  await localDb.words.update(termId, { [field]: value, updatedAt: nowMs() });
  return { success: true, value };
}

/** Bulk status/delete on a set of term ids. */
export async function bulkAction(
  ids: number[],
  action: string,
  data?: string
): Promise<BulkActionResponse> {
  if (action === 'delete') {
    await localDb.words.bulkDelete(ids);
    for (const id of ids) {
      await localDb.occurrences.where('woId').equals(id).modify({ woId: null });
    }
    return { success: true, count: ids.length, message: `Deleted ${ids.length}` };
  }
  if (action === 'status' && data != null) {
    const status = Number(data);
    for (const id of ids) {
      await applyStatus(id, status);
    }
    return { success: true, count: ids.length, message: `Updated ${ids.length}` };
  }
  return { success: false, count: 0, message: 'Unsupported action' };
}
