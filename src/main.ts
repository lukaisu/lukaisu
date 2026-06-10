/**
 * Connect shell for the Language Reader app.
 *
 * The app is a thin Capacitor shell over the system WebView: this screen lets
 * the user pick an LWT server, validates it by probing the public
 * `GET /api/v1/version` endpoint, persists the choice natively, then navigates
 * the WebView to the server itself. From that point the remote LWT web app is
 * same-origin with its own server — its `/connect` auth flow, bearer-token
 * persistence, proactive refresh, and `lwt:auth-expired` handling all apply
 * unchanged, and no CORS configuration is required on the server.
 *
 * The probe uses CapacitorHttp (native transport), so it is not subject to
 * CORS either. In a plain browser (`npm run dev`) CapacitorHttp falls back to
 * `fetch`, where the probe DOES need the server to allow this origin via
 * `CORS_ALLOWED_ORIGINS` — dev-only caveat.
 *
 * @license MIT
 */

import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Native-storage key for the chosen server root (scheme + host [+ subpath]). */
const SERVER_KEY = 'serverUrl';

/**
 * Per-WebView-session guard: set just before navigating to the server, so
 * that backing out of the remote app into this shell does not immediately
 * auto-connect forward again (which would make "back" an infinite loop).
 */
const AUTO_CONNECTED_FLAG = 'lwt.autoConnected';

const form = document.getElementById('server-form') as HTMLFormElement;
const input = document.getElementById('server-input') as HTMLInputElement;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const formError = document.getElementById('form-error') as HTMLParagraphElement;
const connecting = document.getElementById('connecting') as HTMLElement;
const connectingServer = document.getElementById('connecting-server') as HTMLElement;
const changeServerBtn = document.getElementById('change-server-btn') as HTMLButtonElement;

let autoConnectAborted = false;

/**
 * Trim, drop trailing slashes, and default the scheme to https so the user
 * can type just a hostname. Same rules as the server-side `/connect` flow
 * (`client_auth.ts` in the lwt repo) — keep them in sync.
 */
export function normalizeServerUrl(raw: string): string {
  let value = raw.trim().replace(/\/+$/, '');
  if (value !== '' && !/^https?:\/\//i.test(value)) {
    value = 'https://' + value;
  }
  return value;
}

interface VersionResponse {
  version?: string;
}

/**
 * Probe `server/api/v1/version` to confirm the address is a reachable LWT
 * server. Native HTTP on device (no CORS); fetch fallback in a browser.
 */
async function probeServer(server: string): Promise<boolean> {
  try {
    const response = await CapacitorHttp.get({
      url: server + '/api/v1/version',
      headers: { Accept: 'application/json' },
      connectTimeout: 8000,
      readTimeout: 8000
    });
    if (response.status !== 200) {
      return false;
    }
    // CapacitorHttp parses JSON responses; tolerate a raw string anyway.
    const data: unknown =
      typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return typeof (data as VersionResponse).version === 'string';
  } catch {
    return false;
  }
}

/** Enter the app: remember the server, guard re-entry, navigate the WebView. */
async function enterServer(server: string): Promise<void> {
  await Preferences.set({ key: SERVER_KEY, value: server });
  try {
    sessionStorage.setItem(AUTO_CONNECTED_FLAG, '1');
  } catch {
    // sessionStorage unavailable: worst case, backing out auto-connects again.
  }
  window.location.href = server + '/';
}

function showForm(prefill: string, error = ''): void {
  connecting.hidden = true;
  form.hidden = false;
  input.value = prefill;
  formError.textContent = error;
  formError.hidden = error === '';
  connectBtn.disabled = false;
  input.focus();
}

const UNREACHABLE =
  'Could not reach an LWT server at that address. Check the URL and that the '
  + 'server is online (LWT 3.x or newer).';

async function submitForm(event: Event): Promise<void> {
  event.preventDefault();
  const server = normalizeServerUrl(input.value);
  if (server === '') {
    showForm('', 'Please enter a server address.');
    return;
  }
  input.value = server;
  connectBtn.disabled = true;
  formError.hidden = true;

  if (await probeServer(server)) {
    await enterServer(server);
    return;
  }
  showForm(server, UNREACHABLE);
}

/** Launch: saved server → probe + auto-enter; otherwise show the picker. */
async function start(): Promise<void> {
  form.addEventListener('submit', (e) => void submitForm(e));
  changeServerBtn.addEventListener('click', () => {
    autoConnectAborted = true;
    showForm(connectingServer.textContent || '');
  });

  const saved = (await Preferences.get({ key: SERVER_KEY })).value || '';
  let alreadyAutoConnected = false;
  try {
    alreadyAutoConnected = sessionStorage.getItem(AUTO_CONNECTED_FLAG) === '1';
  } catch {
    // sessionStorage unavailable: treat as a fresh launch.
  }

  if (!saved || alreadyAutoConnected) {
    // Fresh install, or the user navigated back out of the remote app —
    // show the picker (prefilled with the known server) instead of looping.
    showForm(saved);
    return;
  }

  connectingServer.textContent = saved;
  connecting.hidden = false;
  if (await probeServer(saved)) {
    if (!autoConnectAborted) {
      await enterServer(saved);
    }
    return;
  }
  if (!autoConnectAborted) {
    showForm(saved, UNREACHABLE);
  }
}

void start();
