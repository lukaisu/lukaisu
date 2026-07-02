/**
 * Feed-form option (de)serialization — the toggle state ↔ options-string bridge.
 *
 * Originally ported from the retired Alpine `feedForm` component + feed-wizard
 * store serialization, this is now the single source of truth the Svelte
 * `FeedFormPage` island uses to turn its checkbox/value state into the
 * comma-separated `options` string the server persists, and back.
 *
 * The string format is `key=value,key2=value2`, parsed server-side by
 * `FeedFacade::getNfOption()` (splits on `,` then `=`, trims, keeps the first
 * `=`-delimited value). The facade `rtrim`s a trailing comma on save, so the
 * canonical stored form carries **no** trailing comma — this serializer emits
 * that canonical form (the Alpine version's cosmetic trailing comma is dropped),
 * which makes an existing feed's `optionsString` round-trip byte-for-byte.
 *
 * `parseFeedOptions` mirrors `getNfOption` exactly (including its first-`=`-wins
 * value truncation) so the form is seeded with what the server actually stored.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Auto-update interval unit. */
export type FeedAutoUpdateUnit = 'h' | 'd' | 'w';

/** Checkbox/value state for the feed form's collapsible options block. */
export interface FeedFormOptionsState {
  /** Show the article text for editing before importing (`edit_text=1`). */
  editText: boolean;
  /** Auto-refresh the feed on an interval (`autoupdate=<value><unit>`). */
  autoUpdate: boolean;
  autoUpdateValue: string;
  autoUpdateUnit: FeedAutoUpdateUnit;
  /** Cap on stored article links (`max_links=<value>`). */
  maxLinks: boolean;
  maxLinksValue: string;
  /** Override the feed charset (`charset=<value>`). */
  charset: boolean;
  charsetValue: string;
  /** Cap on texts imported at once (`max_texts=<value>`). */
  maxTexts: boolean;
  maxTextsValue: string;
  /** Auto-tag imported texts (`tag=<value>`). */
  tag: boolean;
  tagValue: string;
  /** Source attribution shown on imported texts (`article_source=<value>`). */
  articleSource: boolean;
  articleSourceValue: string;
}

/**
 * Defaults for the *create* form: `editText` on (matching the Alpine `new.php`
 * checkbox default), every other option off. Note this differs from the state
 * that `parseFeedOptions('')` yields (all off) — an empty saved options string
 * means the feed genuinely has `edit_text` off, whereas a brand-new feed opts
 * into it by default.
 */
export function defaultFeedFormOptionsState(): FeedFormOptionsState {
  return {
    editText: true,
    autoUpdate: false,
    autoUpdateValue: '',
    autoUpdateUnit: 'h',
    maxLinks: false,
    maxLinksValue: '',
    charset: false,
    charsetValue: '',
    maxTexts: false,
    maxTextsValue: '',
    tag: false,
    tagValue: '',
    articleSource: false,
    articleSourceValue: ''
  };
}

/**
 * Serialize toggle state into the canonical options string (no trailing comma).
 * Order matches the Alpine `feedForm` component so form-authored feeds keep a
 * stable string.
 */
export function serializeFeedOptions(state: FeedFormOptionsState): string {
  const parts: string[] = [];

  if (state.editText) {
    parts.push('edit_text=1');
  }
  if (state.autoUpdate && state.autoUpdateValue) {
    parts.push(`autoupdate=${state.autoUpdateValue}${state.autoUpdateUnit}`);
  }
  if (state.maxLinks && state.maxLinksValue) {
    parts.push(`max_links=${state.maxLinksValue}`);
  }
  if (state.charset && state.charsetValue) {
    parts.push(`charset=${state.charsetValue}`);
  }
  if (state.maxTexts && state.maxTextsValue) {
    parts.push(`max_texts=${state.maxTextsValue}`);
  }
  if (state.tag && state.tagValue) {
    parts.push(`tag=${state.tagValue}`);
  }
  if (state.articleSource && state.articleSourceValue) {
    parts.push(`article_source=${state.articleSourceValue}`);
  }

  return parts.join(',');
}

/**
 * Parse a stored options string into toggle state, mirroring the server's
 * `getNfOption` (split on `,`, then on `=`, trim key + first value).
 */
export function parseFeedOptions(optionsString: string): FeedFormOptionsState {
  const state = defaultFeedFormOptionsState();
  // Reset editText: presence in the string (not the create-form default) decides.
  state.editText = false;

  const trimmed = (optionsString ?? '').trim();
  if (trimmed === '') {
    return state;
  }

  const map: Record<string, string> = {};
  for (const entry of trimmed.split(',')) {
    // Match getNfOption: explode('=') then take [0]/[1] (first `=` wins).
    const eq = entry.split('=');
    const key = (eq[0] ?? '').trim();
    const value = (eq[1] ?? '').trim();
    if (key !== '') {
      map[key] = value;
    }
  }

  if ('edit_text' in map) {
    state.editText = true;
  }
  if ('autoupdate' in map) {
    state.autoUpdate = true;
    const raw = map.autoupdate;
    const unit = raw.slice(-1);
    if (unit === 'h' || unit === 'd' || unit === 'w') {
      state.autoUpdateUnit = unit;
      state.autoUpdateValue = raw.slice(0, -1);
    } else {
      state.autoUpdateValue = raw;
    }
  }
  if ('max_links' in map) {
    state.maxLinks = true;
    state.maxLinksValue = map.max_links;
  }
  if ('charset' in map) {
    state.charset = true;
    state.charsetValue = map.charset;
  }
  if ('max_texts' in map) {
    state.maxTexts = true;
    state.maxTextsValue = map.max_texts;
  }
  if ('tag' in map) {
    state.tag = true;
    state.tagValue = map.tag;
  }
  if ('article_source' in map) {
    state.articleSource = true;
    state.articleSourceValue = map.article_source;
  }

  return state;
}
