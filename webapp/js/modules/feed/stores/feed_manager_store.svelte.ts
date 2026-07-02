/**
 * Feed Manager Store (Svelte 5 runes) — port of the Alpine `createFeedManagerStore()`.
 *
 * The Alpine version (`feed_manager_store.ts`) is an `Alpine.store('feedManager', …)`,
 * which is Alpine-reactive and cannot be consumed by a Svelte component. This
 * module re-expresses the *same* feed-manager state and methods with Svelte 5
 * runes (`$state` in a `.svelte.ts` module) so `FeedsPage.svelte` and its child
 * islands (feed list/filter, article list/filter, the create/edit form and the
 * notifications) can coordinate through one shared instance — exactly the role
 * the single Alpine store played for the six `x-data` components. It reuses the
 * same framework-agnostic `feeds_api` client, so behaviour — loading feeds and
 * articles, CRUD, bulk import/delete, view transitions, filters, pagination and
 * the auto-dismissing notifications — is unchanged; only the reactivity is Svelte.
 *
 * The Alpine store stays in place as the PWA renderer (it still backs the PHP
 * server build and has tests); the two coexist until the PWA retires.
 *
 * Differences from the Alpine store, both intentional:
 *  - The Alpine version dispatched `lukaisu:contentLoaded` (via rAF) after a
 *    load / view change to re-hydrate lucide icons. Here that is the components'
 *    job — `FeedsPage` re-runs `initIcons()` from a `$effect` keyed on the view /
 *    lists / notifications — so the store no longer touches the DOM.
 *  - Notification auto-dismiss timers are tracked in a Map and cleared on manual
 *    dismiss and on `destroy()` (component unmount), so nothing leaks.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { SvelteMap } from 'svelte/reactivity';
import type {
  Feed,
  Article,
  Language,
  Pagination,
  FeedListParams,
  ArticleParams,
  FeedData,
  LoadFeedResponse
} from '@modules/feed/api/feeds_api';
import * as feedsApi from '@modules/feed/api/feeds_api';

// ============================================================================
// Types
// ============================================================================

/** View modes for the feed manager. */
export type ViewMode = 'list' | 'articles' | 'edit' | 'create';

/** Notification message. */
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Generate a unique id for a notification (matches the Alpine helper). */
function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Auto-dismiss durations (ms): errors linger longer than the rest. */
const ERROR_TIMEOUT = 8000;
const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Feed-manager state + behaviour, ported from the Alpine store to Svelte 5
 * runes. Fields use `$state` so reads from `FeedsPage.svelte` and its child
 * islands are reactive; nested mutations (e.g. `feedsPagination.page = n`) stay
 * reactive through Svelte's deep `$state` proxies.
 */
export class FeedManagerStore {
  // === View State ===
  viewMode = $state<ViewMode>('list');
  isLoading = $state(false);
  isLoadingArticles = $state(false);
  isSubmitting = $state(false);

  // === Feed List ===
  feeds = $state<Feed[]>([]);
  selectedFeedIds = $state<number[]>([]);
  feedsPagination = $state<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });

  // === Articles ===
  currentFeed = $state<Feed | null>(null);
  articles = $state<Article[]>([]);
  selectedArticleIds = $state<number[]>([]);
  articlesPagination = $state<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });

  // === Filters ===
  filterLang = $state<number | ''>('');
  filterQuery = $state('');
  sort = $state(2); // Default: update desc
  articlesQuery = $state('');
  articlesSort = $state(1); // Default: date desc

  // === Languages ===
  languages = $state<Language[]>([]);

  // === Form ===
  editingFeed = $state<Partial<FeedData> | null>(null);

  // === Notifications ===
  notifications = $state<Notification[]>([]);

  // Pending auto-dismiss timers, keyed by notification id, so they can be
  // cleared on manual dismiss / unmount (no leaks). Not reactive — internal.
  private timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();

  // =========================================================================
  // Initialization
  // =========================================================================

  async init(): Promise<void> {
    await this.loadFeeds();
  }

  /** Cancel any pending auto-dismiss timers (call from the host's unmount). */
  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // =========================================================================
  // Data Loading
  // =========================================================================

  async loadFeeds(params: FeedListParams = {}): Promise<void> {
    this.isLoading = true;

    const response = await feedsApi.getFeeds({
      lang: this.filterLang,
      query: this.filterQuery,
      page: params.page || this.feedsPagination.page,
      per_page: params.per_page || this.feedsPagination.per_page,
      sort: this.sort,
      ...params
    });

    if (response.data) {
      this.feeds = response.data.feeds;
      this.feedsPagination = response.data.pagination;
      this.languages = response.data.languages;
    } else if (response.error) {
      this.notify('error', `Failed to load feeds: ${response.error}`);
    }

    this.isLoading = false;
  }

  async loadArticles(feedId: number, params: Partial<ArticleParams> = {}): Promise<void> {
    this.isLoadingArticles = true;

    const response = await feedsApi.getArticles({
      feed_id: feedId,
      query: this.articlesQuery,
      page: params.page || this.articlesPagination.page,
      per_page: params.per_page || this.articlesPagination.per_page,
      sort: this.articlesSort,
      ...params
    });

    if (response.data) {
      this.articles = response.data.articles;
      this.articlesPagination = response.data.pagination;
    } else if (response.error) {
      this.notify('error', `Failed to load articles: ${response.error}`);
    }

    this.isLoadingArticles = false;
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  async createFeed(data: FeedData): Promise<boolean> {
    this.isSubmitting = true;

    const response = await feedsApi.createFeed(data);

    if (response.data?.success) {
      this.notify('success', 'Feed created successfully');
      await this.loadFeeds({ page: 1 });
      this.showList();
      this.isSubmitting = false;
      return true;
    } else {
      this.notify('error', response.data?.error || response.error || 'Failed to create feed');
      this.isSubmitting = false;
      return false;
    }
  }

  async updateFeed(feedId: number, data: Partial<FeedData>): Promise<boolean> {
    this.isSubmitting = true;

    const response = await feedsApi.updateFeed(feedId, data);

    if (response.data?.success) {
      this.notify('success', 'Feed updated successfully');
      await this.loadFeeds();
      this.showList();
      this.isSubmitting = false;
      return true;
    } else {
      this.notify('error', response.data?.error || response.error || 'Failed to update feed');
      this.isSubmitting = false;
      return false;
    }
  }

  async deleteFeed(feedId: number): Promise<boolean> {
    const response = await feedsApi.deleteFeed(feedId);

    if (response.data?.success) {
      this.notify('success', 'Feed deleted');
      await this.loadFeeds();
      return true;
    } else {
      this.notify('error', response.error || 'Failed to delete feed');
      return false;
    }
  }

  async deleteSelectedFeeds(): Promise<boolean> {
    if (this.selectedFeedIds.length === 0) {
      this.notify('warning', 'No feeds selected');
      return false;
    }

    // Delete one by one since bulk delete needs body
    let deleted = 0;
    for (const feedId of this.selectedFeedIds) {
      const response = await feedsApi.deleteFeed(feedId);
      if (response.data?.success) {
        deleted++;
      }
    }

    this.clearFeedSelection();
    await this.loadFeeds();
    this.notify('success', `Deleted ${deleted} feed(s)`);
    return true;
  }

  async loadFeedContent(feed: Feed): Promise<LoadFeedResponse | null> {
    const response = await feedsApi.loadFeed(
      feed.id,
      feed.name,
      feed.sourceUri,
      feed.optionsString
    );

    if (response.data) {
      if (response.data.success) {
        this.notify('success', response.data.message || 'Feed loaded');
        // Refresh feed list to update article counts
        await this.loadFeeds();
      } else if (response.data.error) {
        this.notify('error', response.data.error);
      }
      return response.data;
    } else {
      this.notify('error', response.error || 'Failed to load feed');
      return null;
    }
  }

  async loadSelectedFeeds(): Promise<void> {
    if (this.selectedFeedIds.length === 0) {
      this.notify('warning', 'No feeds selected');
      return;
    }

    this.isLoading = true;
    const selectedFeeds = this.feeds.filter((f) => this.selectedFeedIds.includes(f.id));

    for (const feed of selectedFeeds) {
      await this.loadFeedContent(feed);
    }

    this.clearFeedSelection();
    this.isLoading = false;
  }

  // =========================================================================
  // Article Operations
  // =========================================================================

  async importSelectedArticles(): Promise<boolean> {
    if (this.selectedArticleIds.length === 0) {
      this.notify('warning', 'No articles selected');
      return false;
    }

    this.isSubmitting = true;

    const response = await feedsApi.importArticles(this.selectedArticleIds);

    if (response.data?.success) {
      const msg =
        response.data.imported > 0
          ? `Imported ${response.data.imported} article(s)`
          : 'No articles imported';

      if (response.data.errors.length > 0) {
        this.notify('warning', `${msg}. Errors: ${response.data.errors.join(', ')}`);
      } else {
        this.notify('success', msg);
      }

      this.clearArticleSelection();
      if (this.currentFeed) {
        await this.loadArticles(this.currentFeed.id);
      }
      this.isSubmitting = false;
      return true;
    } else {
      this.notify('error', response.error || 'Failed to import articles');
      this.isSubmitting = false;
      return false;
    }
  }

  async deleteSelectedArticles(): Promise<boolean> {
    if (!this.currentFeed || this.selectedArticleIds.length === 0) {
      this.notify('warning', 'No articles selected');
      return false;
    }

    const response = await feedsApi.deleteArticles(this.currentFeed.id, this.selectedArticleIds);

    if (response.data?.success) {
      this.notify('success', `Deleted ${response.data.deleted} article(s)`);
      this.clearArticleSelection();
      await this.loadArticles(this.currentFeed.id);
      return true;
    } else {
      this.notify('error', response.error || 'Failed to delete articles');
      return false;
    }
  }

  async deleteAllArticles(): Promise<boolean> {
    if (!this.currentFeed) {
      return false;
    }

    const response = await feedsApi.deleteArticles(this.currentFeed.id);

    if (response.data?.success) {
      this.notify('success', `Deleted all articles from ${this.currentFeed.name}`);
      await this.loadArticles(this.currentFeed.id);
      return true;
    } else {
      this.notify('error', response.error || 'Failed to delete articles');
      return false;
    }
  }

  async resetErrorArticles(): Promise<boolean> {
    if (!this.currentFeed) {
      return false;
    }

    const response = await feedsApi.resetErrorArticles(this.currentFeed.id);

    if (response.data?.success) {
      this.notify('success', `Reset ${response.data.reset} error article(s)`);
      await this.loadArticles(this.currentFeed.id);
      return true;
    } else {
      this.notify('error', response.error || 'Failed to reset error articles');
      return false;
    }
  }

  // =========================================================================
  // View Navigation
  // =========================================================================

  showList(): void {
    this.viewMode = 'list';
    this.currentFeed = null;
    this.articles = [];
    this.selectedArticleIds = [];
    this.editingFeed = null;
  }

  showArticles(feed: Feed): void {
    this.viewMode = 'articles';
    this.currentFeed = feed;
    this.selectedArticleIds = [];
    this.articlesQuery = '';
    this.articlesSort = 1;
    this.articlesPagination = { page: 1, per_page: 50, total: 0, total_pages: 0 };
    void this.loadArticles(feed.id);
  }

  showEditForm(feed: Feed): void {
    this.viewMode = 'edit';
    this.editingFeed = {
      langId: feed.langId,
      name: feed.name,
      sourceUri: feed.sourceUri,
      articleSectionTags: feed.articleSectionTags,
      filterTags: feed.filterTags,
      options: feed.optionsString
    };
    this.currentFeed = feed;
  }

  showCreateForm(): void {
    this.viewMode = 'create';
    this.editingFeed = {
      langId: this.languages[0]?.id || 0,
      name: '',
      sourceUri: '',
      articleSectionTags: '',
      filterTags: '',
      options: ''
    };
    this.currentFeed = null;
  }

  // =========================================================================
  // Selection
  // =========================================================================

  toggleFeedSelection(feedId: number): void {
    const index = this.selectedFeedIds.indexOf(feedId);
    if (index === -1) {
      this.selectedFeedIds = [...this.selectedFeedIds, feedId];
    } else {
      this.selectedFeedIds = this.selectedFeedIds.filter((id) => id !== feedId);
    }
  }

  toggleAllFeeds(): void {
    if (this.selectedFeedIds.length === this.feeds.length) {
      this.selectedFeedIds = [];
    } else {
      this.selectedFeedIds = this.feeds.map((f) => f.id);
    }
  }

  clearFeedSelection(): void {
    this.selectedFeedIds = [];
  }

  isFeedSelected(feedId: number): boolean {
    return this.selectedFeedIds.includes(feedId);
  }

  toggleArticleSelection(articleId: number): void {
    const index = this.selectedArticleIds.indexOf(articleId);
    if (index === -1) {
      this.selectedArticleIds = [...this.selectedArticleIds, articleId];
    } else {
      this.selectedArticleIds = this.selectedArticleIds.filter((id) => id !== articleId);
    }
  }

  toggleAllArticles(): void {
    if (this.selectedArticleIds.length === this.articles.length) {
      this.selectedArticleIds = [];
    } else {
      this.selectedArticleIds = this.articles.map((a) => a.id);
    }
  }

  clearArticleSelection(): void {
    this.selectedArticleIds = [];
  }

  isArticleSelected(articleId: number): boolean {
    return this.selectedArticleIds.includes(articleId);
  }

  // =========================================================================
  // Pagination
  // =========================================================================

  async goToFeedsPage(page: number): Promise<void> {
    this.feedsPagination.page = page;
    await this.loadFeeds({ page });
  }

  async goToArticlesPage(page: number): Promise<void> {
    if (!this.currentFeed) return;
    this.articlesPagination.page = page;
    await this.loadArticles(this.currentFeed.id, { page });
  }

  // =========================================================================
  // Filters
  // =========================================================================

  async setFilterLang(langId: number | ''): Promise<void> {
    this.filterLang = langId;
    this.feedsPagination.page = 1;
    await this.loadFeeds();
  }

  async setFilterQuery(query: string): Promise<void> {
    this.filterQuery = query;
    this.feedsPagination.page = 1;
    await this.loadFeeds();
  }

  async setSort(sort: number): Promise<void> {
    this.sort = sort;
    this.feedsPagination.page = 1;
    await this.loadFeeds();
  }

  async setArticlesQuery(query: string): Promise<void> {
    if (!this.currentFeed) return;
    this.articlesQuery = query;
    this.articlesPagination.page = 1;
    await this.loadArticles(this.currentFeed.id);
  }

  async setArticlesSort(sort: number): Promise<void> {
    if (!this.currentFeed) return;
    this.articlesSort = sort;
    this.articlesPagination.page = 1;
    await this.loadArticles(this.currentFeed.id);
  }

  // =========================================================================
  // Notifications
  // =========================================================================

  notify(type: Notification['type'], message: string): void {
    const id = generateNotificationId();
    const notification: Notification = { id, type, message };

    this.notifications = [...this.notifications, notification];

    // Auto-dismiss after timeout (errors linger longer). Track the timer so a
    // manual dismiss / unmount can cancel it.
    const timeout = type === 'error' ? ERROR_TIMEOUT : DEFAULT_TIMEOUT;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.dismissNotification(id);
    }, timeout);
    this.timers.set(id, timer);
  }

  dismissNotification(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }
}
