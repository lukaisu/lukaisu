<!--
  Gutenberg Suggestions — Svelte 5 port of the Alpine `gutenbergSuggestions`
  component (`js/home/gutenberg_suggestions.ts`).

  Paginated popular-book suggestions from Project Gutenberg for the current
  language (`GET /texts/gutenberg-suggestions`), each with a difficulty tier, an
  on-device coverage preview (`GET /texts/library-preview`) and a local-first
  plain-text import (`POST /texts/import-gutenberg`, else a server-mode redirect
  to `/texts/new?import_url=...`). The data layer is unchanged from the Alpine
  version (`apiGet`/`apiPost` → local-first or remote `/api/v1`); only the
  rendering is Svelte. It owns its own `lukaisu:languageChanged` listener (like
  the Alpine component) so a language switch clears + re-fetches the row.

  Mounts only once the home page's "Discover books" disclosure opens, so a
  passive home visit makes no outbound suggestion request.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { apiGet, apiPost } from '@shared/api/client';
  import { isLocalFirst } from '@shared/offline/local/router';
  import {
    tierClass,
    coverageClass,
    coverageLabel,
    type PreviewData,
    type CatalogResponse
  } from '@modules/home/lib/suggestions';

  interface SuggestedBook {
    id: number;
    title: string;
    authors: string[];
    languages: string[];
    subjects: string[];
    downloadCount: number;
    textUrl: string;
    difficultyTier?: 'easy' | 'medium' | 'hard';
  }

  let { languageId = 0, basePath = '' }: { languageId?: number; basePath?: string } = $props();

  let books = $state<SuggestedBook[]>([]);
  let hasMore = $state(false);
  let page = $state(1);
  let loading = $state(false);
  let error = $state('');
  let importing = $state<number | null>(null);
  let previewBookId = $state<number | null>(null);
  let previewLoading = $state(false);
  let previewData = $state<PreviewData | null>(null);
  let previewError = $state('');

  // Mutable copy of the active language id; the languageChanged listener guards
  // on it (mirrors the Alpine component's `this.languageId`). Seeded once from
  // the prop (untracked: the prop is a constant initial value, language switches
  // arrive via the event below, not via a prop change).
  let currentLangId = $state(untrack(() => languageId));

  async function fetchSuggestions(p: number): Promise<void> {
    if (loading || currentLangId <= 0) return;

    loading = true;
    error = '';

    try {
      const { data, error: err } = await apiGet<CatalogResponse<SuggestedBook>>(
        '/texts/gutenberg-suggestions',
        { language_id: currentLangId, page: p }
      );

      if (err || !data) {
        error = err || 'Could not load suggestions.';
        return;
      }

      const results = data.results || [];
      books = p === 1 ? results : books.concat(results);
      hasMore = data.next || false;
      page = p;
    } catch {
      error = 'Could not reach the server.';
    } finally {
      loading = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (loading || !hasMore) return;
    await fetchSuggestions(page + 1);
  }

  async function previewBook(book: SuggestedBook): Promise<void> {
    // Toggle off if already previewing this book.
    if (previewBookId === book.id) {
      previewBookId = null;
      previewData = null;
      previewError = '';
      return;
    }

    previewBookId = book.id;
    previewLoading = true;
    previewData = null;
    previewError = '';

    try {
      // Coverage preview stays server-enhanced (it needs to fetch + sample the
      // full text). Routed through apiGet so it targets the configured server
      // when connected and fails gracefully when none is.
      const { data, error: err } = await apiGet<PreviewData>('/texts/library-preview', {
        url: book.textUrl,
        language_id: currentLangId
      });

      if (previewBookId !== book.id) return;

      if (err || !data) {
        previewError = err || 'Could not analyze this text.';
        return;
      }

      previewData = data;
    } catch {
      if (previewBookId === book.id) {
        previewError = 'Could not reach the server.';
      }
    } finally {
      previewLoading = false;
    }
  }

  async function importBook(book: SuggestedBook): Promise<void> {
    if (importing !== null) return;
    importing = book.id;

    // Local-first: import the plain-text book on-device (fetch CORS-free, strip
    // Gutenberg boilerplate, parse) and open the reader — no server.
    if (isLocalFirst()) {
      const { data, error: err } = await apiPost<{ id?: number }>('/texts/import-gutenberg', {
        url: book.textUrl,
        title: book.title,
        language_id: currentLangId
      });
      if (data?.id) {
        window.location.href = `${basePath}/text/${data.id}/read`;
        return;
      }
      error = err || 'Could not import this book.';
      importing = null;
      return;
    }

    // Server mode: hand off to the server's URL-import flow.
    const params = new URLSearchParams({
      import_url: book.textUrl,
      import_title: book.title
    });
    window.location.href = `${basePath}/texts/new?${params}`;
  }

  function formatAuthors(authors: string[]): string {
    if (authors.length === 0) return 'Unknown author';
    return authors.join(', ');
  }

  function tierLabel(tier: string | undefined): string {
    return tier === 'easy' ? 'Easy' : tier === 'hard' ? 'Hard' : 'Medium';
  }

  // Re-run lucide whenever the rendered icon set changes (rows added, the import
  // spinner, or a preview toggle add/remove `<i data-lucide>` nodes).
  $effect(() => {
    void books;
    void loading;
    void importing;
    void previewBookId;
    void previewData;
    void tick().then(() => initIcons());
  });

  // Own `lukaisu:languageChanged` listener (mirrors the Alpine component): a
  // language switch clears the list and re-fetches for the new language.
  $effect(() => {
    function onLangChange(e: Event): void {
      const ev = e as CustomEvent;
      const langId = parseInt(ev.detail.languageId, 10);
      if (langId > 0 && langId !== currentLangId) {
        currentLangId = langId;
        books = [];
        page = 1;
        void fetchSuggestions(1);
      }
    }
    document.addEventListener('lukaisu:languageChanged', onLangChange as EventListener);
    return () => document.removeEventListener('lukaisu:languageChanged', onLangChange as EventListener);
  });

  onMount(() => {
    if (currentLangId > 0) {
      void fetchSuggestions(1);
    }
  });
</script>

<div style="order: 1;">
  <h2 class="title is-6 mb-2">Project Gutenberg</h2>
  {#if error}
    <p class="notification is-danger is-light py-2">{error}</p>
  {/if}
  {#if loading}
    <progress class="progress is-small is-primary" max="100">Loading</progress>
  {/if}
  <div style="display:flex; gap:0.75rem; overflow-x:auto; padding-bottom:0.5rem;">
    {#each books as book (book.id)}
      <div class="box p-3" style="width:220px; flex-shrink:0; display:flex; flex-direction:column;">
        <p class="is-size-7 has-text-weight-semibold mb-1">{book.title}</p>
        <p class="is-size-7 has-text-grey mb-2">{formatAuthors(book.authors)}</p>
        <span class="tag is-small mb-3 {tierClass(book.difficultyTier)}">{tierLabel(book.difficultyTier)}</span>
        <div class="buttons are-small mt-auto mb-0">
          <button
            class="button is-primary"
            class:is-loading={importing === book.id}
            disabled={importing !== null}
            onclick={() => importBook(book)}
          >
            <span class="icon"><i data-lucide="download" aria-label="Import"></i></span>
            <span>Import</span>
          </button>
          <button class="button is-light" onclick={() => previewBook(book)}>
            <span class="icon"><i data-lucide="gauge" aria-label="Preview"></i></span>
            <span>Preview</span>
          </button>
        </div>
        <!-- Coverage preview: samples the book and shows how much of its
             vocabulary you already know (computed on-device). -->
        {#if previewBookId === book.id}
          <div class="mt-2">
            {#if previewLoading}
              <progress class="progress is-small" max="100">…</progress>
            {/if}
            {#if previewError}
              <p class="help is-danger">{previewError}</p>
            {/if}
            {#if previewData}
              <div>
                <p class="is-size-7 mb-1">{coverageLabel(previewData)}</p>
                <progress
                  class="progress is-small {coverageClass(previewData.difficulty_label)}"
                  value={previewData.coverage_percent}
                  max="100"
                ></progress>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
    {#if hasMore}
      <div style="flex-shrink:0; display:flex; align-items:center;">
        <button class="button is-small" onclick={loadMore}>More</button>
      </div>
    {/if}
  </div>
</div>
