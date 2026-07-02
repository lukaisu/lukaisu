/**
 * Feed-form bootstrap config fetch.
 *
 * The `FeedFormPage` island needs the server's language list (for the language
 * select) and, in edit mode, the feed record to prefill. The server exposes them
 * at `GET /api/v1/feeds/new/config` and `GET /api/v1/feeds/{id}/edit/config`
 * (FeedApiHandler dispatches both to FeedController@configNew / @configEdit),
 * fetched through the api client so a connected remote server authenticates them
 * by bearer token.
 *
 * The page is server-gated (the `/api/v1/feeds` endpoints have no local-first
 * arm), so offline the island is never mounted and this is never called.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet } from '@shared/api/client';
import type { Feed, Language } from './feeds_api';

/** Bootstrap config the FeedFormPage island reads on mount. */
export interface FeedFormConfig {
  /** Languages for the select (`[{id,name}]`). */
  languages: Language[];
  /** Pre-selected language for the create form (0 when none). */
  currentLang: number;
  /** The feed to edit, or `null` in create mode. */
  feed: Feed | null;
}

/**
 * Fetch the feed-form bootstrap config. `feedId > 0` fetches the edit config
 * (with the feed prefill); otherwise the create config. Returns `null` when the
 * feed is unknown or the request fails (the caller bounces to the feed list).
 */
export async function fetchFeedFormConfig(feedId: number): Promise<FeedFormConfig | null> {
  const path = feedId > 0 ? `/feeds/${feedId}/edit/config` : '/feeds/new/config';
  try {
    const response = await apiGet<FeedFormConfig>(path);
    const data = response.data;
    if (!data || !Array.isArray(data.languages)) {
      return null;
    }
    return {
      languages: data.languages,
      currentLang: typeof data.currentLang === 'number' ? data.currentLang : 0,
      feed: data.feed ?? null
    };
  } catch {
    return null;
  }
}
