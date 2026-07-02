/**
 * Tests for the server-enhanced tokenization client. `adaptParse` is the
 * delicate part — it reassembles per-token sentence indices from the server's
 * flat token stream — so it gets focused coverage, including the bail-out cases
 * that protect the reader from a misaligned parse. fetch is mocked (dispatched
 * by URL, since a `/capabilities` probe precedes the call) for `remoteParse`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { adaptParse, remoteParse, serverParserFor } from '@shared/offline/nlp/parse';
import { resetCapabilitiesCache, setNlpServer } from '@shared/offline/nlp/endpoint';

describe('serverParserFor', () => {
  it('routes Korean to Kiwi and nothing else (for now)', () => {
    expect(serverParserFor('ko')).toBe('kiwi');
    expect(serverParserFor('ko-KR')).toBe('kiwi');
    expect(serverParserFor('ja')).toBeNull();
    expect(serverParserFor('en')).toBeNull();
  });
});

describe('adaptParse', () => {
  it('assigns per-token sentence indices by reconstructing each sentence', () => {
    const result = adaptParse({
      sentences: ['저는 학생.'],
      tokens: [
        { text: '저', is_word: true },
        { text: '는', is_word: true },
        { text: ' ', is_word: false },
        { text: '학생', is_word: true },
        { text: '.', is_word: false },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.sentences).toEqual(['저는 학생.']);
    expect(result!.tokens.map((t) => [t.text, t.sentenceIndex, t.order, t.isWord])).toEqual([
      ['저', 0, 0, true],
      ['는', 0, 1, true],
      [' ', 0, 2, false],
      ['학생', 0, 3, true],
      ['.', 0, 4, false],
    ]);
    expect(result!.tokens.map((t) => t.text).join('')).toBe('저는 학생.');
  });

  it('splits tokens across multiple sentences', () => {
    const result = adaptParse({
      sentences: ['가다.', '오다.'],
      tokens: [
        { text: '가다', is_word: true },
        { text: '.', is_word: false },
        { text: '오다', is_word: true },
        { text: '.', is_word: false },
      ],
    });
    expect(result!.tokens.map((t) => t.sentenceIndex)).toEqual([0, 0, 1, 1]);
    expect(result!.tokens.filter((t) => t.sentenceIndex === 1).map((t) => t.order)).toEqual([0, 1]);
  });

  it('bails (null) when tokens do not reconstruct the sentence', () => {
    expect(
      adaptParse({
        sentences: ['저는 학생.'],
        tokens: [{ text: '저', is_word: true }, { text: '학생', is_word: true }],
      })
    ).toBeNull();
  });

  it('bails when tokens are left over after the last sentence', () => {
    expect(
      adaptParse({
        sentences: ['가.'],
        tokens: [
          { text: '가', is_word: true },
          { text: '.', is_word: false },
          { text: '나', is_word: true },
        ],
      })
    ).toBeNull();
  });

  it('returns null for an empty token list', () => {
    expect(adaptParse({ sentences: [''], tokens: [] })).toBeNull();
  });
});

/** A fetch mock that answers /capabilities and the /parse/ POST by URL. */
function mockNlp(opts: { parse?: boolean; response?: unknown; postOk?: boolean; reject?: boolean } = {}) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith('/capabilities')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ capabilities: { parse: { available: opts.parse ?? true } } }),
      });
    }
    if (opts.reject) {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve({ ok: opts.postOk ?? true, json: () => Promise.resolve(opts.response ?? {}) });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('remoteParse', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setNlpServer(null);
    resetCapabilitiesCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setNlpServer(null);
    resetCapabilitiesCache();
  });

  it('POSTs {text, parser} to the NLP /parse/ and adapts the result', async () => {
    const fn = mockNlp({
      response: {
        sentences: ['공부하다.'],
        tokens: [
          { text: '공부하다', is_word: true },
          { text: '.', is_word: false },
        ],
      },
    });

    const result = await remoteParse('공부하다.', 'kiwi');

    expect(result).not.toBeNull();
    expect(result!.tokens[0]).toMatchObject({ text: '공부하다', isWord: true, sentenceIndex: 0 });
    const post = fn.mock.calls.find((c) => String(c[0]).endsWith('/parse/'));
    expect(post).toBeTruthy();
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ text: '공부하다.', parser: 'kiwi' });
  });

  it('skips the call when the edge does not advertise parse', async () => {
    const fn = mockNlp({ parse: false, response: { sentences: ['가.'], tokens: [{ text: '가', is_word: true }] } });
    expect(await remoteParse('가.', 'kiwi')).toBeNull();
    expect(fn.mock.calls.some((c) => String(c[0]).endsWith('/parse/'))).toBe(false);
  });

  it('accepts a wrapped { data } payload', async () => {
    mockNlp({
      response: { data: { sentences: ['가.'], tokens: [{ text: '가', is_word: true }, { text: '.', is_word: false }] } },
    });
    const result = await remoteParse('가.', 'kiwi');
    expect(result!.tokens.map((t) => t.text)).toEqual(['가', '.']);
  });

  it('returns null on non-OK, rejection, or empty text (soft fail)', async () => {
    mockNlp({ postOk: false });
    expect(await remoteParse('가.', 'kiwi')).toBeNull();

    resetCapabilitiesCache();
    mockNlp({ reject: true });
    await expect(remoteParse('가.', 'kiwi')).resolves.toBeNull();

    const fn = mockNlp();
    expect(await remoteParse('   ', 'kiwi')).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
