/**
 * "Add a text" page entry for the bundled client.
 *
 * The server-rendered text form (`Modules/Text/Views/edit_form.php`) does a
 * native multipart POST to `/texts/new` and bundles same-origin-only importers
 * (raw `fetch('/api/v1/…')` against the page's own origin), so it cannot work in
 * the packaged app. This is a purpose-built replacement: the core case — paste a
 * text — creates it through the API client (`TextsApi.create` -> `POST
 * /api/v1/texts`), which the local-first router parses on-device.
 *
 * It also carries **bundle-native import panels** (Job B, surface 2) that fill
 * the Title/Text fields, after which the normal create path lands the result
 * on-device and reads offline like any pasted text:
 *
 *   - **File / subtitle / EPUB** — read on-device, with `.srt`/`.vtt` stripped to
 *     plain text and `.epub` parsed in the browser into one text per chapter
 *     (settled book model — surface 4). No server; available offline.
 *   - **Web page** — `POST /api/v1/texts/extract-url` via the api client (so it
 *     reaches the *connected* server, unlike the legacy relative-fetch
 *     component). Gated: shown only when a server is connected.
 *   - **YouTube** — `GET /api/v1/youtube/video` via the api client. Gated, same.
 *
 * Whisper audio transcription is deferred to a follow-up.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { apiGet, apiPost } from '@shared/api/client';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { TextsApi } from '@modules/text/api/texts_api';
import { BooksApi } from '@modules/book/api/books_api';
import { parseEpub, epubChapterTexts } from '@shared/offline/local/content/epub';

// Whether a server is connected (resolved in start()). EPUB import always creates
// the chapter texts on-device; when server-connected it additionally registers a
// server book over them (chapter nav + progress). Offline the texts stay
// tag-grouped — their local ids mean nothing to a server.
let serverConnected = false;

interface LanguageOption {
  id: number;
  name: string;
}

/** Mutable bits an import fills in for the create submit to read back. */
const importState = { sourceUri: null as string | null };

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showError(target: HTMLElement | null, message: string): void {
  if (target) {
    target.textContent = message;
    target.style.display = '';
  }
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

// ---------------------------------------------------------------------------
// Import helpers (fill the Title/Text fields, then the user reviews and saves)
// ---------------------------------------------------------------------------

function setStatus(target: HTMLElement | null, msg: string, isError = false): void {
  if (!target) return;
  target.textContent = msg;
  target.classList.remove('has-text-danger', 'has-text-success');
  if (isError) target.classList.add('has-text-danger');
  else if (msg) target.classList.add('has-text-success');
}

/** Drop the imported title/text/source into the form for review. */
function fillImported(title: string | undefined, text: string | undefined, source: string | null): void {
  const titleInput = el<HTMLInputElement>('nt-title');
  const textInput = el<HTMLTextAreaElement>('nt-text');
  if (text != null && textInput) textInput.value = text;
  if (title && titleInput) titleInput.value = title;
  importState.sourceUri = source && source !== '' ? source : null;
}

/** True for files whose contents are WebVTT/SRT subtitles. */
function looksLikeSubtitles(name: string, content: string): boolean {
  return (
    /\.(srt|vtt)$/i.test(name) ||
    /^\uFEFF?WEBVTT/.test(content) ||
    /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(content)
  );
}

/** Strip subtitle cues (numbers, timestamps, tags) to plain, de-duplicated text. */
function stripSubtitles(content: string): string {
  const kept: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (/^\uFEFF?WEBVTT/.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    if (/^\d+$/.test(line)) continue; // cue index
    if (line.includes('-->')) continue; // timestamp line
    const clean = line.replace(/<[^>]+>/g, '').trim(); // inline <c>/<00:00.000> tags
    if (clean !== '') kept.push(clean);
  }
  // Auto-captions repeat lines across cues; collapse consecutive duplicates.
  const out: string[] = [];
  for (const line of kept) {
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out.join('\n');
}

function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim();
}

/** True for EPUB books — they take the multi-chapter on-device import path. */
function isEpubFile(file: File): boolean {
  return /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
}

/**
 * Import an EPUB **file** on-device: parse it in the browser (`parseEpub`) and
 * create one text per chapter (settled book model, Option A), grouped by a tag =
 * the book title. Uses the api client so it works offline *and* server-backed,
 * then opens chapter 1. No book entity, no server EPUB upload needed.
 */
async function importEpubFile(file: File): Promise<void> {
  const status = el<HTMLElement>('nt-file-status');
  const langId = Number(el<HTMLSelectElement>('nt-lang')?.value);
  if (!langId) {
    setStatus(status, 'Choose a language first.', true);
    return;
  }
  setStatus(status, `Reading "${file.name}"…`);
  let parsed: ReturnType<typeof parseEpub>;
  try {
    parsed = parseEpub(new Uint8Array(await file.arrayBuffer()));
  } catch {
    setStatus(status, 'Could not read that EPUB file.', true);
    return;
  }
  if ('error' in parsed) {
    setStatus(status, parsed.error, true);
    return;
  }
  const bookTitle =
    parsed.title && parsed.title !== 'Imported book' ? parsed.title : titleFromFilename(file.name);
  const chapters = epubChapterTexts(bookTitle, parsed.chapters);
  setStatus(status, `Importing "${bookTitle}" (${chapters.length} chapter(s))…`);
  let firstId: number | undefined;
  const createdChapters: Array<{ textId: number; title: string }> = [];
  for (const chapter of chapters) {
    const res = await TextsApi.create({
      langId,
      title: chapter.title,
      text: chapter.text,
      tags: chapter.tags,
    });
    if (res.error || res.data?.id == null) {
      setStatus(status, res.error || 'Could not import the book.', true);
      return;
    }
    createdChapters.push({ textId: res.data.id, title: chapter.title });
    if (firstId === undefined) {
      firstId = res.data.id;
    }
  }

  // Server-connected: register a server book over the chapter texts (the ids are
  // now real server ids), so the book appears in the list and the reader gains
  // chapter navigation. Offline the texts stay tag-grouped (their local ids mean
  // nothing to a server). A failure here is non-fatal — the chapters imported.
  if (serverConnected && createdChapters.length > 0) {
    setStatus(status, `Registering “${bookTitle}”…`);
    await BooksApi.createFromChapters(langId, bookTitle, createdChapters);
  }

  if (firstId !== undefined) {
    window.location.assign(pageUrl.read(firstId, langId));
  }
}

function importFromFile(file: File): void {
  if (isEpubFile(file)) {
    void importEpubFile(file);
    return;
  }
  const status = el<HTMLElement>('nt-file-status');
  const titleInput = el<HTMLInputElement>('nt-title');
  setStatus(status, `Reading "${file.name}"…`);
  const reader = new FileReader();
  reader.onerror = () => setStatus(status, 'Could not read the file.', true);
  reader.onload = () => {
    const content = String(reader.result ?? '');
    const text = looksLikeSubtitles(file.name, content) ? stripSubtitles(content) : content;
    const title = titleInput && titleInput.value.trim() === '' ? titleFromFilename(file.name) : undefined;
    fillImported(title, text, null);
    setStatus(status, `Loaded "${file.name}" — review the text below, then save.`);
  };
  reader.readAsText(file);
}

/** Extract a YouTube video id from a watch/share URL, or return the raw id. */
function extractVideoId(input: string): string {
  const s = input.trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : s;
}

async function importFromUrl(): Promise<void> {
  const urlInput = el<HTMLInputElement>('nt-url');
  const titleInput = el<HTMLInputElement>('nt-title');
  const status = el<HTMLElement>('nt-url-status');
  const btn = el<HTMLButtonElement>('nt-url-fetch');
  const url = urlInput?.value.trim() ?? '';
  if (url === '') {
    setStatus(status, 'Enter a URL to import.', true);
    return;
  }
  try {
    new URL(url);
  } catch {
    setStatus(status, 'Enter a valid URL (e.g. https://example.com/article).', true);
    return;
  }
  btn?.classList.add('is-loading');
  setStatus(status, 'Fetching page content…');
  const titleHint = titleInput?.value.trim() ?? '';
  const res = await apiPost<{ title?: string; text?: string; sourceUri?: string; error?: string }>(
    '/texts/extract-url',
    { url, titleHint }
  );
  btn?.classList.remove('is-loading');
  const err = res.error || res.data?.error;
  if (err || !res.data) {
    setStatus(status, err || 'Could not import that page.', true);
    return;
  }
  fillImported(res.data.title, res.data.text, res.data.sourceUri ?? url);
  setStatus(status, `Imported "${res.data.title ?? url}" — review the text below, then save.`);
}

async function importFromYouTube(): Promise<void> {
  const ytInput = el<HTMLInputElement>('nt-yt');
  const status = el<HTMLElement>('nt-yt-status');
  const btn = el<HTMLButtonElement>('nt-yt-fetch');
  const videoId = extractVideoId(ytInput?.value ?? '');
  if (videoId === '') {
    setStatus(status, 'Enter a YouTube URL or video ID.', true);
    return;
  }
  btn?.classList.add('is-loading');
  setStatus(status, 'Fetching YouTube data…');
  const res = await apiGet<{
    data?: { success: boolean; data?: { title: string; description: string; source_url: string }; error?: string };
  }>('/youtube/video', { video_id: videoId });
  btn?.classList.remove('is-loading');
  const proxy = res.data?.data;
  if (res.error || !proxy?.success) {
    setStatus(status, res.error || proxy?.error || 'Could not fetch that video.', true);
    return;
  }
  fillImported(proxy.data?.title, proxy.data?.description, proxy.data?.source_url ?? null);
  setStatus(status, `Imported "${proxy.data?.title ?? videoId}" — review the text below, then save.`);
}

/**
 * Wire the import-source toolbar: a button reveals its panel (hiding the
 * others). The web-page / YouTube sources need a connected server, so their
 * buttons stay hidden offline; file/subtitle import is always available.
 */
function setupImportSources(localFirst: boolean): void {
  const root = el<HTMLElement>('nt-import');
  if (!root) return;

  if (!localFirst) {
    root.querySelectorAll<HTMLElement>('[data-import="url"], [data-import="youtube"]')
      .forEach((b) => b.removeAttribute('hidden'));
  }

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-import]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-import-panel]'));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const source = button.getAttribute('data-import');
      const panel = panels.find((p) => p.getAttribute('data-import-panel') === source);
      const opening = panel?.hasAttribute('hidden') ?? false;
      panels.forEach((p) => p.setAttribute('hidden', ''));
      buttons.forEach((b) => b.classList.remove('is-link', 'is-selected'));
      if (opening && panel) {
        panel.removeAttribute('hidden');
        button.classList.add('is-link', 'is-selected');
      }
    });
  }

  el<HTMLInputElement>('nt-file')?.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) importFromFile(file);
  });
  el<HTMLButtonElement>('nt-url-fetch')?.addEventListener('click', () => void importFromUrl());
  el<HTMLButtonElement>('nt-yt-fetch')?.addEventListener('click', () => void importFromYouTube());
}

function setupForm(languages: LanguageOption[]): void {
  const langSelect = el<HTMLSelectElement>('nt-lang');
  const titleInput = el<HTMLInputElement>('nt-title');
  const textInput = el<HTMLTextAreaElement>('nt-text');
  const tagsInput = el<HTMLInputElement>('nt-tags');
  const form = el<HTMLFormElement>('new-text-form');
  const errorEl = el<HTMLElement>('nt-error');
  const submit = el<HTMLButtonElement>('nt-submit');
  const noLang = el<HTMLElement>('nt-no-lang');
  if (!langSelect || !titleInput || !textInput || !form) {
    return;
  }

  // No language yet -> a text has nothing to parse into. Guide to create one.
  if (languages.length === 0) {
    if (noLang) {
      noLang.style.display = '';
    }
    form.style.display = 'none';
    return;
  }

  for (const lang of languages) {
    const option = document.createElement('option');
    option.value = String(lang.id);
    option.textContent = lang.name;
    langSelect.appendChild(option);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (errorEl) {
      errorEl.style.display = 'none';
    }
    const langId = Number(langSelect.value);
    const title = titleInput.value.trim();
    const text = textInput.value.trim();
    if (!langId || title === '' || text === '') {
      showError(errorEl, 'Please choose a language and enter a title and some text.');
      return;
    }
    submit?.classList.add('is-loading');
    const tags = parseTags(tagsInput?.value ?? '');
    const sourceUri = importState.sourceUri ?? undefined;
    void TextsApi.create({ langId, title, text, tags, sourceUri }).then((res) => {
      const id = res.data?.id;
      if (res.error || !id) {
        showError(errorEl, res.error || 'Could not create the text.');
        submit?.classList.remove('is-loading');
        return;
      }
      // Created and parsed on-device: open it in the reader.
      window.location.assign(pageUrl.read(id, langId));
    });
  });
}

async function start(): Promise<void> {
  // Become local-first (and seed on first run) before listing languages or
  // POSTing, so the core paste/save path is served on-device. The return flag
  // gates the server-only importers.
  const localFirst = await initDataMode();
  serverConnected = !localFirst;
  const res = await LanguagesApi.list();
  const languages = (res.data?.languages ?? []).map((l) => ({ id: l.id, name: l.name }));
  setupForm(languages);
  if (languages.length > 0) {
    setupImportSources(localFirst);
  }
  await bootAppPage({ requireAuth: true });
}

void start();
