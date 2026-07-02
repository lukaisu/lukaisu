<!--
  GDL Suggestions — Svelte 5 port of the Alpine `gdlSuggestions` component
  (`js/home/gdl_suggestions.ts`).

  Openly-licensed early-grade readers (incl. StoryWeaver) from the Global Digital
  Library for the current language (`GET /texts/gdl-search`), each an EPUB with a
  difficulty tier, a local-first-only coverage preview
  (`GET /texts/library-preview-epub`, gated by `canPreview`) and a local-first
  EPUB import (`POST /texts/import-epub`, else a server-mode redirect to
  `/texts/new?import_epub_url=...`).

  Beginner-aware: `fetchReaderLevel` (`GET /texts/reader-level`) drives a
  `beginner` flag that sets this row's flex `order` — before Gutenberg (order 0)
  for low-vocabulary readers, after it (order 2) for advanced ones; Gutenberg
  sits at the fixed middle (order 1). The whole row hides (`showRow`) when it has
  no books and isn't loading.

  The data layer is unchanged from the Alpine version; only the rendering is
  Svelte. It owns its own `lukaisu:languageChanged` listener so a language switch
  clears + re-fetches both the reader level and the suggestions. Mounts only once
  the home page's "Discover books" disclosure opens.

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

  interface GdlSuggestedBook {
    id: number;
    title: string;
    publisher: string;
    description: string;
    level: string;
    difficultyTier?: 'easy' | 'medium' | 'hard';
    thumbnail: string;
    sourceUri: string;
    epubUrl: string;
  }

  let { languageId = 0, basePath = '' }: { languageId?: number; basePath?: string } = $props();

  let books = $state<GdlSuggestedBook[]>([]);
  let hasMore = $state(false);
  let page = $state(1);
  let loading = $state(false);
  let error = $state('');
  let importing = $state<number | null>(null);
  let beginner = $state(false);
  let previewBookId = $state<number | null>(null);
  let previewLoading = $state(false);
  let previewData = $state<PreviewData | null>(null);
  let previewError = $state('');

  // Mutable copy of the active language id; the languageChanged listener guards
  // on it (mirrors the Alpine component's `this.languageId`). Seeded once from
  // the prop (untracked: the prop is a constant initial value, language switches
  // arrive via the event below, not via a prop change).
  let currentLangId = $state(untrack(() => languageId));

  // The coverage preview needs to download + unzip the EPUB on-device, which
  // only works in local-first mode; hide the action otherwise (the server's
  // library-preview can't parse EPUB binaries). The data mode is fixed for the
  // session (resolved by initDataMode before this island mounts).
  const canPreview = isLocalFirst();

  // The row exposes its own flex order (before Gutenberg for beginners, after for
  // advanced); Gutenberg sits at the fixed middle order.
  const order = $derived(beginner ? 0 : 2);
  const showRow = $derived(books.length > 0 || loading);

  async function fetchReaderLevel(): Promise<void> {
    if (currentLangId <= 0) return;
    try {
      const { data, error: err } = await apiGet<{ beginner?: boolean }>('/texts/reader-level', {
        language_id: currentLangId
      });
      if (!err && data) {
        beginner = !!data.beginner;
      }
    } catch {
      // Non-fatal: fall back to the default (non-beginner) ordering.
    }
  }

  async function fetchSuggestions(p: number): Promise<void> {
    if (loading || currentLangId <= 0) return;

    loading = true;
    error = '';

    try {
      const { data, error: err } = await apiGet<CatalogResponse<GdlSuggestedBook>>('/texts/gdl-search', {
        language_id: currentLangId,
        page: p
      });

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

  async function importBook(book: GdlSuggestedBook): Promise<void> {
    if (importing !== null) return;

    // Local-first: import the EPUB on-device (download CORS-free, unzip, extract
    // spine text, parse) and open the reader — no server.
    if (isLocalFirst()) {
      if (!book.epubUrl) {
        error = 'This reader has no downloadable EPUB.';
        return;
      }
      importing = book.id;
      error = '';
      const { data, error: err } = await apiPost<{ id?: number }>('/texts/import-epub', {
        url: book.epubUrl,
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

    importing = book.id;
    // Server mode: GDL books are EPUB; the new-text page imports via
    // extract-epub-url.
    const params = new URLSearchParams({
      import_epub_url: book.epubUrl,
      import_title: book.title
    });
    window.location.href = `${basePath}/texts/new?${params}`;
  }

  async function previewBook(book: GdlSuggestedBook): Promise<void> {
    // Toggle off if already previewing this book.
    if (previewBookId === book.id) {
      previewBookId = null;
      previewData = null;
      previewError = '';
      return;
    }

    previewBookId = book.id;
    previewData = null;
    previewError = '';
    previewLoading = false;

    if (!book.epubUrl) {
      previewError = 'This reader has no downloadable EPUB.';
      return;
    }

    previewLoading = true;
    try {
      // On-device coverage: download + parse the EPUB and measure how much of its
      // vocabulary the reader knows. EPUB parsing only exists on the client, so
      // this is local-first only (the button is gated by canPreview); the request
      // is routed to the on-device analyzer.
      const { data, error: err } = await apiGet<PreviewData>('/texts/library-preview-epub', {
        url: book.epubUrl,
        language_id: currentLangId
      });

      if (previewBookId !== book.id) return;

      if (err || !data) {
        previewError = err || 'Could not analyze this book.';
        return;
      }

      previewData = data;
    } catch {
      if (previewBookId === book.id) {
        previewError = 'Could not analyze this book.';
      }
    } finally {
      previewLoading = false;
    }
  }

  function formatMeta(book: GdlSuggestedBook): string {
    return book.publisher || '';
  }

  function hasLevel(book: GdlSuggestedBook): boolean {
    return !!book.level;
  }

  function bookLevel(book: GdlSuggestedBook): string {
    return book.level || '';
  }

  // Re-run lucide whenever the rendered icon set changes.
  $effect(() => {
    void books;
    void loading;
    void importing;
    void previewBookId;
    void previewData;
    void showRow;
    void tick().then(() => initIcons());
  });

  // Own `lukaisu:languageChanged` listener (mirrors the Alpine component): a
  // language switch clears the list + preview and re-fetches reader level and
  // suggestions for the new language.
  $effect(() => {
    function onLangChange(e: Event): void {
      const ev = e as CustomEvent;
      const langId = parseInt(ev.detail.languageId, 10);
      if (langId > 0 && langId !== currentLangId) {
        currentLangId = langId;
        books = [];
        page = 1;
        error = '';
        previewBookId = null;
        previewData = null;
        previewError = '';
        void fetchReaderLevel();
        void fetchSuggestions(1);
      }
    }
    document.addEventListener('lukaisu:languageChanged', onLangChange as EventListener);
    return () => document.removeEventListener('lukaisu:languageChanged', onLangChange as EventListener);
  });

  onMount(() => {
    if (currentLangId > 0) {
      void fetchReaderLevel();
      void fetchSuggestions(1);
    }
  });
</script>

<div style={`order: ${order};${showRow ? '' : ' display: none;'}`}>
  <h2 class="title is-6 mb-2">Easy readers (Global Digital Library)</h2>
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
        <p class="is-size-7 has-text-grey mb-2">{formatMeta(book)}</p>
        {#if hasLevel(book)}
          <span class="tag is-small mb-3 {tierClass(book.difficultyTier)}">{bookLevel(book)}</span>
        {/if}
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
          {#if canPreview}
            <button class="button is-light" onclick={() => previewBook(book)}>
              <span class="icon"><i data-lucide="gauge" aria-label="Preview"></i></span>
              <span>Preview</span>
            </button>
          {/if}
        </div>
        <!-- Coverage preview: downloads + samples the EPUB on-device and shows
             how much of its vocabulary you already know. -->
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
