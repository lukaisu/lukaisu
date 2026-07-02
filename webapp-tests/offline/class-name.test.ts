/**
 * The offline term-identity token (`toClassName`) must stay byte-for-byte
 * identical to the server's `StringUtils::toClassName`
 * (`substr(hash('sha256', $s), 0, 16)`) so server-rendered `data_hex` spans and
 * tokens the client recomputes line up in the hybrid PWA. See issue #237.
 *
 * The expected values below are `php -r 'echo substr(hash("sha256", $s), 0, 16)'`.
 */

import { describe, it, expect } from 'vitest';
import { toClassName } from '@shared/offline/local/class-name';

describe('toClassName — SHA-256 identity token (matches PHP)', () => {
  it('matches the PHP SHA-256 vectors', () => {
    expect(toClassName('hello')).toBe('2cf24dba5fb0a30e');
    expect(toClassName('test123')).toBe('ecd71870d1963316');
    expect(toClassName('hello world')).toBe('b94d27b9934d3e08');
    // Multi-byte input hashes over UTF-8 bytes, same as PHP.
    expect(toClassName('hello 世界')).toBe('2e2625f7c51b4a2c');
  });

  it('always yields a selector-safe 16-char lowercase hex token', () => {
    for (const s of ['', 'a', 'WORD', 'café', '世界', 'a b.c!', '日本語のテキスト']) {
      expect(toClassName(s)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('is deterministic and case/whitespace sensitive', () => {
    expect(toClassName('Hello')).toBe(toClassName('Hello'));
    expect(toClassName('Hello')).not.toBe(toClassName('hello'));
    expect(toClassName('a b')).not.toBe(toClassName('ab'));
  });
});
