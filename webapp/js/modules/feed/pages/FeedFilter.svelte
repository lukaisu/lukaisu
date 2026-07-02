<!--
  Feed Filter — Svelte 5 port of the Alpine `feedFilter` component.

  The language / sort / search bar above the feed list. Reads the available
  languages and the current filter state from the shared `FeedManagerStore` and
  drives `setFilterLang` / `setSort` / `setFilterQuery` (each resets to page 1
  and reloads, in the store). The search box keeps its own `localQuery`
  (committed on Enter or the search button), exactly like the Alpine component.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  // Local, uncommitted search text (mirrors the Alpine `localQuery`, seeded once).
  let localQuery = $state(untrack(() => store.filterQuery));

  function setLang(value: string): void {
    void store.setFilterLang(value === '' ? '' : parseInt(value, 10));
  }

  function setSort(value: string): void {
    void store.setSort(parseInt(value, 10));
  }

  function search(): void {
    void store.setFilterQuery(localQuery);
  }

  function clearSearch(): void {
    localQuery = '';
    void store.setFilterQuery('');
  }

  function onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      search();
    }
  }
</script>

<div class="box mb-4">
  <div class="columns is-multiline is-vcentered">
    <!-- Language filter -->
    <div class="column is-narrow">
      <div class="field has-addons">
        <div class="control">
          <span class="button is-static is-small">{t('feed.spa_filter_language')}</span>
        </div>
        <div class="control">
          <div class="select is-small">
            <select
              value={store.filterLang}
              onchange={(e) => setLang(e.currentTarget.value)}
              aria-label={t('feed.spa_filter_language')}
            >
              <option value="">{t('feed.spa_filter_all_languages')}</option>
              {#each store.languages as lang (lang.id)}
                <option value={lang.id}>{lang.name}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Sort -->
    <div class="column is-narrow">
      <div class="field has-addons">
        <div class="control">
          <span class="button is-static is-small">{t('feed.spa_filter_sort')}</span>
        </div>
        <div class="control">
          <div class="select is-small">
            <select
              value={store.sort}
              onchange={(e) => setSort(e.currentTarget.value)}
              aria-label={t('feed.spa_filter_sort')}
            >
              <option value={1}>{t('feed.spa_sort_name_az')}</option>
              <option value={2}>{t('feed.spa_sort_updated_newest')}</option>
              <option value={3}>{t('feed.spa_sort_updated_oldest')}</option>
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
            placeholder={t('feed.spa_search_placeholder')}
            bind:value={localQuery}
            onkeyup={onSearchKey}
          />
        </div>
        <div class="control">
          <button class="button is-small is-info" onclick={search} aria-label={t('feed.spa_filter_sort')}>
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
