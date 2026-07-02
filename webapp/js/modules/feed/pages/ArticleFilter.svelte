<!--
  Article Filter — Svelte 5 port of the Alpine `articleFilter` component.

  The sort / search bar above the article list. Drives `setArticlesSort` /
  `setArticlesQuery` on the shared `FeedManagerStore` (each resets to page 1 and
  reloads the current feed's articles, in the store). Keeps its own uncommitted
  `localQuery`, committed on Enter or the search button, like the Alpine version.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  // Seed the uncommitted search text once from the store (initial value only).
  let localQuery = $state(untrack(() => store.articlesQuery));

  function setSort(value: string): void {
    void store.setArticlesSort(parseInt(value, 10));
  }

  function search(): void {
    void store.setArticlesQuery(localQuery);
  }

  function clearSearch(): void {
    localQuery = '';
    void store.setArticlesQuery('');
  }

  function onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      search();
    }
  }
</script>

<div class="box mb-4">
  <div class="columns is-vcentered">
    <!-- Sort -->
    <div class="column is-narrow">
      <div class="field has-addons">
        <div class="control">
          <span class="button is-static is-small">Sort</span>
        </div>
        <div class="control">
          <div class="select is-small">
            <select value={store.articlesSort} onchange={(e) => setSort(e.currentTarget.value)} aria-label="Sort articles">
              <option value={1}>{t('feed.spa_article_sort_date_newest')}</option>
              <option value={2}>{t('feed.spa_article_sort_date_oldest')}</option>
              <option value={3}>{t('feed.spa_article_sort_title_az')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="column">
      <div class="field has-addons">
        <div class="control is-expanded">
          <input
            class="input is-small"
            type="text"
            placeholder={t('feed.spa_article_search_placeholder')}
            bind:value={localQuery}
            onkeyup={onSearchKey}
          />
        </div>
        <div class="control">
          <button class="button is-small is-info" onclick={search} aria-label="Search articles">
            <i data-lucide="search" class="icon icon-sm" style="width:16px;height:16px"></i>
          </button>
        </div>
        <!-- Always rendered (icon hydrates once at mount), shown only when there
             is text — the Alpine `x-show="localQuery"` semantics. -->
        <div class="control" style:display={localQuery ? '' : 'none'}>
          <button class="button is-small" onclick={clearSearch} aria-label="Clear search">
            <i data-lucide="x" class="icon icon-sm" style="width:16px;height:16px"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
