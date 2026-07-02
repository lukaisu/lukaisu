<!--
  Discover books — Svelte 5 port of the Alpine `discoverBooks` disclosure
  (`js/home/discover_books.ts`).

  The Gutenberg/GDL suggestion rows reach external catalogs (CORS-free in the
  app). They mount behind this explicit toggle rather than auto-loading on every
  home open, so a passive home visit makes **no** outbound request — the
  offline-first dashboard stays inert until the user asks to discover books. The
  child suggestion components only mount (and fetch in `onMount`) once `open`
  becomes true, via `{#if open}` (matches the Alpine `x-if`).

  The two rows live in a flex column and reorder via the flex `order` each child
  exposes (GDL before Gutenberg for beginners, after for advanced).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import GutenbergSuggestions from './GutenbergSuggestions.svelte';
  import GdlSuggestions from './GdlSuggestions.svelte';

  let { languageId = 0, basePath = '' }: { languageId?: number; basePath?: string } = $props();

  let open = $state(false);

  function toggle(): void {
    open = !open;
  }

  // Icons inside the just-revealed rows (and the swapped chevron) need a
  // (re)scan whenever the disclosure opens/closes.
  $effect(() => {
    void open;
    void tick().then(() => initIcons());
  });
</script>

<div class="mt-5">
  <button class="button is-light" onclick={toggle}>
    <span class="icon"><i data-lucide="compass" aria-label="Discover"></i></span>
    <span>Discover books</span>
    <span class="icon">
      {#if open}
        <i data-lucide="chevron-up" aria-label="Collapse"></i>
      {:else}
        <i data-lucide="chevron-down" aria-label="Expand"></i>
      {/if}
    </span>
  </button>

  {#if open}
    <!-- Flex column with a gap so the two rows keep their spacing whichever
         order GDL takes (it reorders before/after Gutenberg for beginners). -->
    <div class="mt-4" style="display: flex; flex-direction: column; gap: 1.5rem;">
      <GutenbergSuggestions {languageId} {basePath} />
      <GdlSuggestions {languageId} {basePath} />
    </div>
  {/if}
</div>
