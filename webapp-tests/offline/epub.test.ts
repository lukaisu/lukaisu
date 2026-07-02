/**
 * Tests for the client-side EPUB import port (`content/epub.ts`):
 *  - `cleanHtmlContent` mirrors `EpubParserService::cleanHtmlContent` (PHP)
 *    step-for-step;
 *  - `parseEpub` unzips a real (in-memory) EPUB, walks the OPF spine, skips
 *    nav/toc docs, decodes entities, drops scripts, and joins chapters — the
 *    same shape the Python `extract/epub.py` service returns.
 *
 * The fixtures are built with fflate's `zipSync`, so these exercise the actual
 * unzip + DOMParser path, not a mock.
 */

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { cleanHtmlContent, parseEpub } from '@shared/offline/local/content/epub';

/** Build an EPUB (ZIP) from a path -> contents map. */
function makeEpub(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, body] of Object.entries(files)) {
    entries[path] = strToU8(body);
  }
  return zipSync(entries);
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function opf(title: string): string {
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;
}

describe('cleanHtmlContent', () => {
  it('turns paragraphs into blank-line-separated text', () => {
    expect(cleanHtmlContent('<p>Hello</p><p>World</p>')).toBe('Hello\n\nWorld');
  });

  it('preserves heading then paragraph as two blocks', () => {
    expect(cleanHtmlContent('<h1>Title</h1><p>Body text here.</p>')).toBe(
      'Title\n\nBody text here.'
    );
  });

  it('converts <br> to a single newline', () => {
    expect(cleanHtmlContent('Line<br/>break')).toBe('Line\nbreak');
  });

  it('converts list items to bullets', () => {
    expect(cleanHtmlContent('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
  });

  it('decodes HTML entities', () => {
    expect(cleanHtmlContent('<p>A &amp; B &lt; C</p>')).toBe('A & B < C');
  });

  it('drops <script> and <style> blocks entirely', () => {
    expect(cleanHtmlContent('<style>.x{color:red}</style><p>Hi</p><script>bad()</script>')).toBe(
      'Hi'
    );
  });

  it('collapses runs of spaces and tabs', () => {
    expect(cleanHtmlContent('<p>a    b\tc</p>')).toBe('a b c');
  });
});

describe('parseEpub', () => {
  const longBody =
    'The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant hills.';

  it('extracts the title and spine text, skipping the nav doc and scripts', () => {
    const epub = makeEpub({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('The Test Reader'),
      'OEBPS/nav.xhtml':
        '<html><body><nav epub:type="toc"><ol><li>Chapter One</li><li>Chapter Two</li></ol></nav></body></html>',
      'OEBPS/chapter1.xhtml': `<html><body><h1>Chapter One</h1><p>${longBody}</p><p>It was a bright day &amp; the clocks struck thirteen everywhere.</p></body></html>`,
      'OEBPS/chapter2.xhtml': `<html><body><p>Sally sells sea shells by the sea shore every single morning.</p><script>var x = 1;</script><p>${longBody}</p></body></html>`,
    });

    const result = parseEpub(epub);
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.title).toBe('The Test Reader');
    // Spine order preserved, chapters joined by a blank line.
    expect(result.text).toContain('Chapter One');
    expect(result.text).toContain('quick brown fox');
    expect(result.text).toContain('Sally sells sea shells');
    // Entity decoded.
    expect(result.text).toContain('bright day & the clocks');
    // Script body stripped.
    expect(result.text).not.toContain('var x');
    // Nav doc skipped (its TOC list never appears as a chapter).
    expect(result.text).not.toContain('Chapter Two');
    expect(result.text.indexOf('Chapter One')).toBeLessThan(
      result.text.indexOf('Sally sells')
    );
  });

  it('falls back to the OPF title when none is given by the caller', () => {
    const epub = makeEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Fallback Title'),
      'OEBPS/nav.xhtml': '<html><body><nav>toc</nav></body></html>',
      'OEBPS/chapter1.xhtml': `<html><body><p>${longBody}</p></body></html>`,
      'OEBPS/chapter2.xhtml': `<html><body><p>${longBody}</p></body></html>`,
    });
    const result = parseEpub(epub);
    if ('error' in result) throw new Error(result.error);
    expect(result.title).toBe('Fallback Title');
  });

  it('errors when the book has too little readable text', () => {
    const epub = makeEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Tiny Picture Book'),
      'OEBPS/nav.xhtml': '<html><body><nav>toc</nav></body></html>',
      'OEBPS/chapter1.xhtml': '<html><body><p>Just three words.</p></body></html>',
      'OEBPS/chapter2.xhtml': '<html><body><img src="pic.png"/></body></html>',
    });
    const result = parseEpub(epub);
    expect('error' in result).toBe(true);
  });

  it('errors on non-ZIP input', () => {
    const result = parseEpub(strToU8('this is not a zip file at all'));
    expect('error' in result).toBe(true);
  });
});
