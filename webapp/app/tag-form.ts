/**
 * Tag-form page entry for the bundled client — the Svelte 5 `TagForm` island
 * (the Alpine→Svelte port of `Modules/Tags/Views/tag_form.php`).
 *
 * One page serves four server forms via the query string:
 *   - `?kind=term`            → new term tag   (was GET /tags/new)
 *   - `?kind=term&id=5`       → edit term tag  (was GET /tags/5/edit)
 *   - `?kind=text`            → new text tag   (was GET /tags/text/new)
 *   - `?kind=text&id=5`       → edit text tag  (was GET /tags/text/5/edit)
 *
 * Server-only (gated like feeds.ts): create/edit go through
 * `/api/v1/tags/{term,text}`, which the local-first router does not serve. So:
 *   - **server-backed / same-origin** (a server is connected): boot i18n, fetch
 *     the current tag in edit mode, then mount the island into `#tag-form-root`.
 *   - **local-first** (packaged app, no server): reveal a "connect a server"
 *     notice and mount nothing, so no tag write/read endpoint is requested.
 *
 * Mirrors feeds.ts ordering (`initDataMode` → `bootI18n` → fetch/mount →
 * `bootAppPage`). The kind/id come from the URL, preserved by the
 * `/tags(/text)/...` → bundle redirect (BundleController + app/router.ts).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { mount } from 'svelte';
import TagForm from '@modules/tags/pages/TagForm.svelte';
import { TagsApi } from '@modules/tags/api/tags_api';
import { bootAppPage, initDataMode } from './boot';
import { bootI18n } from '@shared/i18n/translator';
import { pageUrl } from './router';

const params = new URLSearchParams(window.location.search);
const kind: 'term' | 'text' = params.get('kind') === 'text' ? 'text' : 'term';
const idParam = parseInt(params.get('id') ?? '', 10);
const tagId = Number.isFinite(idParam) && idParam > 0 ? idParam : 0;
const mode: 'new' | 'edit' = tagId > 0 ? 'edit' : 'new';

async function start(): Promise<void> {
  // Resolve local-first vs server mode before deciding whether to mount.
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: surface the "connect a server" notice and mount nothing, so no
    // tag read/write endpoint is requested.
    document.getElementById('tag-form-offline')?.removeAttribute('hidden');
    document.getElementById('tag-form-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
    await bootAppPage({ requireAuth: true });
    return;
  }

  // Server connected: load translations, then (edit mode) fetch the tag to
  // prefill. A missing tag bounces back to the tag list.
  await bootI18n();

  let initialText = '';
  let initialComment = '';
  if (mode === 'edit') {
    const res = kind === 'term' ? await TagsApi.getTerm(tagId) : await TagsApi.getText(tagId);
    if (!res.data) {
      window.location.replace(pageUrl.tags());
      return;
    }
    initialText = res.data.text;
    initialComment = res.data.comment;
  }

  const target = document.getElementById('tag-form-root');
  if (target) {
    mount(TagForm, {
      target,
      // `listUrl` is resolved here (the entry owns app/router) and threaded in so
      // the island stays URL-agnostic — cancel + save-success both land on it.
      props: { kind, mode, tagId, initialText, initialComment, listUrl: pageUrl.tags() }
    });
  }

  // Boot the shared shell (navbar, link router, Alpine) after the island mounts;
  // they manage disjoint DOM regions.
  await bootAppPage({ requireAuth: true });
}

void start();
