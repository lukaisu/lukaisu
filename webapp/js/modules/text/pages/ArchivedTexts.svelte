<!--
  Archived Texts — Svelte 5 port of the Alpine `archivedTextsGroupedApp` component.

  Drives the archived-texts list grouped by language with collapsible sections.
  Unlike the flat active list (`TextList.svelte`), each language is its own
  collapsible card: collapse state persists in localStorage
  (`lukaisu_collapsed_archived_languages`), texts load lazily per language on
  expand (`GET /texts/archived-by-language/{id}`), each section has its own
  "Show More" pagination and per-language bulk selection, and a sort change
  reloads only the languages already loaded. The data layer is the *same* as the
  Alpine version (`apiGet` → local-first Dexie or a remote `/api/v1`, plus
  `TextsApi` for on-device unarchive/delete), so behaviour is unchanged; only the
  rendering is Svelte. Reactivity uses runes ($state/$derived) with a reactive
  `SvelteMap` of per-language state (each entry a reactive class instance with a
  `SvelteSet` of marked ids), and Svelte compiles to plain JS so the island runs
  under the bundle's strict `script-src 'self'` CSP.

  This backs only the bundled app's `texts.html`. The PHP server's PWA still
  renders the Alpine `archived_texts_grouped_app.ts` — the two are built from the
  same `src/frontend/` source and coexist until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { apiGet, getCsrfToken } from '@shared/api/client';
  import { TextsApi } from '@modules/text/api/texts_api';
  import { isLocalFirst } from '@shared/offline/local/router';
  import { confirmDelete } from '@shared/utils/ui_utilities';
  import { initIcons } from '@shared/icons/lucide_icons';

  /** localStorage key holding the collapsed language ids (same shape as Alpine). */
  const STORAGE_KEY = 'lukaisu_collapsed_archived_languages';

  /** Pull the numeric text id out of an action URL (`/text/archived/42`, `/texts/42/unarchive`, …). */
  function textIdFromUrl(url: string): number {
    const m = url.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /** A language with its archived-text count, from `/languages/with-archived-texts`. */
  interface LanguageWithArchivedTexts {
    id: number;
    name: string;
    text_count: number;
  }

  /** One archived text, as returned by `/texts/archived-by-language/{id}`. */
  interface ArchivedTextItem {
    id: number;
    title: string;
    has_audio: boolean;
    source_uri: string;
    has_source: boolean;
    annotated: boolean;
    taglist: string;
  }

  interface PaginationInfo {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  }

  interface LanguagesWithArchivedTextsResponse {
    languages: LanguageWithArchivedTexts[];
  }

  interface ArchivedTextsByLanguageResponse {
    texts: ArchivedTextItem[];
    pagination: PaginationInfo;
  }

  /**
   * Per-language archived-texts state. A class with `$state` fields so nested
   * mutations (`texts.push`, `loading`, `pagination.current_page`) stay reactive
   * even when the instance is stored in a `SvelteMap` (which proxies map ops, not
   * its values). `marked` is a `SvelteSet` so selection updates the UI directly.
   */
  class LanguageArchivedState {
    texts = $state<ArchivedTextItem[]>([]);
    pagination = $state<PaginationInfo>({
      current_page: 0,
      per_page: 10,
      total: 0,
      total_pages: 0
    });
    loading = $state(false);
    marked = new SvelteSet<number>();

    constructor(textCount: number) {
      this.pagination = {
        current_page: 0,
        per_page: 10,
        total: textCount,
        total_pages: Math.ceil(textCount / 10)
      };
    }
  }

  let { activeLanguageId = 0 }: { activeLanguageId?: number } = $props();

  // --- Reactive state (runes) -------------------------------------------------
  let loading = $state(true);
  let languages = $state<LanguageWithArchivedTexts[]>([]);
  let collapsedLanguages = $state<number[]>([]);
  // Reactive map: adding/removing entries is tracked, and each value is a
  // reactive class instance so its nested fields update the UI too.
  const languageStates = new SvelteMap<number, LanguageArchivedState>();
  let sort = $state(1);
  // Gates the collapse-persistence effect until the initial load has decided the
  // starting collapse set, so we never clobber stored state with the default `[]`.
  let collapseReady = $state(false);

  // --- Data loading -----------------------------------------------------------
  async function loadLanguages(): Promise<void> {
    const response = await apiGet<LanguagesWithArchivedTextsResponse>(
      '/languages/with-archived-texts'
    );
    if (response.data) {
      languages = response.data.languages;
      for (const lang of languages) {
        languageStates.set(lang.id, new LanguageArchivedState(lang.text_count));
      }
    }
  }

  async function loadTextsForLanguage(langId: number, page = 1): Promise<void> {
    const state = languageStates.get(langId);
    if (!state) return;

    state.loading = true;

    const response = await apiGet<ArchivedTextsByLanguageResponse>(
      `/texts/archived-by-language/${langId}`,
      { page, per_page: 10, sort }
    );

    if (response.data) {
      if (page === 1) {
        state.texts = response.data.texts;
      } else {
        state.texts.push(...response.data.texts);
      }
      state.pagination = response.data.pagination;
    }

    state.loading = false;
  }

  // --- Collapse state ---------------------------------------------------------
  function isCollapsed(langId: number): boolean {
    return collapsedLanguages.includes(langId);
  }

  async function toggleLanguage(langId: number): Promise<void> {
    const index = collapsedLanguages.indexOf(langId);
    if (index > -1) {
      // Expanding — lazy-load this language's texts if not yet loaded.
      collapsedLanguages.splice(index, 1);
      const state = languageStates.get(langId);
      if (state && state.texts.length === 0) {
        await loadTextsForLanguage(langId);
      }
    } else {
      // Collapsing.
      collapsedLanguages.push(langId);
    }
    // Persistence is handled by the collapse $effect below.
  }

  function initializeDefaultCollapseState(): void {
    // Collapse all languages except the active one.
    collapsedLanguages = languages
      .filter((lang) => lang.id !== activeLanguageId)
      .map((lang) => lang.id);
  }

  // --- Text operations --------------------------------------------------------
  function getTextsForLanguage(langId: number): ArchivedTextItem[] {
    return languageStates.get(langId)?.texts ?? [];
  }

  function hasMoreTexts(langId: number): boolean {
    const state = languageStates.get(langId);
    if (!state) return false;
    return state.pagination.current_page < state.pagination.total_pages;
  }

  async function loadMoreTexts(langId: number): Promise<void> {
    const state = languageStates.get(langId);
    if (!state || state.loading) return;
    await loadTextsForLanguage(langId, state.pagination.current_page + 1);
  }

  function isLoadingMore(langId: number): boolean {
    return languageStates.get(langId)?.loading ?? false;
  }

  // --- Selection --------------------------------------------------------------
  function markAll(langId: number, checked: boolean): void {
    const state = languageStates.get(langId);
    if (!state) return;
    if (checked) {
      for (const t of state.texts) state.marked.add(t.id);
    } else {
      state.marked.clear();
    }
  }

  function toggleMark(langId: number, textId: number, checked: boolean): void {
    const state = languageStates.get(langId);
    if (!state) return;
    if (checked) state.marked.add(textId);
    else state.marked.delete(textId);
  }

  function isMarked(langId: number, textId: number): boolean {
    return languageStates.get(langId)?.marked.has(textId) ?? false;
  }

  function hasMarkedInLanguage(langId: number): boolean {
    const state = languageStates.get(langId);
    return state ? state.marked.size > 0 : false;
  }

  function getMarkedIds(langId: number): number[] {
    const state = languageStates.get(langId);
    return state ? Array.from(state.marked) : [];
  }

  function getMarkedCount(langId: number): number {
    return languageStates.get(langId)?.marked.size ?? 0;
  }

  // --- Actions ----------------------------------------------------------------
  // Marked-action select values → PUT /api/v1/texts/bulk-action (archived scope),
  // replacing the retired native `POST /text/archived` form (which hit the page
  // origin, not the connected server, so it was broken in the packaged app).
  const ARCHIVED_ACTION_MAP: Record<string, 'add-tag' | 'remove-tag' | 'unarchive' | 'delete'> = {
    addtag: 'add-tag',
    deltag: 'remove-tag',
    unarch: 'unarchive',
    del: 'delete'
  };

  async function handleMultiAction(langId: number, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const action = select.value;
    select.value = '';
    if (!action) return;

    const markedIds = getMarkedIds(langId);
    if (markedIds.length === 0) return;

    const apiAction = ARCHIVED_ACTION_MAP[action];
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

    const res = await TextsApi.bulkAction(apiAction, markedIds, { archived: true, tag });
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
    // Local-first (bundled offline): delete the archived text in IndexedDB via
    // the local router rather than a same-origin web-route fetch.
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
    // Local-first (bundled offline): unarchive on-device via the local seam
    // rather than a web-route form POST that has no server to answer it.
    if (isLocalFirst()) {
      void TextsApi.unarchive(textIdFromUrl(url)).then((res) => {
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

    // Reload only the languages that have already been loaded; leave unexpanded /
    // never-loaded sections to lazy-load with the new sort when first opened.
    for (const lang of languages) {
      const state = languageStates.get(lang.id);
      if (state && state.texts.length > 0) {
        state.texts = [];
        state.pagination.current_page = 0;
        if (!isCollapsed(lang.id)) {
          void loadTextsForLanguage(lang.id);
        }
      }
    }
  }

  // --- View helpers -----------------------------------------------------------
  function parseTags(tagList: string): string[] {
    if (!tagList || tagList.trim() === '') {
      return [];
    }
    return tagList
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');
  }

  function totalArchivedSummary(): string {
    let total = 0;
    for (const lang of languages) {
      total += lang.text_count;
    }
    const plural = languages.length === 1 ? '' : 's';
    return `${total} archived texts in ${languages.length} language${plural}`;
  }

  function archivedCountLabel(textCount: number): string {
    return textCount + ' archived text' + (textCount === 1 ? '' : 's');
  }

  function collapseAriaLabel(langId: number, langName: string): string {
    return isCollapsed(langId) ? 'Expand ' + langName + ' texts' : 'Collapse ' + langName + ' texts';
  }

  // --- Effects ----------------------------------------------------------------
  // Re-run lucide whenever the rendered icon set changes. Collapse toggles swap
  // the chevron `<i>` (rendered via {#if}/{:else} so a fresh node is created each
  // time, since lucide replaces `<i>` with `<svg>`), expanding a section mounts
  // its cards, and the per-section spinner adds/removes a `<i data-lucide>` node.
  $effect(() => {
    void loading;
    void languages.length;
    for (const id of collapsedLanguages) void id;
    for (const state of languageStates.values()) {
      void state.texts.length;
      void state.loading;
    }
    void tick().then(() => initIcons());
  });

  // Persist the collapsed-language set (same key/JSON shape as Alpine). Gated on
  // `collapseReady` so the initial mount can read the stored value before this
  // ever writes, then it writes on every toggle / default-collapse change.
  $effect(() => {
    const serialized = JSON.stringify(collapsedLanguages);
    if (!collapseReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // localStorage unavailable
    }
  });

  onMount(async () => {
    // Capture whether collapse state was stored *before* loading languages, so the
    // "first visit" default-collapse only runs when there is genuinely no state.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        collapsedLanguages = JSON.parse(raw);
      } catch {
        collapsedLanguages = [];
      }
    }

    await loadLanguages();

    // No stored collapse state → collapse all except the active language.
    if (!raw) {
      initializeDefaultCollapseState();
    }

    // Eager-load texts for expanded languages (up to the first 3).
    let loadedCount = 0;
    for (const lang of languages) {
      if (!isCollapsed(lang.id) && loadedCount < 3) {
        await loadTextsForLanguage(lang.id);
        loadedCount++;
      }
    }

    // Initial collapse set is decided; allow the persistence effect to write.
    collapseReady = true;
    loading = false;
  });
</script>

{#if loading}
  <!-- Loading state -->
  <div class="has-text-centered py-6">
    <span class="icon is-large">
      <i data-lucide="loader-2" class="icon-spin" aria-label="Loading"></i>
    </span>
    <p class="mt-2">Loading archived texts...</p>
  </div>
{:else if languages.length > 0}
  <!-- Global sort control -->
  <div class="box mb-4">
    <div class="level">
      <div class="level-left">
        <div class="level-item">
          <span class="has-text-weight-semibold">{totalArchivedSummary()}</span>
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

  <!-- Language sections -->
  {#each languages as lang (lang.id)}
    <div class="card mb-4">
      <!-- Collapsible header (clicking anywhere on the header toggles the section). -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <header
        class="card-header is-clickable"
        style="user-select: none;"
        onclick={() => toggleLanguage(lang.id)}
      >
        <p class="card-header-title">
          <span>{lang.name}</span>
          <span class="tag is-warning ml-2">{archivedCountLabel(lang.text_count)}</span>
        </p>
        <button
          class="card-header-icon"
          type="button"
          aria-label={collapseAriaLabel(lang.id, lang.name)}
          aria-expanded={!isCollapsed(lang.id)}
        >
          <span class="icon">
            {#if isCollapsed(lang.id)}
              <i data-lucide="chevron-right" aria-label="Expand"></i>
            {:else}
              <i data-lucide="chevron-down" aria-label="Collapse"></i>
            {/if}
          </span>
        </button>
      </header>

      <!-- Content (texts for this language). -->
      {#if !isCollapsed(lang.id)}
        <div class="card-content">
          <!-- Loading state for this language (initial section load only). -->
          {#if isLoadingMore(lang.id) && getTextsForLanguage(lang.id).length === 0}
            <div class="has-text-centered py-4">
              <span class="icon">
                <i data-lucide="loader-2" class="icon-spin" aria-label="Loading"></i>
              </span>
              <span class="ml-2">Loading...</span>
            </div>
          {/if}

          {#if getTextsForLanguage(lang.id).length > 0}
            <!-- Per-language bulk actions -->
            <div class="level mb-4">
              <div class="level-left">
                <div class="level-item">
                  <div class="buttons are-small">
                    <button type="button" class="button" onclick={() => markAll(lang.id, true)}>
                      <i data-lucide="square-check-big" class="icon" aria-label="Mark All" style="width:14px;height:14px"></i>
                      <span class="ml-1">Mark All</span>
                    </button>
                    <button type="button" class="button" onclick={() => markAll(lang.id, false)}>
                      <i data-lucide="square" class="icon" aria-label="Mark None" style="width:14px;height:14px"></i>
                      <span class="ml-1">Mark None</span>
                    </button>
                    {#if hasMarkedInLanguage(lang.id)}
                      <span class="tag is-warning ml-2">{getMarkedCount(lang.id)} selected</span>
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
                          disabled={!hasMarkedInLanguage(lang.id)}
                          onchange={(e) => void handleMultiAction(lang.id, e)}
                          aria-label="Bulk actions for selected texts"
                        >
                          <option value="">[Choose...]</option>
                          <option disabled>------------</option>
                          <option value="addtag">Add Tag</option>
                          <option value="deltag">Remove Tag</option>
                          <option disabled>------------</option>
                          <option value="unarch">Unarchive Marked Texts</option>
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
            <div class="columns is-multiline text-cards archived-text-cards">
              {#each getTextsForLanguage(lang.id) as text (text.id)}
                <div class="column is-4-desktop is-6-tablet is-12-mobile">
                  <div class="card text-card is-archived">
                    <header class="card-header">
                      <label class="card-header-icon checkbox-wrapper">
                        <input
                          type="checkbox"
                          class="markcheck"
                          aria-label={'Select ' + text.title}
                          checked={isMarked(lang.id, text.id)}
                          onchange={(e) => toggleMark(lang.id, text.id, e.currentTarget.checked)}
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
                          <span title="Annotated Text">
                            <i data-lucide="file-text" class="icon" aria-label="Annotated Text" style="width:16px;height:16px"></i>
                          </span>
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

                      <!-- Archive Status Badge -->
                      <div class="archive-badge">
                        <span class="tag is-warning is-light">
                          <i data-lucide="archive" class="icon" aria-label="Archived" style="width:12px;height:12px"></i>
                          <span class="ml-1">Archived</span>
                        </span>
                      </div>
                    </div>

                    <footer class="card-footer">
                      <a
                        href={'/texts/' + text.id + '/unarchive'}
                        class="card-footer-item is-primary-action"
                        onclick={(e) => handlePostAction(e, '/texts/' + text.id + '/unarchive')}
                      >
                        <i data-lucide="archive-restore" class="icon" aria-label="Unarchive" style="width:16px;height:16px"></i>
                        <span>Unarchive</span>
                      </a>
                      <a href={'/text/archived/' + text.id + '/edit'} class="card-footer-item">
                        <i data-lucide="file-pen" class="icon" aria-label="Edit" style="width:16px;height:16px"></i>
                        <span>Edit</span>
                      </a>
                      <a
                        href={'/text/archived/' + text.id}
                        class="card-footer-item has-text-danger"
                        onclick={(e) => handleRestDelete(e, '/text/archived/' + text.id)}
                      >
                        <i data-lucide="trash-2" class="icon" aria-label="Delete" style="width:16px;height:16px"></i>
                        <span>Delete</span>
                      </a>
                    </footer>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Per-language "Show More" pagination -->
          {#if hasMoreTexts(lang.id)}
            <div class="has-text-centered mt-4">
              <button
                type="button"
                class="button is-info is-outlined"
                class:is-loading={isLoadingMore(lang.id)}
                onclick={() => loadMoreTexts(lang.id)}
              >
                <span class="icon"><i data-lucide="chevron-down" aria-label="Show More"></i></span>
                <span>Show More</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
{:else}
  <!-- Empty state -->
  <div class="notification is-info is-light">
    <p>No archived texts found. Texts you archive will appear here.</p>
  </div>
{/if}
