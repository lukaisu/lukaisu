/**
 * Tests for the server-enhanced lemmatization client. fetch is mocked (and
 * dispatched by URL, since a `/capabilities` probe precedes the call): these
 * assert Korean -> Kiwi, the request shape, capability gating, and that every
 * failure mode degrades to null (the save path must never break).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { remoteLemmatize, lemmatizerFor } from '@shared/offline/nlp/lemmatize';
import { resetCapabilitiesCache, setNlpServer } from '@shared/offline/nlp/endpoint';

describe('lemmatizerFor', () => {
  it('routes Korean (incl. regioned) to Kiwi', () => {
    expect(lemmatizerFor('ko')).toBe('kiwi');
    expect(lemmatizerFor('ko-KR')).toBe('kiwi');
    expect(lemmatizerFor('KO')).toBe('kiwi');
  });
  it('routes other languages to spaCy', () => {
    expect(lemmatizerFor('en')).toBe('spacy');
    expect(lemmatizerFor('ja')).toBe('spacy');
    expect(lemmatizerFor('zh')).toBe('spacy');
  });
});

interface MockOptions {
  /** Whether /capabilities advertises lemmatize (default true). */
  lemmatize?: boolean;
  /** Body returned by the POST to /lemmatize/. */
  response?: unknown;
  /** ok flag of the POST response (default true). */
  postOk?: boolean;
  /** Reject the POST (offline). */
  reject?: boolean;
}

/** A fetch mock that answers /capabilities and the /lemmatize/ POST by URL. */
function mockNlp(opts: MockOptions = {}) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const u = String(input);
    if (u.endsWith('/capabilities')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ capabilities: { lemmatize: { available: opts.lemmatize ?? true } } }),
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

function postBody(fn: ReturnType<typeof mockNlp>): Record<string, unknown> | null {
  const call = fn.mock.calls.find((c) => String(c[0]).endsWith('/lemmatize/'));
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

describe('remoteLemmatize', () => {
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

  it('posts word/language/lemmatizer to the NLP /lemmatize/ and returns the lemma', async () => {
    const fn = mockNlp({ response: { word: '공부했습니다', lemma: '공부하다' } });

    const lemma = await remoteLemmatize('공부했습니다', 'ko');

    expect(lemma).toBe('공부하다');
    expect(postBody(fn)).toEqual({ word: '공부했습니다', language: 'ko', lemmatizer: 'kiwi' });
  });

  it('skips the call when the edge does not advertise lemmatize', async () => {
    const fn = mockNlp({ lemmatize: false, response: { lemma: '공부하다' } });
    expect(await remoteLemmatize('공부했습니다', 'ko')).toBeNull();
    expect(fn.mock.calls.some((c) => String(c[0]).endsWith('/lemmatize/'))).toBe(false);
  });

  it('accepts a wrapped { data: { lemma } } payload', async () => {
    mockNlp({ response: { data: { lemma: '가다' } } });
    expect(await remoteLemmatize('갔습니다', 'ko')).toBe('가다');
  });

  it('returns null when the lemma equals the input (already base form)', async () => {
    mockNlp({ response: { lemma: '학교' } });
    expect(await remoteLemmatize('학교', 'ko')).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    mockNlp({ postOk: false });
    expect(await remoteLemmatize('갔습니다', 'ko')).toBeNull();
  });

  it('returns null (never throws) when the request rejects — offline', async () => {
    mockNlp({ reject: true });
    await expect(remoteLemmatize('갔습니다', 'ko')).resolves.toBeNull();
  });

  it('does not touch the network for empty/whitespace input', async () => {
    const fn = mockNlp({ response: { lemma: 'x' } });
    expect(await remoteLemmatize('   ', 'ko')).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('uses the spaCy backend for non-Korean languages', async () => {
    const fn = mockNlp({ response: { lemma: 'run' } });
    await remoteLemmatize('running', 'en');
    expect(postBody(fn)?.lemmatizer).toBe('spacy');
  });
});
