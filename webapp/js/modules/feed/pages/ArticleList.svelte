<!--
  Article List — Svelte 5 port of the Alpine `articleList` component.

  The articles view for one feed: a back-to-feeds header, the embedded
  `ArticleFilter`, bulk import / delete / delete-all / reset-errors actions, the
  article table (with per-row open / read links), an empty state and pagination.
  All state and behaviour come from the shared `FeedManagerStore`; destructive
  actions confirm first (matching the Alpine `confirm()` guards).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { t } from '@shared/i18n/translator';
  import {
    getStatusBadgeClass,
    getStatusLabel,
    type Article
  } from '@modules/feed/api/feeds_api';
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';
  import ArticleFilter from './ArticleFilter.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  const selectedCount = $derived(store.selectedArticleIds.length);
  const allSelected = $derived(
    store.articles.length > 0 && store.selectedArticleIds.length === store.articles.length
  );
  const pageNumbers = $derived(
    Array.from({ length: store.articlesPagination.total_pages }, (_, i) => i + 1)
  );

  function truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  async function deleteSelected(): Promise<void> {
    if (selectedCount === 0) return;
    if (confirm(`Delete ${selectedCount} selected article(s)?`)) {
      await store.deleteSelectedArticles();
    }
  }

  async function deleteAll(): Promise<void> {
    if (confirm(`Delete ALL articles from "${store.currentFeed?.name}"?`)) {
      await store.deleteAllArticles();
    }
  }

  function getStatusClass(status: Article['status']): string {
    return getStatusBadgeClass(status);
  }

  function getStatusText(status: Article['status']): string {
    return getStatusLabel(status);
  }
</script>

<div>
  <!-- Header -->
  <div class="level mb-4">
    <div class="level-left">
      <div class="level-item">
        <button class="button" onclick={() => store.showList()}>
          <i data-lucide="arrow-left" class="icon icon-sm" style="width:16px;height:16px"></i>
          <span>{t('feed.spa_back_to_feeds')}</span>
        </button>
      </div>
      <div class="level-item">
        <h2 class="title is-4">
          {store.currentFeed ? store.currentFeed.name : t('feed.spa_articles_title_default')}
        </h2>
      </div>
    </div>
  </div>

  <!-- Filter bar -->
  <ArticleFilter {store} />

  <!-- Bulk actions -->
  <div class="level mb-4">
    <div class="level-left">
      {#if selectedCount > 0}
        <div class="level-item">
          <span class="tag is-info is-medium">{selectedCount} {t('feed.spa_selected_label')}</span>
        </div>
      {/if}
      <div class="level-item">
        <div class="buttons">
          <button
            class="button is-small is-success"
            onclick={() => store.importSelectedArticles()}
            disabled={selectedCount === 0 || store.isSubmitting}
          >
            <i data-lucide="download" class="icon icon-sm" style="width:16px;height:16px"></i>
            <span>{t('feed.spa_import_selected')}</span>
          </button>
          <button
            class="button is-small is-danger"
            onclick={deleteSelected}
            disabled={selectedCount === 0}
          >
            <i data-lucide="trash-2" class="icon icon-sm" style="width:16px;height:16px"></i>
            <span>{t('feed.spa_delete_selected')}</span>
          </button>
          <button class="button is-small is-warning" onclick={deleteAll}>
            <i data-lucide="trash" class="icon icon-sm" style="width:16px;height:16px"></i>
            <span>{t('feed.spa_delete_all')}</span>
          </button>
          <button
            class="button is-small"
            onclick={() => store.resetErrorArticles()}
            title={t('feed.spa_reset_errors_title')}
          >
            <i data-lucide="refresh-ccw" class="icon icon-sm" style="width:16px;height:16px"></i>
            <span>{t('feed.spa_reset_errors')}</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Loading -->
  {#if store.isLoadingArticles}
    <div class="has-text-centered py-6">
      <span class="icon is-large">
        <i data-lucide="loader-2" class="icon animate-spin" aria-label="Loading" style="width:16px;height:16px"></i>
      </span>
      <p class="mt-2">{t('feed.spa_loading_articles')}</p>
    </div>
  {:else}
    <!-- Table -->
    <div class="table-container">
      <table class="table is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input
                type="checkbox"
                checked={allSelected}
                onchange={() => store.toggleAllArticles()}
                aria-label="Select all articles"
              />
            </th>
            <th>{t('feed.spa_col_title')}</th>
            <th>{t('feed.spa_col_date')}</th>
            <th class="has-text-centered">{t('feed.spa_col_status')}</th>
            <th style="width: 100px;">{t('feed.spa_col_article_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each store.articles as article (article.id)}
            <tr>
              <td>
                <input
                  type="checkbox"
                  checked={store.isArticleSelected(article.id)}
                  onchange={() => store.toggleArticleSelection(article.id)}
                  aria-label={'Select ' + article.title}
                />
              </td>
              <td>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="has-text-weight-semibold">{article.title}</a
                >
                <p class="is-size-7 has-text-grey">{truncateText(article.description, 100)}</p>
              </td>
              <td>
                <span class="is-size-7">{article.date}</span>
              </td>
              <td class="has-text-centered">
                <span class="tag {getStatusClass(article.status)}">{getStatusText(article.status)}</span>
              </td>
              <td>
                <div class="buttons are-small">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="button"
                    title={t('feed.spa_open_article_title')}
                  >
                    <i data-lucide="external-link" class="icon icon-sm" style="width:16px;height:16px"></i>
                  </a>
                  {#if article.textId}
                    <a
                      href={'/text/read/' + article.textId}
                      class="button is-success"
                      title={t('feed.spa_read_imported_title')}
                    >
                      <i data-lucide="book-open" class="icon icon-sm" style="width:16px;height:16px"></i>
                    </a>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Empty state -->
    {#if store.articles.length === 0}
      <div class="has-text-centered py-6">
        <p class="is-size-5 has-text-grey">{t('feed.spa_no_articles')}</p>
        <p class="is-size-7 has-text-grey">{t('feed.spa_no_articles_hint')}</p>
      </div>
    {/if}
  {/if}

  <!-- Pagination -->
  {#if store.articlesPagination.total_pages > 1}
    <nav class="pagination is-centered mt-4" aria-label="pagination">
      <button
        class="pagination-previous"
        disabled={store.articlesPagination.page <= 1}
        onclick={() => store.goToArticlesPage(store.articlesPagination.page - 1)}>Previous</button
      >
      <button
        class="pagination-next"
        disabled={store.articlesPagination.page >= store.articlesPagination.total_pages}
        onclick={() => store.goToArticlesPage(store.articlesPagination.page + 1)}>Next</button
      >
      <ul class="pagination-list">
        {#each pageNumbers as p (p)}
          <li>
            <button
              class="pagination-link"
              class:is-current={p === store.articlesPagination.page}
              onclick={() => store.goToArticlesPage(p)}>{p}</button
            >
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>
