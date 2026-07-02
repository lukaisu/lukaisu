<!--
  Feeds Page — Svelte 5 port of the Alpine feed-manager SPA (the six coupled
  `x-data` regions of `feeds.html` / `spa.php`: `feedNotifications`, `feedList`,
  `feedFilter`, `articleList`, `articleFilter` and `feedForm`).

  These were ported together because they are inseparable: in the Alpine version
  all six coordinated through one `Alpine.store('feedManager')` (no events). Here
  this component owns one runes `FeedManagerStore` (a port of that store) and
  threads it into the child islands. It switches on `store.viewMode`
  (list / articles / create / edit) and renders the fixed-position notifications.
  It reuses the framework-agnostic `feeds_api` unchanged, so behaviour — loading,
  CRUD, bulk actions, filters, pagination, view transitions and the auto-
  dismissing toasts — is identical; only the rendering is Svelte.

  This backs the bundled app's `feeds.html`, and only when a server is connected
  (the page is server-gated in `feeds.ts`: offline shows a "connect a server"
  notice and never mounts this island). It is now the sole feed-manager renderer:
  the Alpine `feed_manager_app.ts` / `feed_manager_store.ts` SPA + its `spa.php`
  view were retired, and the server's `/feeds` + `/feeds/manage` routes 302 here.

  Lucide icons in the client-rendered markup are re-hydrated from a `$effect`
  keyed on the view / lists / notifications (the role the Alpine store's
  `lukaisu:contentLoaded` dispatch played).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';
  import Notifications from './Notifications.svelte';
  import FeedFilter from './FeedFilter.svelte';
  import FeedList from './FeedList.svelte';
  import ArticleList from './ArticleList.svelte';
  import FeedForm from './FeedForm.svelte';

  // The single shared store all child islands coordinate through (the Alpine
  // `Alpine.store('feedManager')` role).
  const store = new FeedManagerStore();

  // Re-hydrate lucide icons after the view / lists / notifications change add or
  // remove `<i data-lucide>` nodes (matching the Alpine `lukaisu:contentLoaded`
  // re-init points).
  $effect(() => {
    void store.viewMode;
    void store.isLoading;
    void store.isLoadingArticles;
    void store.feeds;
    void store.articles;
    void store.notifications;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    void store.init();
    // Cancel any pending notification auto-dismiss timers on unmount (no leaks).
    return () => store.destroy();
  });
</script>

<!-- Fixed-position notifications (always mounted, all views). -->
<Notifications {store} />

{#if store.viewMode === 'list'}
  <!-- Loading state -->
  {#if store.isLoading}
    <div class="has-text-centered py-6">
      <span class="icon is-large">
        <i data-lucide="loader-2" class="icon animate-spin" aria-label="Loading" style="width:16px;height:16px"></i>
      </span>
      <p class="mt-2">{t('feed.spa_loading_feeds')}</p>
    </div>
  {/if}

  <!-- Action buttons -->
  <div class="card action-card mb-4">
    <div class="card-content">
      <div class="buttons is-centered">
        <!-- svelte-ignore a11y_invalid_attribute -->
        <a
          href="#"
          class="button is-light is-primary"
          onclick={(e) => {
            e.preventDefault();
            store.showCreateForm();
          }}
        >
          <span class="icon"
            ><i data-lucide="circle-plus" class="icon" aria-label="New Feed" style="width:16px;height:16px"></i></span
          >
          <span>{t('feed.spa_action_new_feed')}</span>
        </a>
        <a href="/feeds/new" class="button is-light">
          <span class="icon"
            ><i data-lucide="wand-2" class="icon" aria-label="Feed Wizard" style="width:16px;height:16px"></i></span
          >
          <span>{t('feed.spa_action_wizard')}</span>
        </a>
      </div>
    </div>
  </div>

  <!-- Filter bar -->
  <FeedFilter {store} />

  <!-- Feed list (hidden during a load, matching the Alpine `x-show`). -->
  {#if !store.isLoading}
    <FeedList {store} />
  {/if}
{:else if store.viewMode === 'articles'}
  <ArticleList {store} />
{:else if store.viewMode === 'create' || store.viewMode === 'edit'}
  <FeedForm {store} />
{/if}
