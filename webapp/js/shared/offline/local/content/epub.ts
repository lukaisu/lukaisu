/**
 * EPUB parsing + plain-text extraction, ported to run client-side.
 *
 * Faithful port of the server's EPUB import. The HTML→text cleaning mirrors
 * `EpubParserService::cleanHtmlContent` (PHP, the canonical production path)
 * regex-for-regex; the spine walk, nav-doc skipping, title fallback and the
 * min-words / max-chars guards mirror `services/nlp/.../extract/epub.py` (the
 * URL-fetch path this client most resembles). Unzipping uses fflate — a tiny
 * pure-JS inflate — so it runs on any WebView with no native plugin and no
 * dependency on a modern `DecompressionStream`; the OPF / container XML is read
 * with the platform `DOMParser`.
 *
 * Like the Python service, all chapters are joined with a blank line into one
 * text body: the on-device model has no multi-chapter Book entity (offline
 * texts are standalone), so the 65 KB-per-text chapter splitting the server
 * does for its MySQL `TEXT` column is unnecessary here.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { unzipSync, type Unzipped } from 'fflate';
import { corsFreeGetBytes } from './native-http';

// Guards mirroring the Python service (`extract/epub.py`).
const MAX_TEXT_CHARS = 5_000_000; // total extracted-text cap (zip-bomb guard)
const MIN_WORDS = 30; // below this the book is almost certainly image-only
const MIN_DOC_CHARS = 30; // documents shorter than this are nav/toc noise
const MAX_ENTRIES = 2000; // refuse archives with implausibly many files

/** The plain-text book extracted from an EPUB. */
export interface ParsedEpub {
  title: string;
  /** Every chapter joined (kept for coverage previews). */
  text: string;
  /** The spine's chapters in order — the per-chapter import splits on these. */
  chapters: string[];
}

/** A per-chapter text payload to create from a parsed EPUB. */
export interface EpubChapterText {
  title: string;
  text: string;
  tags?: string[];
}

/**
 * Turn a parsed EPUB's chapters into per-chapter text payloads — the settled
 * on-device book model (Option A): an EPUB becomes one normal text per chapter,
 * grouped in the library by a shared tag (the book title), with no persistent
 * book entity. A single-chapter book stays one untagged text.
 */
export function epubChapterTexts(bookTitle: string, chapters: string[]): EpubChapterText[] {
  const nonEmpty = chapters.filter((c) => c.trim() !== '');
  const total = nonEmpty.length;
  if (total <= 1) {
    return [{ title: bookTitle, text: nonEmpty[0] ?? chapters.join('\n\n') }];
  }
  return nonEmpty.map((text, index) => ({
    title: `${bookTitle} — ${index + 1}/${total}`,
    text,
    tags: [bookTitle],
  }));
}

// --- HTML → plain text (port of EpubParserService::cleanHtmlContent) ---------

let decoderEl: HTMLTextAreaElement | null = null;

/**
 * Decode HTML entities, equivalent to PHP's `html_entity_decode(ENT_HTML5)`.
 * Uses a detached `<textarea>` (the same trick as the GDL client) when a DOM is
 * present, with a minimal manual fallback for headless contexts. `&nbsp;`
 * decodes to U+00A0 (as PHP does), which the later space-collapsing step leaves
 * intact — matching the server byte-for-byte.
 */
function decodeEntities(text: string): string {
  if (!text || text.indexOf('&') === -1) {
    return text;
  }
  if (typeof document !== 'undefined') {
    if (!decoderEl) {
      decoderEl = document.createElement('textarea');
    }
    decoderEl.innerHTML = text;
    return decoderEl.value;
  }
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, (m) => {
      const hex = /^&#x/i.test(m);
      const code = parseInt(m.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    })
    .replace(/&amp;/g, '&');
}

/**
 * Convert one chapter's (X)HTML to plain text, preserving paragraph structure
 * as blank lines. Mirrors `EpubParserService::cleanHtmlContent` step for step
 * (`[\s\S]` stands in for PHP's `s`/dotall flag, the convention used elsewhere
 * in this folder).
 */
export function cleanHtmlContent(html: string): string {
  // Remove scripts and styles entirely.
  let text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  // Paragraphs and divs -> blank line.
  text = text.replace(/<\/?(?:p|div)[^>]*>/gi, '\n\n');
  // Line breaks -> newline.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Headings (open + close) -> blank line.
  text = text.replace(/<h[1-6][^>]*>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  // List items -> bullet.
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  // Strip HTML comments, then all remaining tags (strip_tags removes both).
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<[^>]*>/g, '');
  // Decode HTML entities.
  text = decodeEntities(text);
  // Collapse runs of spaces/tabs/CRs to a single space.
  text = text.replace(/[ \t\r]+/g, ' ');
  // Blank-line runs -> a single blank line.
  text = text.replace(/\n\s*\n/g, '\n\n');
  // Trim each line.
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  // Cap at a paragraph break.
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// --- ZIP / OPF / spine -------------------------------------------------------

const utf8 = new TextDecoder('utf-8');

function parseXml(bytes: Uint8Array): Document {
  return new DOMParser().parseFromString(utf8.decode(bytes), 'application/xml');
}

/** Elements by local name, ignoring XML namespace prefixes. */
function byLocalName(root: Document, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function dirName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Resolve a manifest href (relative to the OPF dir) to a ZIP entry path. */
function resolvePath(baseDir: string, href: string): string {
  let h = href.split('#')[0].split('?')[0];
  try {
    h = decodeURIComponent(h);
  } catch {
    // Keep the raw href if it isn't valid percent-encoding.
  }
  if (h.startsWith('/')) {
    h = h.slice(1);
  }
  const parts = (baseDir ? baseDir.split('/') : []).concat(h.split('/'));
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

/** Read `META-INF/container.xml` to find the OPF package path ('' if absent). */
function findOpfPath(zip: Unzipped): string {
  const container = zip['META-INF/container.xml'];
  if (!container) {
    return '';
  }
  for (const rootfile of byLocalName(parseXml(container), 'rootfile')) {
    const fullPath = rootfile.getAttribute('full-path');
    if (fullPath) {
      return fullPath;
    }
  }
  return '';
}

/** Parse the OPF: the book title and the spine's content documents, in order. */
function parseOpf(zip: Unzipped, opfPath: string): { title: string; docs: string[] } {
  const doc = parseXml(zip[opfPath]);
  const baseDir = dirName(opfPath);

  let title = '';
  for (const el of byLocalName(doc, 'title')) {
    const value = (el.textContent ?? '').trim();
    if (value) {
      title = value;
      break;
    }
  }

  const hrefById = new Map<string, string>();
  for (const item of byLocalName(doc, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      hrefById.set(id, resolvePath(baseDir, href));
    }
  }

  const docs: string[] = [];
  for (const itemref of byLocalName(doc, 'itemref')) {
    const idref = itemref.getAttribute('idref');
    if (!idref) {
      continue;
    }
    const path = hrefById.get(idref);
    if (path && zip[path]) {
      docs.push(path);
    }
  }

  return { title, docs };
}

/** Skip nav/toc documents: name hints, or near-empty cleaned text. */
function isNavigationDoc(path: string, cleanedText: string): boolean {
  const name = baseName(path).toLowerCase();
  if (name.includes('nav') || name.includes('toc')) {
    return true;
  }
  return cleanedText.trim().length < MIN_DOC_CHARS;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Parse EPUB bytes into a single plain-text book. Returns `{ error }` when the
 * archive is unreadable or carries too little text to be worth importing.
 */
export function parseEpub(bytes: Uint8Array): ParsedEpub | { error: string } {
  let zip: Unzipped;
  try {
    zip = unzipSync(bytes);
  } catch {
    return { error: 'Could not read the EPUB (not a valid ZIP archive).' };
  }

  const names = Object.keys(zip);
  if (names.length > MAX_ENTRIES) {
    return { error: 'This EPUB has too many files.' };
  }

  const opfPath = findOpfPath(zip);
  let title = '';
  let docs: string[] = [];
  if (opfPath && zip[opfPath]) {
    const parsed = parseOpf(zip, opfPath);
    title = parsed.title;
    docs = parsed.docs;
  }
  // Fallback (no container / empty spine): every (x)html doc in path order.
  if (docs.length === 0) {
    docs = names.filter((n) => /\.x?html?$/i.test(n)).sort();
  }

  const chapters: string[] = [];
  let totalChars = 0;
  for (const path of docs) {
    const raw = zip[path];
    if (!raw) {
      continue;
    }
    let text = cleanHtmlContent(utf8.decode(raw));
    if (isNavigationDoc(path, text)) {
      continue;
    }
    if (!text) {
      continue;
    }
    if (totalChars + text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, Math.max(0, MAX_TEXT_CHARS - totalChars));
    }
    totalChars += text.length;
    chapters.push(text);
    if (totalChars >= MAX_TEXT_CHARS) {
      break;
    }
  }

  const fullText = chapters.join('\n\n');
  if (countWords(fullText) < MIN_WORDS) {
    return {
      error:
        'This book has too little readable text — it is likely an image-only picture book.',
    };
  }

  return { title: title || 'Imported book', text: fullText, chapters };
}

/**
 * Download an EPUB CORS-free and return its bytes, or null when unreachable /
 * empty. The 20 MB cap mirrors the server's `safe_get` EPUB limit.
 */
export async function fetchEpub(url: string): Promise<Uint8Array | null> {
  const res = await corsFreeGetBytes(url, {
    accept: 'application/epub+zip',
    timeoutMs: 30000,
  });
  if (!res.ok || res.bytes.length === 0 || res.bytes.length > 20_000_000) {
    return null;
  }
  return res.bytes;
}
