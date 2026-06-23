/**
 * Connect shell for the Lukaisu app.
 *
 * The app is a thin Capacitor shell over the system WebView: this screen lets
 * the user pick a Lukaisu Server, validates it by probing the public
 * `GET /api/v1/version` endpoint, persists the choice natively, then navigates
 * the WebView to the server itself. From that point the remote Lukaisu Server
 * web app is same-origin with its own server — its `/connect` auth flow,
 * bearer-token persistence, proactive refresh, and `lukaisu:auth-expired`
 * handling all apply unchanged, and no CORS configuration is required on the
 * server.
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
 * The official public Lukaisu Server, suggested first. When the "Use the
 * official server" switch is on, the address field shows this value read-only;
 * turning the switch off makes the field editable for a self-hosted/custom
 * server.
 */
const OFFICIAL_SERVER = 'https://lukaisu.org';

const OFFICIAL_HINT = 'Connect to the public Lukaisu Server at lukaisu.org.';
const CUSTOM_HINT =
  'Your own self-hosted Lukaisu Server, or another public instance. '
  + 'You can type just a hostname — HTTPS is assumed.';

/**
 * Per-WebView-session guard: set just before navigating to the server, so
 * that backing out of the remote app into this shell does not immediately
 * auto-connect forward again (which would make "back" an infinite loop).
 */
const AUTO_CONNECTED_FLAG = 'lukaisu.autoConnected';

const form = document.getElementById('server-form') as HTMLFormElement;
const input = document.getElementById('server-input') as HTMLInputElement;
const officialToggle = document.getElementById('official-toggle') as HTMLInputElement;
const serverHint = document.getElementById('server-hint') as HTMLParagraphElement;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const formError = document.getElementById('form-error') as HTMLParagraphElement;
const connecting = document.getElementById('connecting') as HTMLElement;
const connectingServer = document.getElementById('connecting-server') as HTMLElement;
const changeServerBtn = document.getElementById('change-server-btn') as HTMLButtonElement;

let autoConnectAborted = false;

/** Last address typed in custom mode, restored when the switch is turned off. */
let customDraft = '';

/**
 * Trim, drop trailing slashes, and default the scheme to https so the user
 * can type just a hostname. Same rules as the server-side `/connect` flow
 * (`client_auth.ts` in the lukaisu-server repo) — keep them in sync.
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
 * Probe `server/api/v1/version` to confirm the address is a reachable Lukaisu
 * Server. Native HTTP on device (no CORS); fetch fallback in a browser.
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

/**
 * Switch the form between official (field read-only, pinned to the official
 * server) and custom (field editable, restored to the user's draft) modes.
 */
function setMode(official: boolean): void {
  officialToggle.checked = official;
  input.readOnly = official;
  serverHint.textContent = official ? OFFICIAL_HINT : CUSTOM_HINT;
  if (official) {
    input.value = OFFICIAL_SERVER;
  } else {
    input.value = customDraft;
    input.focus();
  }
  formError.hidden = true;
}

/** Show an inline error without disturbing the current mode or field value. */
function showError(message: string): void {
  formError.textContent = message;
  formError.hidden = false;
  connectBtn.disabled = false;
}

function showForm(prefill: string, error = ''): void {
  connecting.hidden = true;
  form.hidden = false;
  // An empty or official prefill defaults to the suggested official server;
  // anything else is treated as a previously chosen custom server.
  if (prefill === '' || prefill === OFFICIAL_SERVER) {
    customDraft = '';
    setMode(true);
  } else {
    customDraft = prefill;
    setMode(false);
  }
  formError.textContent = error;
  formError.hidden = error === '';
  connectBtn.disabled = false;
}

const UNREACHABLE =
  'Could not reach a Lukaisu Server at that address. Check the URL and that '
  + 'the server is online.';

async function submitForm(event: Event): Promise<void> {
  event.preventDefault();
  const server = normalizeServerUrl(input.value);
  if (server === '') {
    showError('Please enter a server address.');
    input.focus();
    return;
  }
  // Reflect the normalized address (e.g. an added https://) back to the field
  // in custom mode; official mode keeps its pinned, read-only value.
  if (!officialToggle.checked) {
    input.value = server;
  }
  connectBtn.disabled = true;
  formError.hidden = true;

  if (await probeServer(server)) {
    await enterServer(server);
    return;
  }
  showError(UNREACHABLE);
  input.focus();
}

/** Launch: saved server → probe + auto-enter; otherwise show the picker. */
async function start(): Promise<void> {
  form.addEventListener('submit', (e) => void submitForm(e));
  officialToggle.addEventListener('change', () => {
    // Preserve whatever was typed in custom mode before pinning the official
    // server, so toggling back restores it.
    if (officialToggle.checked) {
      customDraft = input.value;
    }
    setMode(officialToggle.checked);
  });
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
