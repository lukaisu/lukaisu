/**
 * Base-URL resolution and capability discovery for the optional NLP edge.
 *
 * The Lukaisu NLP edge (`services/nlp`) is a standalone, CORS-enabled FastAPI
 * service that mounts `/parse`, `/lemmatize`, `/capabilities` (etc.) at its
 * ROOT — not under `/api/v1`. The client calls it directly. By default the edge
 * is assumed to live at the connected server's origin (the common Python-first
 * deployment); an explicit override points at a separate NLP host/port.
 *
 * Resolution precedence mirrors the API-server resolution in `api/client.ts`:
 *   1. runtime override via {@link setNlpServer}
 *   2. persisted choice in localStorage (`lukaisu.nlpServer`)
 *   3. `<meta name="lukaisu-nlp-server">`
 *   4. the configured API server (so no extra config is needed when the edge
 *      *is* the connected server)
 *   5. '' — same origin
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { getConfiguredApiServer } from '@shared/api/client';

const NLP_SERVER_KEY = 'lukaisu.nlpServer';

/** In-memory override; `null` means "consult localStorage/meta/api-server". */
let overrideNlpServer: string | null = null;

function readStored(): string {
  try {
    return localStorage.getItem(NLP_SERVER_KEY) || '';
  } catch {
    return '';
  }
}

function metaNlpServer(): string {
  const meta = document.querySelector('meta[name="lukaisu-nlp-server"]');
  return meta ? meta.getAttribute('content') || '' : '';
}

/**
 * The *explicitly* configured NLP server (runtime override → localStorage →
 * `<meta>`), or '' when none is set and the client defaults to the connected
 * API server. Backs the settings field: a blank value means "use the connected
 * server", so the field isn't pre-filled with the inherited default.
 */
export function getNlpServerOverride(): string {
  if (overrideNlpServer !== null) {
    return overrideNlpServer;
  }
  return readStored() || metaNlpServer();
}

/** The NLP edge base origin (scheme + host[/subpath]), or '' for same-origin. */
export function getConfiguredNlpServer(): string {
  // No NLP-specific config: assume the edge is the connected server's root.
  return getNlpServerOverride() || getConfiguredApiServer();
}

/**
 * Point the client's NLP calls at a specific edge, persisting the choice. Pass
 * `null`/'' to reset (fall back to localStorage/meta/api-server/same-origin).
 */
export function setNlpServer(server: string | null): void {
  resetCapabilitiesCache();
  const normalized = (server || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    overrideNlpServer = null;
    try {
      localStorage.removeItem(NLP_SERVER_KEY);
    } catch {
      // localStorage unavailable: nothing persisted to clear.
    }
    return;
  }
  overrideNlpServer = normalized;
  try {
    localStorage.setItem(NLP_SERVER_KEY, normalized);
  } catch {
    // localStorage unavailable: the in-memory override still applies.
  }
}

/** Build a full URL for an NLP endpoint path (e.g. `/parse/`). */
export function nlpUrl(path: string): string {
  const base = getConfiguredNlpServer().replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : '/' + path;
  return base ? base + p : p;
}

/** A feature group in the edge's `/capabilities` report. */
export interface NlpCapability {
  available: boolean;
  prefix?: string;
  reason?: string;
}

export type NlpCapabilities = Record<string, NlpCapability>;

interface CapabilitiesResponse {
  capabilities?: NlpCapabilities;
}

/** Cached per base URL: null `caps` records a probe that failed (no edge). */
let capsCache: { base: string; caps: NlpCapabilities | null } | null = null;
let capsInflight: Promise<NlpCapabilities | null> | null = null;

/** Forget any cached capabilities (called when the NLP server changes). */
export function resetCapabilitiesCache(): void {
  capsCache = null;
  capsInflight = null;
}

/**
 * Fetch (and cache, per base URL) the edge's `/capabilities`. Returns null when
 * there is no reachable edge — callers then skip the enhancement. Never throws.
 */
export async function getNlpCapabilities(
  timeoutMs = 4000
): Promise<NlpCapabilities | null> {
  const base = getConfiguredNlpServer().replace(/\/+$/, '');
  if (capsCache && capsCache.base === base) {
    return capsCache.caps;
  }
  if (capsInflight) {
    return capsInflight;
  }
  capsInflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(nlpUrl('/capabilities'), {
        signal: controller.signal,
      });
      const caps =
        res.ok && (((await res.json()) as CapabilitiesResponse).capabilities ?? null);
      capsCache = { base, caps: caps || null };
      return capsCache.caps;
    } catch {
      capsCache = { base, caps: null };
      return null;
    } finally {
      clearTimeout(timer);
      capsInflight = null;
    }
  })();
  return capsInflight;
}

/**
 * Whether the connected edge advertises a feature group (`parse`, `lemmatize`,
 * `tts`, ...). Gated on `/capabilities` so the client never POSTs to a server
 * that lacks the feature; the probe is cached, so it costs one round-trip per
 * session per server.
 */
export async function nlpCapable(feature: string): Promise<boolean> {
  const caps = await getNlpCapabilities();
  return caps?.[feature]?.available === true;
}
