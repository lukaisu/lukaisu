/**
 * Tests for feed_form_options.ts — the Svelte FeedFormPage island's option
 * (de)serialization. The #1 correctness risk in the Alpine→Svelte port is the
 * `options` string round-trip against the server's `getNfOption` format, so this
 * asserts it byte-for-byte (canonical order) and semantically (any order).
 */

import { describe, it, expect } from 'vitest';
import {
  defaultFeedFormOptionsState,
  parseFeedOptions,
  serializeFeedOptions,
  type FeedFormOptionsState
} from '../../webapp/js/modules/feed/utils/feed_form_options';

/** Emulate the server-side FeedFacade::getNfOption($str, 'all') parse. */
function serverParse(optionsString: string): Record<string, string> {
  const map: Record<string, string> = {};
  const trimmed = optionsString.trim();
  if (trimmed === '') {
    return map;
  }
  for (const entry of trimmed.split(',')) {
    const eq = entry.split('=');
    const key = (eq[0] ?? '').trim();
    const value = (eq[1] ?? '').trim();
    if (key !== '') {
      map[key] = value;
    }
  }
  return map;
}

describe('feed_form_options', () => {
  describe('defaultFeedFormOptionsState', () => {
    it('turns edit_text on and everything else off (matches new.php)', () => {
      const s = defaultFeedFormOptionsState();
      expect(s.editText).toBe(true);
      expect(s.autoUpdate).toBe(false);
      expect(s.autoUpdateUnit).toBe('h');
      expect(s.maxLinks).toBe(false);
      expect(s.charset).toBe(false);
      expect(s.maxTexts).toBe(false);
      expect(s.tag).toBe(false);
      expect(s.articleSource).toBe(false);
    });
  });

  describe('serializeFeedOptions', () => {
    it('emits the canonical string with no trailing comma', () => {
      const s = defaultFeedFormOptionsState();
      s.autoUpdate = true;
      s.autoUpdateValue = '2';
      s.autoUpdateUnit = 'h';
      s.maxLinks = true;
      s.maxLinksValue = '50';
      s.charset = true;
      s.charsetValue = 'UTF-8';
      s.maxTexts = true;
      s.maxTextsValue = '10';
      s.tag = true;
      s.tagValue = 'news';
      s.articleSource = true;
      s.articleSourceValue = 'example';
      expect(serializeFeedOptions(s)).toBe(
        'edit_text=1,autoupdate=2h,max_links=50,charset=UTF-8,max_texts=10,tag=news,article_source=example'
      );
    });

    it('drops disabled toggles and toggles with empty values', () => {
      const s = defaultFeedFormOptionsState();
      s.autoUpdate = true;
      s.autoUpdateValue = ''; // enabled but empty -> omitted
      s.charset = false;
      s.charsetValue = 'UTF-8'; // value present but disabled -> omitted
      expect(serializeFeedOptions(s)).toBe('edit_text=1');
    });

    it('produces an empty string when nothing is set', () => {
      const s = defaultFeedFormOptionsState();
      s.editText = false;
      expect(serializeFeedOptions(s)).toBe('');
    });
  });

  describe('parseFeedOptions', () => {
    it('returns all-off (edit_text off) for an empty string', () => {
      const s = parseFeedOptions('');
      expect(s.editText).toBe(false);
      expect(s.autoUpdate).toBe(false);
    });

    it('splits the autoupdate value into interval + unit', () => {
      const s = parseFeedOptions('autoupdate=3d');
      expect(s.autoUpdate).toBe(true);
      expect(s.autoUpdateValue).toBe('3');
      expect(s.autoUpdateUnit).toBe('d');
    });

    it('tolerates a trailing comma (server rtrim quirk)', () => {
      const s = parseFeedOptions('edit_text=1,tag=news,');
      expect(s.editText).toBe(true);
      expect(s.tag).toBe(true);
      expect(s.tagValue).toBe('news');
    });
  });

  describe('round-trip', () => {
    it('parse -> serialize reproduces a canonical-order string byte-for-byte', () => {
      const original =
        'edit_text=1,autoupdate=2h,max_links=50,charset=UTF-8,max_texts=10,tag=news,article_source=example';
      expect(serializeFeedOptions(parseFeedOptions(original))).toBe(original);
    });

    it('serialize -> parse -> serialize is stable (idempotent)', () => {
      const state: FeedFormOptionsState = {
        editText: true,
        autoUpdate: true,
        autoUpdateValue: '1',
        autoUpdateUnit: 'w',
        maxLinks: false,
        maxLinksValue: '',
        charset: true,
        charsetValue: 'iso-8859-1',
        maxTexts: false,
        maxTextsValue: '',
        tag: true,
        tagValue: 'blog',
        articleSource: false,
        articleSourceValue: ''
      };
      const once = serializeFeedOptions(state);
      const twice = serializeFeedOptions(parseFeedOptions(once));
      expect(twice).toBe(once);
    });

    it('is semantically stable for a wizard-ordered string (getNfOption is order-free)', () => {
      // The wizard's buildOptionsString emits max_texts before charset; our
      // serializer uses charset before max_texts. Both parse identically, so the
      // re-serialized string is a reordering with the same server-parsed meaning.
      const wizardOrder = 'edit_text=1,autoupdate=2h,max_links=50,max_texts=10,charset=UTF-8,tag=news';
      const reserialized = serializeFeedOptions(parseFeedOptions(wizardOrder));
      expect(reserialized).toBe(
        'edit_text=1,autoupdate=2h,max_links=50,charset=UTF-8,max_texts=10,tag=news'
      );
      // Server sees the same key/value map either way.
      expect(serverParse(reserialized)).toEqual(serverParse(wizardOrder));
    });
  });
});
