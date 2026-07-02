<!--
  Text List (Library) — Svelte 5 port of the Alpine `textsGroupedApp` component.

  Drives the active-texts list for the currently selected language: it loads the
  flat list (`GET /texts/by-language/{id}`) plus a single batched statistics call
  (`TextsApi.getStatistics`), with "Show More" pagination, sort, a marked-Set
  selection, bulk actions, and a per-card "More" dropdown. The data layer is the
  *same* as the Alpine version (`TextsApi` → local-first Dexie or a remote
  `/api/v1`), so behaviour is unchanged; only the rendering is Svelte. Reactivity
  uses runes ($state/$derived) with a reactive `SvelteSet`/`SvelteMap`, and Svelte
  compiles to plain JS so the island runs under the bundle's strict
  `script-src 'self'` CSP.

  This backs only the bundled app's `library.html`. The PHP server's PWA still
  renders the Alpine `texts_grouped_app.ts` — the two are built from the same
  `src/frontend/` source and coexist until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';
  import { apiGet, getCsrfToken } from '@shared/api/client';
  import { TextsApi } from '@modules/text/api/texts_api';
  import { isLocalFirst } from '@shared/offline/local/router';
  import { confirmDelete } from '@shared/utils/ui_utilities';
  import { statusLabel, STATUS_ORDER } from '@shared/stores/statuses';
  import { initIcons } from '@shared/icons/lucide_icons';

  /** Pull the numeric text id out of an action URL (`/texts/42`, `/texts/42/archive`, …). */
  function textIdFromUrl(url: string): number {
    const m = url.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /** One text in the active-texts list, as returned by `/texts/by-language/{id}`. */
  interface TextItem {
    id: number;
    title: string;
    has_audio: boolean;
    source_uri: string;
    has_source: boolean;
    annotated: boolean;
    taglist: string;
  }

  /** Per-text word statistics, as returned by `TextsApi.getStatistics`. */
  interface TextStats {
    total: number;
    saved: number;
    unknown: number;
    unknownPercent: number;
    statusCounts: Record<string, number>;
  }

  interface PaginationInfo {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  }

  interface TextsByLanguageResponse {
    texts: TextItem[];
    pagination: PaginationInfo;
  }

  let { activeLanguageId = 0 }: { activeLanguageId?: number } = $props();

  // --- Reactive state (runes) -------------------------------------------------
  let loading = $state(true);
  let loadingMore = $state(false);
  let texts = $state<TextItem[]>([]);
  // A reactive Map — `set`/`clear` update the UI directly, which the Alpine
  // version had to fake with a plain Map plus manual getters.
  const stats = new SvelteMap<number, TextStats>();
  let pagination = $state<PaginationInfo>({
    current_page: 0,
    per_page: 10,
    total: 0,
    total_pages: 0
  });
  const markedTexts = new SvelteSet<number>();
  let sort = $state(1);
  // The text id whose "More" dropdown is open (null = none). One-at-a-time, the
  // way Alpine's per-card `dropdownToggle` behaved with `@click.outside`.
  let openDropdownId = $state<number | null>(null);

  // --- Derived ----------------------------------------------------------------
  const summaryText = $derived(
    `${pagination.total} text${pagination.total === 1 ? '' : 's'}`
  );
  const hasMore = $derived(pagination.current_page < pagination.total_pages);

  // --- Data loading -----------------------------------------------------------
  async function loadTexts(page = 1): Promise<void> {
    if (page > 1) {
      loadingMore = true;
    }

    const response = await apiGet<TextsByLanguageResponse>(
      `/texts/by-language/${activeLanguageId}`,
      { page, per_page: 10, sort }
    );

    if (response.data) {
      if (page === 1) {
        texts = response.data.texts;
      } else {
        texts.push(...response.data.texts);
      }
      pagination = response.data.pagination;

      const textIds = response.data.texts.map((t) => t.id);
      if (textIds.length > 0) {
        await loadStatisticsForTexts(textIds);
      }
    }

    loadingMore = false;
  }

  async function loadStatisticsForTexts(textIds: number[]): Promise<void> {
    if (textIds.length === 0) return;

    const response = await TextsApi.getStatistics(textIds);
    if (response.data) {
      const statsData = response.data as unknown as Record<string, TextStats>;
      for (const [textIdStr, s] of Object.entries(statsData)) {
        stats.set(parseInt(textIdStr, 10), s);
      }
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore) return;
    await loadTexts(pagination.current_page + 1);
  }

  // --- Selection --------------------------------------------------------------
  function markAllTexts(checked: boolean): void {
    if (checked) {
      for (const t of texts) markedTexts.add(t.id);
    } else {
      markedTexts.clear();
    }
  }

  function toggleTextMark(textId: number, checked: boolean): void {
    if (checked) markedTexts.add(textId);
    else markedTexts.delete(textId);
  }

  // --- Bulk actions -----------------------------------------------------------
  // Marked-action select values → PUT /api/v1/texts/bulk-action. Replaces the
  // retired native `POST /texts` form, which hit the page origin (not the
  // connected server), so tag / reparse / set-sentences were broken in the
  // packaged app. ("Review Marked Texts" was dropped: it was session-based on
  // the server and never worked cross-origin — restoring it needs a headless
  // review-backend redesign, tracked separately.)
  const MULTI_ACTION_MAP: Record<
    string,
    'archive' | 'delete' | 'add-tag' | 'remove-tag' | 'rebuild' | 'set-sentences' | 'set-active-sentences'
  > = {
    arch: 'archive',
    del: 'delete',
    addtag: 'add-tag',
    deltag: 'remove-tag',
    rebuild: 'rebuild',
    setsent: 'set-sentences',
    setactsent: 'set-active-sentences'
  };

  async function handleMultiAction(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const action = select.value;
    select.value = '';
    if (!action) return;

    const markedIds = Array.from(markedTexts);
    if (markedIds.length === 0) return;

    const apiAction = MULTI_ACTION_MAP[action];
    if (apiAction === undefined) return;

    if (apiAction === 'delete' && !confirmDelete()) return;

    // Tag actions need a tag name (the retired native form never sent one).
    let tag: string | undefined;
    if (apiAction === 'add-tag' || apiAction === 'remove-tag') {
      const entered = window.prompt(apiAction === 'add-tag' ? 'Tag to add:' : 'Tag to remove:');
      if (entered === null) return;
      tag = entered.trim();
      if (tag === '') return;
    }

    const res = await TextsApi.bulkAction(apiAction, markedIds, tag !== undefined ? { tag } : undefined);
    if (res.error) {
      alert('Action failed. Please try again.');
      return;
    }
    window.location.reload();
  }

  function handleRestDelete(event: Event, url: string): void {
    event.preventDefault();
    if (!confirmDelete()) {
      return;
    }
    // Local-first (bundled offline): delete in IndexedDB via the local router
    // instead of a same-origin web-route fetch, which has no server to answer.
    if (isLocalFirst()) {
      void TextsApi.deleteText(textIdFromUrl(url)).then((res) => {
        if (res.error) {
          alert('Failed to delete. Please try again.');
          return;
        }
        window.location.reload();
      });
      return;
    }
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest'
    };
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-TOKEN'] = csrf;
    }
    fetch(url, { method: 'DELETE', headers })
      .then(() => {
        window.location.reload();
      })
      .catch((error) => {
        console.error('Delete failed:', error);
        alert('Failed to delete. Please try again.');
      });
  }

  function handlePostAction(event: Event, url: string): void {
    event.preventDefault();
    // Local-first (bundled offline): the archive/unarchive state lives on-device,
    // so route through the local API seam rather than a web-route form POST.
    if (isLocalFirst()) {
      const id = textIdFromUrl(url);
      const op = url.endsWith('/unarchive') ? TextsApi.unarchive(id) : TextsApi.archive(id);
      void op.then((res) => {
        if (res.error) {
          alert('Action failed. Please try again.');
          return;
        }
        window.location.reload();
      });
      return;
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';
    // CsrfMiddleware rejects POST/PUT/DELETE/PATCH without an _csrf_token field
    // or X-CSRF-TOKEN header. Inject the token from the meta tag added in
    // PageLayoutHelper.
    const csrf = getCsrfToken();
    if (csrf) {
      const csrfField = document.createElement('input');
      csrfField.type = 'hidden';
      csrfField.name = '_csrf_token';
      csrfField.value = csrf;
      form.appendChild(csrfField);
    }
    document.body.appendChild(form);
    form.submit();
  }

  // --- Sorting ----------------------------------------------------------------
  function handleSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    sort = parseInt(select.value, 10) || 1;
    texts = [];
    stats.clear();
    pagination.current_page = 0;
    void loadTexts();
  }

  // --- Per-card "More" dropdown ----------------------------------------------
  function toggleDropdown(event: Event, textId: number): void {
    event.preventDefault();
    event.stopPropagation();
    openDropdownId = openDropdownId === textId ? null : textId;
  }

  // --- Utility ----------------------------------------------------------------
  function parseTags(tagList: string): string[] {
    if (!tagList || tagList.trim() === '') {
      return [];
    }
    return tagList
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');
  }

  function getStatusSegments(
    textId: number
  ): Array<{ status: number; percent: string; label: string; count: number }> {
    const s = stats.get(textId);
    if (!s || s.total === 0) {
      return [];
    }
    const { total, unknown, statusCounts } = s;
    const segments: Array<{ status: number; percent: string; label: string; count: number }> = [];
    for (const status of STATUS_ORDER) {
      const count = status === 0 ? unknown : statusCounts[String(status)] || 0;
      if (count > 0) {
        const pct = (count / total) * 100;
        segments.push({
          status,
          percent: pct.toFixed(2) + '%',
          label: `${statusLabel(status)}: ${count} (${pct.toFixed(1)}%)`,
          count
        });
      }
    }
    return segments;
  }

  // Safe accessors for stats (mirror the Alpine getters).
  const getStatTotal = (textId: number): string => {
    const s = stats.get(textId);
    return s ? String(s.total) : '-';
  };
  const getStatSaved = (textId: number): string => {
    const s = stats.get(textId);
    return s ? String(s.saved) : '-';
  };
  const getStatUnknown = (textId: number): string => {
    const s = stats.get(textId);
    return s ? String(s.unknown) : '-';
  };
  const getStatUnknownPercent = (textId: number): string => {
    const s = stats.get(textId);
    return s ? s.unknownPercent + '%' : '-';
  };

  // Re-run lucide whenever the rendered icon set changes (rows added on load /
  // "Show More", the loading spinner, or a "More" dropdown toggle add/remove
  // `<i data-lucide>` nodes).
  $effect(() => {
    void texts;
    void loading;
    void loadingMore;
    void openDropdownId;
    void stats.size;
    void tick().then(() => initIcons());
  });

  // Close the open "More" dropdown on an outside click (Alpine's `@click.outside`).
  // Clicks inside the open card's dropdown container keep it open.
  $effect(() => {
    function onDocClick(e: MouseEvent): void {
      if (openDropdownId === null) return;
      const container = (e.target as Element).closest('[data-dropdown-id]');
      const clickedId = container ? Number(container.getAttribute('data-dropdown-id')) : null;
      if (clickedId !== openDropdownId) {
        openDropdownId = null;
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  onMount(async () => {
    if (activeLanguageId > 0) {
      await loadTexts();
    }
    loading = false;
  });
</script>

{#if loading}
  <!-- Loading state -->
  <div class="has-text-centered py-6">
    <span class="icon is-large">
      <i data-lucide="loader-2" class="icon-spin" aria-label="Loading"></i>
    </span>
    <p class="mt-2">Loading texts...</p>
  </div>
{:else if texts.length > 0}
  <!-- Sort control and summary -->
  <div class="box mb-4">
    <div class="level">
      <div class="level-left">
        <div class="level-item">
          <span class="has-text-weight-semibold">{summaryText}</span>
        </div>
      </div>
      <div class="level-right">
        <div class="level-item">
          <div class="field has-addons">
            <div class="control"><span class="button is-static is-small">Sort</span></div>
            <div class="control">
              <div class="select is-small">
                <select value={sort} onchange={handleSortChange} aria-label="Sort texts by">
                  <option value={1}>Title A-Z</option>
                  <option value={2}>Newest first</option>
                  <option value={3}>Oldest first</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bulk actions -->
  <div class="level mb-4">
    <div class="level-left">
      <div class="level-item">
        <div class="buttons are-small">
          <button type="button" class="button" onclick={() => markAllTexts(true)}>
            <i data-lucide="check-square" class="icon" aria-label="Mark All" style="width:14px;height:14px"></i>
            <span class="ml-1">Mark All</span>
          </button>
          <button type="button" class="button" onclick={() => markAllTexts(false)}>
            <i data-lucide="square" class="icon" aria-label="Mark None" style="width:14px;height:14px"></i>
            <span class="ml-1">Mark None</span>
          </button>
          {#if markedTexts.size > 0}
            <span class="tag is-warning ml-2">{markedTexts.size} selected</span>
          {/if}
        </div>
      </div>
    </div>
    <div class="level-right">
      <div class="level-item">
        <div class="field has-addons">
          <div class="control">
            <span class="button is-static is-small">
              <i data-lucide="zap" class="icon" aria-label="Actions" style="width:14px;height:14px"></i>
              <span class="ml-1">Actions</span>
            </span>
          </div>
          <div class="control">
            <div class="select is-small">
              <select
                disabled={markedTexts.size === 0}
                onchange={(e) => void handleMultiAction(e)}
                aria-label="Bulk actions for selected texts"
              >
                <option value="">[Choose...]</option>
                <option disabled>------------</option>
                <option value="addtag">Add Tag</option>
                <option value="deltag">Remove Tag</option>
                <option disabled>------------</option>
                <option value="rebuild">Reparse Texts</option>
                <option value="setsent">Set Term Sentences</option>
                <option value="setactsent">Set Active Term Sentences</option>
                <option disabled>------------</option>
                <option value="arch">Archive Marked Texts</option>
                <option disabled>------------</option>
                <option value="del">Delete Marked Texts</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Text cards grid -->
  <div class="columns is-multiline text-cards">
    {#each texts as text (text.id)}
      <div class="column is-4-desktop is-6-tablet is-12-mobile">
        <div class="card text-card">
          <header class="card-header">
            <label class="card-header-icon checkbox-wrapper">
              <input
                type="checkbox"
                class="markcheck"
                aria-label={'Select ' + text.title}
                checked={markedTexts.has(text.id)}
                onchange={(e) => toggleTextMark(text.id, e.currentTarget.checked)}
              />
            </label>
            <p class="card-header-title">{text.title}</p>
            <div class="card-header-icon card-icons">
              {#if text.has_audio}
                <span title="With Audio">
                  <i data-lucide="volume-2" class="icon" aria-label="With Audio" style="width:16px;height:16px"></i>
                </span>
              {/if}
              {#if text.has_source}
                <a href={text.source_uri} target="_blank" rel="noopener noreferrer" title="Source Link">
                  <i data-lucide="external-link" class="icon" aria-label="Source Link" style="width:16px;height:16px"></i>
                </a>
              {/if}
              {#if text.annotated}
                <a href={'/text/' + text.id + '/print'} title="Annotated Text">
                  <i data-lucide="file-text" class="icon" aria-label="Annotated Text" style="width:16px;height:16px"></i>
                </a>
              {/if}
            </div>
          </header>

          <div class="card-content">
            <!-- Tags -->
            {#if text.taglist}
              <div class="text-meta mb-3">
                <div class="tags">
                  {#each parseTags(text.taglist) as tag (tag)}
                    <span class="tag is-info is-light is-small">{tag}</span>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Word Statistics -->
            <div class="text-stats">
              {#if stats.has(text.id)}
                <div>
                  <div class="stat-row">
                    <div class="stat-item" title="Total number of unique words in this text">
                      <span class="stat-label">Total</span>
                      <span class="stat-value">{getStatTotal(text.id)}</span>
                    </div>
                    <div class="stat-item" title="Words you have saved to your vocabulary">
                      <span class="stat-label">Saved</span>
                      <span class="stat-value">
                        <a
                          class="status4"
                          href={'/words/edit?page=1&query=&status=&tag12=0&tag2=&tag1=&text_mode=0&text=' + text.id}
                        >{getStatSaved(text.id)}</a>
                      </span>
                    </div>
                    <div class="stat-item" title="Words you haven't saved yet">
                      <span class="stat-label">Unknown</span>
                      <span class="stat-value status0">{getStatUnknown(text.id)}</span>
                    </div>
                    <div class="stat-item" title="Percentage of unknown words">
                      <span class="stat-label">Unkn.%</span>
                      <span class="stat-value">{getStatUnknownPercent(text.id)}</span>
                    </div>
                  </div>
                  <!-- Status distribution bar chart -->
                  <div class="status-bar-chart">
                    {#each getStatusSegments(text.id) as seg (seg.status)}
                      <div
                        class={'status-segment bc' + seg.status}
                        style={'width: ' + seg.percent}
                        title={seg.label}
                      ></div>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="stat-row">
                  <span class="has-text-grey is-size-7">Loading statistics...</span>
                </div>
              {/if}
            </div>
          </div>

          <footer class="card-footer">
            <a href={'/text/' + text.id + '/read'} class="card-footer-item is-primary-action">
              <i data-lucide="book-open" class="icon" aria-label="Read" style="width:16px;height:16px"></i>
              <span>Read</span>
            </a>
            <a href={'/review?text=' + text.id} class="card-footer-item">
              <i data-lucide="circle-help" class="icon" aria-label="Review" style="width:16px;height:16px"></i>
              <span>Review</span>
            </a>
            <div class="card-footer-item has-dropdown" data-dropdown-id={text.id}>
              <button type="button" class="dropdown-trigger-link" onclick={(e) => toggleDropdown(e, text.id)}>
                <i data-lucide="more-horizontal" class="icon" aria-label="More" style="width:16px;height:16px"></i>
                <span>More</span>
              </button>
              {#if openDropdownId === text.id}
                <div class="dropdown-menu card-dropdown">
                  <div class="dropdown-content">
                    <a href={'/text/' + text.id + '/print-plain'} class="dropdown-item">
                      <i data-lucide="printer" class="icon" aria-label="Print" style="width:14px;height:14px"></i>
                      <span>Print</span>
                    </a>
                    <a
                      href={'/texts/' + text.id + '/archive'}
                      class="dropdown-item"
                      onclick={(e) => handlePostAction(e, '/texts/' + text.id + '/archive')}
                    >
                      <i data-lucide="archive" class="icon" aria-label="Archive" style="width:14px;height:14px"></i>
                      <span>Archive</span>
                    </a>
                    <a href={'/texts/' + text.id + '/edit'} class="dropdown-item">
                      <i data-lucide="file-pen" class="icon" aria-label="Edit" style="width:14px;height:14px"></i>
                      <span>Edit</span>
                    </a>
                    <hr class="dropdown-divider" />
                    <a
                      href={'/texts/' + text.id}
                      class="dropdown-item has-text-danger"
                      onclick={(e) => handleRestDelete(e, '/texts/' + text.id)}
                    >
                      <i data-lucide="trash-2" class="icon" aria-label="Delete" style="width:14px;height:14px"></i>
                      <span>Delete</span>
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          </footer>
        </div>
      </div>
    {/each}
  </div>

  <!-- Show More pagination -->
  {#if hasMore}
    <div class="has-text-centered mt-4">
      <button type="button" class="button is-info is-outlined" class:is-loading={loadingMore} onclick={loadMore}>
        <span class="icon"><i data-lucide="chevron-down" aria-label="Show More"></i></span>
        <span>Show More</span>
      </button>
    </div>
  {/if}
{:else}
  <!-- Empty state -->
  <div class="notification is-info is-light">
    <p>No texts found for this language. <a href="/texts/new">Create your first text</a> to get started!</p>
  </div>
{/if}
