<!--
  Feed Notifications — Svelte 5 port of the Alpine `feedNotifications` component.

  Fixed-position toast stack driven by the shared `FeedManagerStore`: it renders
  the store's `notifications` and proxies manual dismissal back to it. Auto-
  dismiss timers live in the store (5s / 8s for errors), so this is purely the
  view. Behaviour matches the Alpine version; only the rendering is Svelte.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  /** Map a notification type to its Bulma colour class (matches the Alpine getter). */
  function getClass(type: string): string {
    switch (type) {
      case 'success':
        return 'is-success';
      case 'error':
        return 'is-danger';
      case 'warning':
        return 'is-warning';
      default:
        return 'is-info';
    }
  }
</script>

<div
  class="notification-container"
  style="position: fixed; top: 1rem; right: 1rem; z-index: 100; max-width: 400px;"
>
  {#each store.notifications as notification (notification.id)}
    <div class="notification {getClass(notification.type)}">
      <button
        class="delete"
        aria-label="Dismiss notification"
        onclick={() => store.dismissNotification(notification.id)}
      ></button>
      <span>{notification.message}</span>
    </div>
  {/each}
</div>
