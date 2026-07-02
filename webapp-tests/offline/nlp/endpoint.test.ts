/**
 * Tests for NLP edge base-URL resolution and capability discovery. Covers the
 * precedence chain (override → localStorage → api-server fallback), URL joining,
 * and the cached `/capabilities` probe that gates the parse/lemmatize clients.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setApiServer } from '@shared/api/client';
import {
  getConfiguredNlpServer,
  getNlpServerOverride,
  setNlpServer,
  nlpUrl,
  getNlpCapabilities,
  nlpCapable,
  resetCapabilitiesCache,
} from '@shared/offline/nlp/endpoint';

describe('NLP base-URL resolution', () => {
  beforeEach(() => {
    setNlpServer(null);
    setApiServer(null);
    resetCapabilitiesCache();
  });
  afterEach(() => {
    setNlpServer(null);
    setApiServer(null);
    resetCapabilitiesCache();
  });

  it('defaults to same-origin when nothing is configured', () => {
    expect(getConfiguredNlpServer()).toBe('');
    expect(nlpUrl('/parse/')).toBe('/parse/');
  });

  it('falls back to the configured API server (the edge is the connected server)', () => {
    setApiServer('https://server.example');
    expect(getConfiguredNlpServer()).toBe('https://server.example');
    expect(nlpUrl('/lemmatize/')).toBe('https://server.example/lemmatize/');
  });

  it('an explicit NLP server overrides the API server and persists', () => {
    setApiServer('https://server.example');
    setNlpServer('https://nlp.example:8000/');
    expect(getConfiguredNlpServer()).toBe('https://nlp.example:8000');
    expect(nlpUrl('/parse/')).toBe('https://nlp.example:8000/parse/');
    // Persisted to localStorage so a relaunch remembers it.
    expect(localStorage.getItem('lukaisu.nlpServer')).toBe('https://nlp.example:8000');
  });

  it('resetting the NLP server falls back to the API server again', () => {
    setApiServer('https://server.example');
    setNlpServer('https://nlp.example');
    setNlpServer(null);
    expect(getConfiguredNlpServer()).toBe('https://server.example');
    expect(localStorage.getItem('lukaisu.nlpServer')).toBeNull();
  });

  it('getNlpServerOverride reports only the explicit value (backs the settings field)', () => {
    setApiServer('https://server.example');
    // No explicit NLP server -> blank, so the field is not pre-filled with the
    // inherited API-server default.
    expect(getNlpServerOverride()).toBe('');
    setNlpServer('https://nlp.example');
    expect(getNlpServerOverride()).toBe('https://nlp.example');
  });
});

describe('capability discovery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setNlpServer(null);
    setApiServer(null);
    resetCapabilitiesCache();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setNlpServer(null);
    setApiServer(null);
    resetCapabilitiesCache();
  });

  it('fetches /capabilities once and caches the result', async () => {
    const fn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ capabilities: { parse: { available: true }, lemmatize: { available: false } } }),
      })
    );
    global.fetch = fn as unknown as typeof fetch;

    expect(await nlpCapable('parse')).toBe(true);
    expect(await nlpCapable('lemmatize')).toBe(false);
    expect(await nlpCapable('whisper')).toBe(false); // absent => false
    // All four reads share a single network probe.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toMatch(/\/capabilities$/);
  });

  it('re-probes after the cache is reset (e.g. the server changed)', async () => {
    const fn = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ capabilities: { parse: { available: true } } }) })
    );
    global.fetch = fn as unknown as typeof fetch;

    await getNlpCapabilities();
    resetCapabilitiesCache();
    await getNlpCapabilities();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('treats an unreachable edge as no capabilities (soft fail)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await getNlpCapabilities()).toBeNull();
    expect(await nlpCapable('parse')).toBe(false);
  });

  it('changing the NLP server invalidates the cached capabilities', async () => {
    const fn = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ capabilities: { parse: { available: true } } }) })
    );
    global.fetch = fn as unknown as typeof fetch;

    await nlpCapable('parse');
    setNlpServer('https://other.example'); // resets the cache
    await nlpCapable('parse');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
