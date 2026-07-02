/**
 * Tests for the client-side content-discovery port: difficulty tiers, GDL level
 * mapping, language-code resolution, and Gutenberg text-URL selection /
 * boilerplate stripping. These mirror the server's PHP/Python rules 1:1.
 */

import { describe, it, expect } from 'vitest';
import {
  classifySubjects,
  computeQuickTier,
  isBeginnerVocabulary,
  sortByTier,
  type DifficultyTier,
} from '@shared/offline/local/content/difficulty';
import { levelToTier } from '@shared/offline/local/content/gdl';
import { resolveLanguageCode } from '@shared/offline/local/content/lang-code';
import {
  extractTextUrl,
  stripGutenbergBoilerplate,
} from '@shared/offline/local/content/gutenberg';

describe('classifySubjects', () => {
  it('returns easy when any easy keyword matches', () => {
    expect(classifySubjects(['Juvenile fiction', 'Adventure'])).toBe('easy');
    expect(classifySubjects(['Fairy tales'])).toBe('easy');
  });

  it('returns hard when any hard keyword matches and no easy one does', () => {
    expect(classifySubjects(['Philosophy', 'Ethics'])).toBe('hard');
    expect(classifySubjects(['Mathematics'])).toBe('hard');
  });

  it('prefers easy over hard when both are present', () => {
    expect(classifySubjects(['Philosophy for children'])).toBe('easy');
  });

  it('defaults to medium with no keyword match', () => {
    expect(classifySubjects(['Sea stories', 'Whaling'])).toBe('medium');
    expect(classifySubjects([])).toBe('medium');
  });
});

describe('computeQuickTier (vocabulary-adjusted)', () => {
  it('is always hard with zero known words', () => {
    expect(computeQuickTier(0, ['Juvenile'])).toBe('hard');
  });

  it('shifts up below 500 known words (easy->medium, else->hard)', () => {
    expect(computeQuickTier(100, ['Juvenile'])).toBe('medium');
    expect(computeQuickTier(100, ['Sea stories'])).toBe('hard');
    expect(computeQuickTier(100, ['Philosophy'])).toBe('hard');
  });

  it('uses the subject tier unchanged for 500..2000 known words', () => {
    expect(computeQuickTier(500, ['Juvenile'])).toBe('easy');
    expect(computeQuickTier(1500, ['Sea stories'])).toBe('medium');
    expect(computeQuickTier(2000, ['Philosophy'])).toBe('hard');
  });

  it('shifts down above 2000 known words (hard->medium, else->easy)', () => {
    expect(computeQuickTier(2001, ['Philosophy'])).toBe('medium');
    expect(computeQuickTier(2001, ['Sea stories'])).toBe('easy');
    expect(computeQuickTier(2001, ['Juvenile'])).toBe('easy');
  });
});

describe('isBeginnerVocabulary', () => {
  it('is true below 500 known words', () => {
    expect(isBeginnerVocabulary(0)).toBe(true);
    expect(isBeginnerVocabulary(499)).toBe(true);
  });
  it('is false at or above 500', () => {
    expect(isBeginnerVocabulary(500)).toBe(false);
    expect(isBeginnerVocabulary(5000)).toBe(false);
  });
});

describe('sortByTier', () => {
  it('orders easy, then medium, then hard, stably', () => {
    const books: Array<{ id: number; difficultyTier?: DifficultyTier }> = [
      { id: 1, difficultyTier: 'hard' },
      { id: 2, difficultyTier: 'easy' },
      { id: 3, difficultyTier: 'medium' },
      { id: 4, difficultyTier: 'easy' },
      { id: 5 },
    ];
    expect(sortByTier(books).map((b) => b.id)).toEqual([2, 4, 3, 5, 1]);
  });
});

describe('levelToTier (GDL)', () => {
  it('maps levels 1-2 to easy, 3 to medium, 4-5 to hard', () => {
    expect(levelToTier('Level 1')).toBe('easy');
    expect(levelToTier('Level 2')).toBe('easy');
    expect(levelToTier('Level 3')).toBe('medium');
    expect(levelToTier('Level 4')).toBe('hard');
    expect(levelToTier('Level 5')).toBe('hard');
  });
  it('returns empty for a label with no number', () => {
    expect(levelToTier('Beginner')).toBe('');
    expect(levelToTier('')).toBe('');
  });
});

describe('resolveLanguageCode', () => {
  it('uses the code, stripping region/script subtags', () => {
    expect(resolveLanguageCode({ code: 'fr' })).toBe('fr');
    expect(resolveLanguageCode({ code: 'zh-CN' })).toBe('zh');
    expect(resolveLanguageCode({ code: 'pt_BR' })).toBe('pt');
  });
  it('falls back to the language name map', () => {
    expect(resolveLanguageCode({ code: '', name: 'French' })).toBe('fr');
    expect(resolveLanguageCode({ name: 'Brazilian Portuguese' })).toBe('pt');
  });
  it('returns null when nothing resolves', () => {
    expect(resolveLanguageCode({ code: '', name: 'Klingon' })).toBeNull();
    expect(resolveLanguageCode(null)).toBeNull();
  });
});

describe('extractTextUrl (Gutendex formats)', () => {
  it('prefers an explicitly UTF-8 plain-text entry', () => {
    const formats = {
      'text/plain; charset=us-ascii': 'http://x/ascii.txt',
      'text/plain; charset=utf-8': 'http://x/utf8.txt',
      'application/epub+zip': 'http://x/book.epub',
    };
    expect(extractTextUrl(formats)).toBe('http://x/utf8.txt');
  });
  it('falls back to a .txt URL, then any plain-text entry', () => {
    expect(
      extractTextUrl({ 'text/plain': 'http://x/file.txt' })
    ).toBe('http://x/file.txt');
    expect(
      extractTextUrl({ 'text/plain; charset=iso-8859-1': 'http://x/latin1' })
    ).toBe('http://x/latin1');
  });
  it('returns empty when there is no plain text', () => {
    expect(extractTextUrl({ 'application/epub+zip': 'http://x/book.epub' })).toBe('');
    expect(extractTextUrl(undefined)).toBe('');
  });
});

describe('stripGutenbergBoilerplate', () => {
  it('keeps only the body between the START and END markers', () => {
    const raw = [
      'Title etc. donation notices',
      '*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***',
      'Call me Ishmael.',
      '*** END OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***',
      'License and footer.',
    ].join('\n');
    expect(stripGutenbergBoilerplate(raw)).toBe('Call me Ishmael.');
  });
  it('matches the THIS variant case-insensitively', () => {
    const raw = '*** start of this project gutenberg ebook x ***\nBody\n*** end of this project gutenberg ebook x ***';
    expect(stripGutenbergBoilerplate(raw)).toBe('Body');
  });
  it('returns the trimmed text unchanged when markers are absent', () => {
    expect(stripGutenbergBoilerplate('  Just text.  ')).toBe('Just text.');
  });
});
