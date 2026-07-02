<!--
  Navbar Streak — Svelte 5 port of the Alpine `navbarStreak` component
  (`navbar_streak.ts`). Shows the current streak as a flame icon in the navbar.

  Lightweight: it fetches only the streak endpoint. Local-first mode computes the
  streak from the on-device DB (no server); otherwise it falls back to the
  original network fetch. The count is shown only when the streak is > 0.

  This backs the global navbar (mounted by main.ts) on every page of both the
  bundled app and the PHP server PWA. The Alpine `navbar_streak.ts` stays on disk
  (unused) until the Alpine-retirement division.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import { routeLocal } from '@shared/offline/local/router';

  let { basePath = '' }: { basePath?: string } = $props();

  let streak = $state(0);

  onMount(async () => {
    // Local-first mode computes the streak from the on-device DB (no server);
    // otherwise fall back to the original network fetch.
    const local = await routeLocal('GET', '/activity/streak', undefined);
    if (local.handled) {
      if (!local.error && local.data && typeof local.data === 'object') {
        streak = (local.data as { current_streak?: number }).current_streak ?? 0;
      }
      return;
    }
    try {
      const response = await fetch('/api/v1/activity/streak');
      const data = (await response.json()) as { current_streak?: number };
      streak = data.current_streak ?? 0;
    } catch {
      // Silently ignore — streak is non-critical.
    }
  });
</script>

<a class="navbar-item" href="{basePath}/profile/statistics" title={t('navbar.statistics_title')}>
  <span class="icon has-text-warning"><i data-lucide="flame"></i></span>
  {#if streak > 0}
    <span class="is-size-7 has-text-weight-semibold">{streak}</span>
  {/if}
</a>
