/**
 * CORS-free HTTP for client-side content discovery.
 *
 * The bundled app runs this frontend inside a Capacitor WebView (served from
 * `https://localhost`) where the Capacitor bridge is present. That lets us reach
 * the catalog APIs (Gutendex, Global Digital Library) and Project Gutenberg
 * plain-text files directly via the built-in `CapacitorHttp` plugin — native
 * requests are not subject to the browser's same-origin policy, so no server
 * proxy is needed for these specific, fixed-host sources.
 *
 * Outside the app (a plain browser: `npm run dev`, the server-served PWA) there
 * is no bridge, so we fall back to `window.fetch`. Cross-origin calls then obey
 * CORS — which is why these client-side content sources are only wired in under
 * local-first mode (the packaged app); classic server installs keep using the
 * server's outbound proxy. This mirrors the dev-only CORS caveat already
 * documented for the connect-probe in the lukaisu shell (`src/main.ts`).
 *
 * Scope note: this is deliberately limited to the structured, low-SSRF-risk
 * catalog sources — the catalog APIs (Gutendex, GDL) plus the plain-text /
 * EPUB downloads they link to ({@link corsFreeGetBytes} fetches the EPUB
 * bytes for on-device import). Arbitrary-URL extraction and RSS stay
 * server-enhanced (see both repos' BRIEFING.md seam).
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Minimal shape of the `CapacitorHttp.request` response we rely on. */
interface CapacitorHttpResponse {
  status: number;
  data: unknown;
}

/** Minimal surface of the built-in `CapacitorHttp` plugin (Capacitor 5+). */
interface CapacitorHttpPlugin {
  request(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    connectTimeout?: number;
    readTimeout?: number;
    responseType?: 'text' | 'json' | 'blob' | 'arraybuffer' | 'document';
  }): Promise<CapacitorHttpResponse>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { CapacitorHttp?: CapacitorHttpPlugin };
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

/**
 * The native HTTP plugin when running inside the Capacitor app, else null.
 * Guarded so the same bundle stays a plain web app outside the WebView.
 */
function nativeHttp(): CapacitorHttpPlugin | null {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (cap && cap.isNativePlatform?.() === true && cap.Plugins?.CapacitorHttp) {
    return cap.Plugins.CapacitorHttp;
  }
  return null;
}

/** A normalized response, decoupled from fetch vs. CapacitorHttp. */
export interface FetchResult {
  status: number;
  ok: boolean;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * GET a URL CORS-free when possible. Uses native HTTP inside the app; falls
 * back to `window.fetch` (CORS applies) elsewhere.
 */
export async function corsFreeGet(
  url: string,
  opts: { accept?: string; timeoutMs?: number } = {}
): Promise<FetchResult> {
  const accept = opts.accept ?? 'application/json';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const native = nativeHttp();
  if (native) {
    const res = await native.request({
      url,
      method: 'GET',
      headers: { Accept: accept },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'text',
    });
    // CapacitorHttp may hand back a parsed object for JSON content types even
    // with responseType:'text'; re-serialize so callers always get a string.
    const text =
      typeof res.data === 'string' ? res.data : res.data == null ? '' : JSON.stringify(res.data);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, text };
  }

  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: accept }, signal: controller.signal });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } finally {
    clearTimeout(timer);
  }
}

/** GET and parse JSON, throwing on a non-2xx status or invalid JSON. */
export async function corsFreeGetJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const res = await corsFreeGet(url, { accept: 'application/json', timeoutMs });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return JSON.parse(res.text) as T;
}

/** A normalized binary response, decoupled from fetch vs. CapacitorHttp. */
export interface FetchBytesResult {
  status: number;
  ok: boolean;
  bytes: Uint8Array;
}

const EMPTY_BYTES = new Uint8Array(0);

/**
 * Decode a base64 payload to bytes (no native Buffer dependency). Tolerates a
 * `data:<mime>;base64,` prefix, which some `CapacitorHttp` versions prepend to
 * blob/arraybuffer responses.
 */
function base64ToBytes(b64: string): Uint8Array {
  const comma = b64.startsWith('data:') ? b64.indexOf(',') : -1;
  const bin = atob(comma === -1 ? b64 : b64.slice(comma + 1));
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * GET a URL as raw bytes, CORS-free when possible — used to download EPUBs for
 * on-device import. The native bridge is JSON-only, so `CapacitorHttp` hands
 * binary payloads back base64-encoded in `data`; we decode them. The web
 * fallback uses `fetch(...).arrayBuffer()` (and obeys CORS, like the rest of
 * this module).
 */
export async function corsFreeGetBytes(
  url: string,
  opts: { accept?: string; timeoutMs?: number } = {}
): Promise<FetchBytesResult> {
  const accept = opts.accept ?? 'application/octet-stream';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const native = nativeHttp();
  if (native) {
    const res = await native.request({
      url,
      method: 'GET',
      headers: { Accept: accept },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'arraybuffer',
    });
    let bytes: Uint8Array;
    if (typeof res.data === 'string') {
      bytes = base64ToBytes(res.data);
    } else if (res.data instanceof ArrayBuffer) {
      bytes = new Uint8Array(res.data);
    } else {
      bytes = EMPTY_BYTES;
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, bytes };
  }

  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: accept }, signal: controller.signal });
    const buf = await res.arrayBuffer();
    return { status: res.status, ok: res.ok, bytes: new Uint8Array(buf) };
  } finally {
    clearTimeout(timer);
  }
}
