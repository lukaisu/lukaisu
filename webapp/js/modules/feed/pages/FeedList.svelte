<!--
  Feed List — Svelte 5 port of the Alpine `feedList` component.

  The feed table for the list view: a select-all header, per-row select / view /
  edit / load / delete actions, an empty state and pagination. All state and
  behaviour come from the shared `FeedManagerStore`; destructive actions confirm
  first (matching the Alpine `confirm()` guards). Rendered only when the store
  is not loading (the host shows the spinner during a load).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { t } from '@shared/i18n/translator';
  import type { Feed } from '@modules/feed/api/feeds_api';
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  const selectedCount = $derived(store.selectedFeedIds.length);
  const allSelected = $derived(
    store.feeds.length > 0 && store.selectedFeedIds.length === store.feeds.length
  );
  // Page numbers 1..total_pages, for the pagination list.
  const pageNumbers = $derived(
    Array.from({ length: store.feedsPagination.total_pages }, (_, i) => i + 1)
  );

  async function deleteFeed(feed: Feed): Promise<void> {
    if (confirm(`Delete feed "${feed.name}"?`)) {
      await store.deleteFeed(feed.id);
    }
  }

  async function deleteSelected(): Promise<void> {
    if (selectedCount === 0) return;
    if (confirm(`Delete ${selectedCount} selected feed(s)?`)) {
      await store.deleteSelectedFeeds();
    }
  }
</script>

<div>
  <!-- Bulk actions -->
  {#if selectedCount > 0}
    <div class="level mb-4">
      <div class="level-left">
        <div class="level-item">
          <span class="tag is-info is-medium">{selectedCount} {t('feed.spa_selected_label')}</span>
        </div>
        <div class="level-item">
          <div class="buttons">
            <button class="button is-small is-success" onclick={() => store.loadSelectedFeeds()}>
              <i data-lucide="refresh-cw" class="icon icon-sm" style="width:16px;height:16px"></i>
              <span>{t('feed.spa_load_selected')}</span>
            </button>
            <button class="button is-small is-danger" onclick={deleteSelected}>
              <i data-lucide="trash-2" class="icon icon-sm" style="width:16px;height:16px"></i>
              <span>{t('feed.spa_delete_selected')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Table -->
  <div class="table-container">
    <table class="table is-fullwidth is-hoverable">
      <thead>
        <tr>
          <th style="width: 40px;">
            <input
              type="checkbox"
              checked={allSelected}
              onchange={() => store.toggleAllFeeds()}
              aria-label="Select all feeds"
            />
          </th>
          <th>{t('feed.spa_col_name')}</th>
          <th>{t('feed.spa_col_language')}</th>
          <th class="has-text-centered">{t('feed.spa_col_articles')}</th>
          <th>{t('feed.spa_col_last_update')}</th>
          <th style="width: 200px;">{t('feed.spa_col_actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each store.feeds as feed (feed.id)}
          <tr>
            <td>
              <input
                type="checkbox"
                checked={store.isFeedSelected(feed.id)}
                onchange={() => store.toggleFeedSelection(feed.id)}
                aria-label={'Select ' + feed.name}
              />
            </td>
            <td>
              <!-- svelte-ignore a11y_invalid_attribute -->
              <a
                href="#"
                class="has-text-weight-semibold"
                onclick={(e) => {
                  e.preventDefault();
                  store.showArticles(feed);
                }}>{feed.name}</a
              >
            </td>
            <td>{feed.langName}</td>
            <td class="has-text-centered">
              <span class="tag">{feed.articleCount}</span>
            </td>
            <td>
              <span class="is-size-7">{feed.lastUpdate}</span>
            </td>
            <td>
              <div class="buttons are-small">
                <button
                  class="button is-info"
                  onclick={() => store.loadFeedContent(feed)}
                  title={t('feed.spa_action_load_title')}
                >
                  <i data-lucide="refresh-cw" class="icon icon-sm" style="width:16px;height:16px"></i>
                </button>
                <button
                  class="button"
                  onclick={() => store.showArticles(feed)}
                  title={t('feed.spa_action_view_title')}
                >
                  <i data-lucide="list" class="icon icon-sm" style="width:16px;height:16px"></i>
                </button>
                <button
                  class="button"
                  onclick={() => store.showEditForm(feed)}
                  title={t('feed.spa_action_edit_title')}
                >
                  <i data-lucide="pencil" class="icon icon-sm" style="width:16px;height:16px"></i>
                </button>
                <button
                  class="button is-danger"
                  onclick={() => deleteFeed(feed)}
                  title={t('feed.spa_action_delete_title')}
                >
                  <i data-lucide="trash-2" class="icon icon-sm" style="width:16px;height:16px"></i>
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Empty state -->
  {#if store.feeds.length === 0}
    <div class="has-text-centered py-6">
      <p class="is-size-5 has-text-grey">{t('feed.spa_no_feeds')}</p>
      <p class="is-size-7 has-text-grey">{t('feed.spa_no_feeds_hint')}</p>
    </div>
  {/if}

  <!-- Pagination -->
  {#if store.feedsPagination.total_pages > 1}
    <nav class="pagination is-centered mt-4" aria-label="pagination">
      <button
        class="pagination-previous"
        disabled={store.feedsPagination.page <= 1}
        onclick={() => store.goToFeedsPage(store.feedsPagination.page - 1)}
      >{t('feed.spa_pagination_previous')}</button>
      <button
        class="pagination-next"
        disabled={store.feedsPagination.page >= store.feedsPagination.total_pages}
        onclick={() => store.goToFeedsPage(store.feedsPagination.page + 1)}
      >{t('feed.spa_pagination_next')}</button>
      <ul class="pagination-list">
        {#each pageNumbers as p (p)}
          <li>
            <button
              class="pagination-link"
              class:is-current={p === store.feedsPagination.page}
              onclick={() => store.goToFeedsPage(p)}>{p}</button
            >
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>
