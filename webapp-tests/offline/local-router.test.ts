/**
 * Tests the local-first seam through the REAL API client + module wrappers.
 * This proves the rendering code's existing calls (LanguagesApi/TextsApi) are
 * transparently served from the on-device DB when local-first is enabled, and
 * are untouched (network path) when it is off.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { localDb } from '@shared/offline/local/schema';
import { setLocalFirst, isLocalFirst } from '@shared/offline/local/router';
import { seedIfNeeded, getCurrentLanguageId } from '@shared/offline/local/repositories';
import { apiGet } from '@shared/api/client';
import type { NavbarData } from '@shared/components/navbar_renderer';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { TextsApi } from '@modules/text/api/texts_api';
import { TermsApi } from '@modules/vocabulary/api/terms_api';
import { setLangAsync } from '@modules/language/stores/language_settings';

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
  setLocalFirst(false);
});

afterAll(() => {
  setLocalFirst(false);
});

describe('local-first seam', () => {
  it('defaults to off so existing installs keep using the network', () => {
    expect(isLocalFirst()).toBe(false);
  });

  it('serves the language list from the local DB via LanguagesApi.list()', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const res = await LanguagesApi.list();
    expect(res.error).toBeUndefined();
    expect(res.data?.languages.length ?? 0).toBeGreaterThan(0);
  });

  it('serves a seeded text through TextsApi.getWords()', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const res = await TextsApi.getWords(text!.id as number);
    expect(res.error).toBeUndefined();
    expect(res.data?.words.some((w) => !w.isNotWord)).toBe(true);
  });

  it('saves a word through TermsApi and reflects it on the next read', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const textId = text!.id as number;

    const before = await TextsApi.getWords(textId);
    const target = before.data!.words.find((w) => !w.isNotWord)!;

    const quick = await TermsApi.createQuick(textId, target.position, 99);
    expect(quick.data?.term_id).toBeGreaterThan(0);

    const after = await TextsApi.getWords(textId);
    const updated = after.data!.words.find((w) => w.position === target.position)!;
    expect(updated.status).toBe(99);
  });

  it('lists a language’s texts through TextsApi-style /texts/by-language', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const langId = text!.langId;

    // The library page calls this endpoint directly via apiGet; without a local
    // route it falls through to the network and the list spins forever.
    const res = await apiGet<{
      texts: Array<{ id: number; title: string }>;
      pagination: { current_page: number; total: number; total_pages: number };
    }>(`/texts/by-language/${langId}`, { page: 1, per_page: 10, sort: 1 });

    expect(res.error).toBeUndefined();
    expect(res.data?.texts.length ?? 0).toBeGreaterThan(0);
    expect(res.data?.pagination.total ?? 0).toBeGreaterThan(0);
    expect(res.data?.pagination.current_page).toBe(1);
  });

  it('archives, unarchives and deletes a single text through TextsApi', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const textId = text!.id as number;
    const langId = text!.langId;

    // The grouped archived view loads its languages first; none archived yet.
    const before = await apiGet<{ languages: Array<{ id: number }> }>(
      '/languages/with-archived-texts'
    );
    expect(before.data?.languages.some((l) => l.id === langId)).toBeFalsy();

    // Archive on-device (POST /texts/{id}/archive).
    const archived = await TextsApi.archive(textId);
    expect(archived.error).toBeUndefined();
    expect(archived.data?.archived).toBe(true);

    const afterArchive = await apiGet<{ languages: Array<{ id: number; text_count: number }> }>(
      '/languages/with-archived-texts'
    );
    expect(afterArchive.data?.languages.find((l) => l.id === langId)?.text_count).toBeGreaterThan(0);

    // Unarchive (POST /texts/{id}/unarchive) removes it from the grouped view.
    const unarchived = await TextsApi.unarchive(textId);
    expect(unarchived.error).toBeUndefined();
    expect(unarchived.data?.unarchived).toBe(true);
    const afterUnarchive = await apiGet<{ languages: Array<{ id: number }> }>(
      '/languages/with-archived-texts'
    );
    expect(afterUnarchive.data?.languages.some((l) => l.id === langId)).toBeFalsy();

    // Delete (DELETE /texts/{id}) tombstones the row.
    const deleted = await TextsApi.deleteText(textId);
    expect(deleted.error).toBeUndefined();
    expect(deleted.data?.deleted).toBe(true);
    expect((await localDb.texts.get(textId))?.deletedAt).toBeTruthy();
  });

  it('loads and saves a single text through TextsApi.get / .update', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const textId = text!.id as number;
    const langId = text!.langId;

    // GET /texts/{id} returns the editable fields.
    const loaded = await TextsApi.get(textId);
    expect(loaded.error).toBeUndefined();
    expect(loaded.data?.id).toBe(textId);
    expect(loaded.data?.langId).toBe(langId);

    // PUT /texts/{id} saves a new title + body and reports the re-parse.
    const saved = await TextsApi.update(textId, {
      title: 'Edited offline',
      langId,
      text: 'Brand new body sentence one. Body sentence two.',
      tags: ['edited'],
    });
    expect(saved.error).toBeUndefined();
    expect(saved.data?.updated).toBe(true);
    expect(saved.data?.reparsed).toBe(true);

    const reloaded = await TextsApi.get(textId);
    expect(reloaded.data?.title).toBe('Edited offline');
    expect(reloaded.data?.tags).toEqual(['edited']);
  });

  it('previews a parse through TextsApi.check (POST /texts/check)', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const langId = text!.langId;

    const res = await TextsApi.check(langId, 'The cat sat. The cat ran.');
    expect(res.error).toBeUndefined();
    expect(res.data?.sentences.length).toBe(2);
    expect(res.data?.words.find((w) => w[0] === 'cat')?.[1]).toBe(2);
  });

  it('serves the global navbar chrome from the local DB', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const res = await apiGet<NavbarData>('/navbar');
    expect(res.error).toBeUndefined();
    expect(res.data?.languages.length ?? 0).toBeGreaterThan(0);
    // Server-only menu sections stay hidden offline.
    expect(res.data?.isMultiUser).toBe(false);
    expect(res.data?.showAdminItems).toBe(false);
  });

  it('serves the bundled English i18n bundle offline so labels resolve', async () => {
    setLocalFirst(true);
    const res = await apiGet<{ locale: string; messages: Record<string, string> }>('/i18n');
    expect(res.error).toBeUndefined();
    expect(res.data?.locale).toBe('en');
    // Flat "namespace.key" map the translator merges (e.g. the navbar labels).
    expect(res.data?.messages['navbar.texts']).toBeTruthy();
  });

  it('switches the current language offline via the navbar (setLangAsync)', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const langs = await localDb.languages.toArray();
    const target = langs[langs.length - 1].id as number;
    await setLangAsync(String(target));
    expect(await getCurrentLanguageId()).toBe(target);
  });

  it('returns example sentences for a term through the local seam', async () => {
    setLocalFirst(true);
    await seedIfNeeded();
    const text = await localDb.texts.toCollection().first();
    const occ = await localDb.occurrences
      .where('textId')
      .equals(text!.id as number)
      .and((o) => o.isWord)
      .first();

    const res = await apiGet<[string, string][]>('/sentences-with-term', {
      language_id: text!.langId,
      term_lc: occ!.textLc
    });
    expect(res.error).toBeUndefined();
    expect(res.data?.length ?? 0).toBeGreaterThan(0);
    // [0] = display HTML (term in <b>), [1] = copy text (term in {…}).
    expect(res.data![0][0]).toContain('<b>');
    expect(res.data![0][1]).toContain('{');
  });
});
