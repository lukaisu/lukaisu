/**
 * End-to-end: a Korean text imported with a server connected stores Kiwi
 * morphemes; with no server it falls back to the on-device eojeol parser. Proves
 * the import path (createText → storeParsedText → parseBest) actually swaps the
 * tokenizer and degrades gracefully. fetch is dispatched by URL because a
 * `/capabilities` probe precedes the `/parse/` call.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localDb, type LocalLanguage } from '@shared/offline/local/schema';
import { createText, getTextWords } from '@shared/offline/local/repositories/texts';
import { resetCapabilitiesCache, setNlpServer } from '@shared/offline/nlp/endpoint';

function koreanLanguage(): LocalLanguage {
  return {
    name: 'Korean',
    code: 'ko',
    dict1Uri: '',
    dict2Uri: '',
    translatorUri: '',
    exportTemplate: '',
    textSize: 150,
    characterSubstitutions: '',
    regexpSplitSentences: '.!?:;。！？：；',
    exceptionsSplitSentences: '',
    regexpWordCharacters: '가-힣ᄀ-ᇂ',
    removeSpaces: false,
    splitEachChar: false,
    rightToLeft: false,
    ttsVoiceApi: '',
    showRomanization: true,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
}

const TEXT = '저는 학교에 갑니다.';

// Kiwi-style morpheme parse for TEXT (its tokens reconstruct the sentence).
const KIWI_RESPONSE = {
  sentences: [TEXT],
  tokens: [
    { text: '저', is_word: true },
    { text: '는', is_word: true },
    { text: ' ', is_word: false },
    { text: '학교', is_word: true },
    { text: '에', is_word: true },
    { text: ' ', is_word: false },
    { text: '갑니다', is_word: true },
    { text: '.', is_word: false },
  ],
};

interface ReadWord {
  text: string;
  isNotWord: boolean;
}

function wordTexts(res: unknown): string[] {
  const words = (res as { words: ReadWord[] }).words;
  return words.filter((w) => !w.isNotWord).map((w) => w.text);
}

describe('Korean text re-parse via the server (Kiwi)', () => {
  const originalFetch = global.fetch;
  let langId: number;

  beforeEach(async () => {
    await Promise.all(localDb.tables.map((t) => t.clear()));
    langId = (await localDb.languages.add(koreanLanguage())) as number;
    setNlpServer(null);
    resetCapabilitiesCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setNlpServer(null);
    resetCapabilitiesCache();
  });

  it('stores Kiwi morphemes when the edge advertises and parses the text', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.endsWith('/capabilities')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ capabilities: { parse: { available: true } } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(KIWI_RESPONSE) });
    }) as unknown as typeof fetch;

    const created = await createText({ title: 'K', langId, text: TEXT, tags: [] });
    const words = wordTexts(await getTextWords((created as { id: number }).id));

    // Morpheme split from the server: 학교 stands alone (the on-device eojeol
    // parser keeps it glued as 학교에).
    expect(words).toContain('학교');
    expect(words).toContain('저');
    expect(words).not.toContain('학교에');
  });

  it('falls back to the on-device eojeol parser when there is no server', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const created = await createText({ title: 'K', langId, text: TEXT, tags: [] });
    const words = wordTexts(await getTextWords((created as { id: number }).id));

    // Eojeol-level: the space-separated regex parser keeps 학교에 as one token.
    expect(words).toContain('학교에');
    expect(words).not.toContain('학교');
  });
});
