/**
 * Proves the offline create flow works through the REAL API client + local
 * router (no server): create a language, then paste a text, and the text is
 * immediately readable. Guards the snake_case body `TextsApi.create` sends
 * (`language_id`), which the router must map onto the camelCase `createText`.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { localDb } from '@shared/offline/local/schema';
import { setLocalFirst } from '@shared/offline/local/router';
import { getAllTextTags } from '@shared/offline/local/repositories/tags';
import { apiGet } from '@shared/api/client';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { TextsApi } from '@modules/text/api/texts_api';

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
  setLocalFirst(true);
});

afterAll(() => {
  setLocalFirst(false);
});

describe('offline create flow (API client → local router)', () => {
  it('creates a language, pastes a text, and reads it', async () => {
    const lang = await LanguagesApi.create({
      name: 'English',
      sourceLang: 'en',
      regexpSplitSentences: '.!?:;',
      exceptionsSplitSentences: '',
      regexpWordCharacters: 'a-zA-Z',
    });
    expect(lang.error).toBeUndefined();
    const langId = lang.data?.id;
    expect(langId).toBeGreaterThan(0);

    // TextsApi.create posts the server contract's snake_case body (language_id);
    // the local router must accept it, or this would be "Language not found".
    const text = await TextsApi.create({
      langId: langId as number,
      title: 'Pasted',
      text: 'The cat sat. The cat ran.',
      tags: ['demo'],
    });
    expect(text.error).toBeUndefined();
    const textId = text.data?.id;
    expect(textId).toBeGreaterThan(0);

    // The pasted text parsed into readable words entirely on-device.
    const words = await TextsApi.getWords(textId as number);
    expect(words.error).toBeUndefined();
    const tokens = words.data?.words.filter((w) => !w.isNotWord) ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((w) => w.status === 0)).toBe(true);

    // The tag was stored as a text tag.
    expect(await getAllTextTags()).toContain('demo');
  });

  it('lists no languages on a fresh install, then one after create', async () => {
    expect((await LanguagesApi.list()).data?.languages ?? []).toHaveLength(0);
    await LanguagesApi.create({
      name: 'French',
      sourceLang: 'fr',
      regexpSplitSentences: '.!?',
      exceptionsSplitSentences: '',
      regexpWordCharacters: 'a-zA-Z',
    });
    const after = (await LanguagesApi.list()).data?.languages ?? [];
    expect(after.map((l) => l.name)).toContain('French');
  });

  it('serves the reader chrome (audio, book-context) on-device', async () => {
    const lang = await LanguagesApi.create({
      name: 'English',
      sourceLang: 'en',
      regexpSplitSentences: '.!?:;',
      exceptionsSplitSentences: '',
      regexpWordCharacters: 'a-zA-Z',
    });
    const text = await TextsApi.create({
      langId: lang.data!.id as number,
      title: 'Pasted',
      text: 'Hello there.',
    });
    const textId = text.data?.id as number;

    // A pasted text has no audio: the player stays hidden (empty uri), not a
    // failed request.
    const audio = await apiGet<{ uri: string; playerSettings: unknown }>(
      `/texts/${textId}/audio`
    );
    expect(audio.error).toBeUndefined();
    expect(audio.data?.uri).toBe('');
    expect(audio.data?.playerSettings).toBeTruthy();

    // It is standalone, so there is no book context.
    const book = await apiGet<{ book: unknown }>(`/texts/${textId}/book-context`);
    expect(book.error).toBeUndefined();
    expect(book.data?.book).toBeNull();
  });
});
