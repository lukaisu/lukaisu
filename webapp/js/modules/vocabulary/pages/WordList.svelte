<!--
  Word List — Svelte 5 port of the Alpine `wordListApp` component.

  The first screen migrated from Alpine to Svelte 5 (the rendering-framework
  direction in BRIEFING.md / docs-src/server/local-first.md). It drives the
  *same* data layer as the Alpine version (`WordsApi` → local-first Dexie or a
  remote `/api/v1`), so the behaviour — filters, persisted columns, the two
  bulk-action menus, inline edit, pagination — is unchanged; only the rendering
  is Svelte. Reactivity uses runes ($state/$derived) and a reactive `SvelteSet`
  instead of the hand-rolled getters/Sets Alpine needed, and Svelte compiles to
  plain JS so the island runs under the bundle's strict `script-src 'self'` CSP.

  This backs only the bundled app's `words.html`. The PHP server's own PWA still
  renders the Alpine `word_list_app.ts` (via `list_alpine.php`) — the two are
  built from the same `src/frontend/` source and coexist until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { downloadTextFile } from '@shared/utils/download';
  import {
    WordsApi,
    type WordItem,
    type PaginationInfo,
    type FilterOptions,
    type WordListFilters
  } from '@modules/vocabulary/api/words_api';

  interface ColumnVisibility {
    romanization: boolean;
    translation: boolean;
    tags: boolean;
    sentence: boolean;
    status: boolean;
    score: boolean;
  }

  const STORAGE_KEY = 'lukaisu_word_list_filters';
  const COLUMNS_STORAGE_KEY = 'lukaisu_word_list_columns';

  let { activeLanguageId = 0, perPage = 50 }: { activeLanguageId?: number; perPage?: number } =
    $props();

  // --- Reactive state (runes) -------------------------------------------------
  let loading = $state(true);
  let words = $state<WordItem[]>([]);
  let pagination = $state<PaginationInfo>({ page: 1, per_page: 50, total: 0, total_pages: 0 });
  let filterOptions = $state<FilterOptions>({
    languages: [],
    texts: [],
    tags: [],
    statuses: [],
    sorts: []
  });
  // A reactive Set — mutating it (add/delete/clear) updates the UI directly,
  // which the Alpine version had to fake by reassigning and calling helpers.
  const marked = new SvelteSet<number>();

  let filters = $state<WordListFilters>({
    lang: null, // seeded from the activeLanguageId prop in onMount (see below)
    text_id: null,
    status: '',
    query: '',
    query_mode: 'term,rom,transl',
    regex_mode: '',
    tag1: null,
    tag2: null,
    tag12: 0,
    sort: 1,
    page: 1,
    per_page: 50 // seeded from the perPage prop in onMount (see below)
  });

  const perPageOptions = [25, 50, 100, 200, 500];

  let columns = $state<ColumnVisibility>({
    romanization: true,
    translation: true,
    tags: true,
    sentence: false,
    status: true,
    score: true
  });
  let columnsOpen = $state(false);
  let dropdownEl: HTMLElement | undefined = $state();

  // Inline-edit state
  let editingId = $state<number | null>(null);
  let editingField = $state<'translation' | 'romanization'>('translation');
  let editValue = $state('');
  let editSaving = $state(false);

  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  // --- Derived values ---------------------------------------------------------
  const markedCount = $derived(marked.size);
  const langName = $derived(
    filters.lang ? (filterOptions.languages.find((l) => l.id === Number(filters.lang))?.name ?? '') : ''
  );

  // --- Data loading -----------------------------------------------------------
  async function loadWords(): Promise<void> {
    const res = await WordsApi.getList(filters);
    if (res.data) {
      words = res.data.words;
      pagination = res.data.pagination;
      filters.page = res.data.pagination.page;
    }
  }

  async function loadFilterOptions(): Promise<void> {
    const langId =
      filters.lang !== null && filters.lang !== '' ? Number(filters.lang) : null;
    const res = await WordsApi.getFilterOptions(langId);
    if (res.data) {
      filterOptions = res.data;
      updateRomanizationVisibility();
    }
  }

  function updateRomanizationVisibility(): void {
    if (!filters.lang) return;
    const lang = filterOptions.languages.find((l) => l.id === Number(filters.lang));
    if (lang) {
      columns.romanization = lang.showRomanization;
      saveColumnState();
    }
  }

  // --- Filtering --------------------------------------------------------------
  function setFilter<K extends keyof WordListFilters>(key: K, value: WordListFilters[K]): void {
    // Select elements return strings; coerce numeric filter keys.
    if (key === 'sort' || key === 'page' || key === 'per_page') {
      value = Number(value) as WordListFilters[K];
    }
    filters[key] = value;

    // Reset to page 1 when a filter changes (except for page changes).
    if (key !== 'page') {
      filters.page = 1;
      marked.clear();
    }

    saveFilterState();
    void loadWords();

    // Reload filter options when language changes (to refresh the texts list).
    if (key === 'lang') {
      filters.text_id = null;
      void loadFilterOptions();
      updatePageTitle();
    }
  }

  function onFilterChange(key: keyof WordListFilters, e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    setFilter(key, value === '' ? (key === 'status' ? '' : null) : value);
  }

  function onQueryInput(e: Event): void {
    filters.query = (e.target as HTMLInputElement).value;
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => setFilter('query', filters.query ?? ''), 500);
  }

  function onQueryEnter(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      clearTimeout(queryTimer);
      setFilter('query', filters.query ?? '');
    }
  }

  function resetFilters(): void {
    filters = {
      lang: null,
      text_id: null,
      status: '',
      query: '',
      query_mode: 'term,rom,transl',
      regex_mode: '',
      tag1: null,
      tag2: null,
      tag12: 0,
      sort: 1,
      page: 1,
      per_page: perPage
    };
    marked.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    void loadFilterOptions();
    void loadWords();
    updatePageTitle();
  }

  function loadFilterState(): void {
    // URL params first.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lang')) {
      const langParam = urlParams.get('lang');
      filters.lang = langParam ? parseInt(langParam, 10) : null;
    }
    // Then localStorage (URL lang takes precedence).
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        filters = { ...filters, ...parsed };
        if (urlParams.has('lang')) {
          const langParam = urlParams.get('lang');
          filters.lang = langParam ? parseInt(langParam, 10) : null;
        }
      }
    } catch {
      // localStorage unavailable or invalid JSON
    }
  }

  function saveFilterState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // localStorage unavailable
    }
  }

  // --- Pagination / per-page --------------------------------------------------
  function setPerPage(value: number | string): void {
    filters.per_page = Number(value);
    filters.page = 1;
    marked.clear();
    saveFilterState();
    void loadWords();
  }

  function goToPage(page: number): void {
    if (page < 1 || page > pagination.total_pages) return;
    setFilter('page', page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const isFirstPage = $derived(pagination.page <= 1);
  const isLastPage = $derived(pagination.page >= pagination.total_pages);
  const paginationText = $derived(
    pagination.total_pages === 0 ? '0 / 0' : `${pagination.page} / ${pagination.total_pages}`
  );

  // --- Columns ----------------------------------------------------------------
  function toggleColumn(col: keyof ColumnVisibility): void {
    columns[col] = !columns[col];
    saveColumnState();
  }
  function loadColumnState(): void {
    try {
      const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (stored) columns = { ...columns, ...JSON.parse(stored) };
    } catch {
      // localStorage unavailable
    }
  }
  function saveColumnState(): void {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch {
      // localStorage unavailable
    }
  }

  // --- Selection --------------------------------------------------------------
  function markAll(checked: boolean): void {
    if (checked) for (const w of words) marked.add(w.id);
    else marked.clear();
  }
  function toggleMark(id: number, checked: boolean): void {
    if (checked) marked.add(id);
    else marked.delete(id);
  }

  // --- Bulk actions -----------------------------------------------------------
  async function handleMultiAction(e: Event): Promise<void> {
    const select = e.target as HTMLSelectElement;
    const action = select.value;
    if (!action) return;

    const ids = Array.from(marked);
    if (ids.length === 0) {
      alert(t('vocabulary.list.no_terms_selected'));
      select.value = '';
      return;
    }

    let data: string | undefined;

    if (action === 'addtag' || action === 'deltag') {
      const tag = prompt(t('vocabulary.list.prompt_tag'));
      if (!tag) {
        select.value = '';
        return;
      }
      if (tag.includes(' ') || tag.includes(',') || tag.length > 20) {
        alert(t('vocabulary.list.invalid_tag'));
        select.value = '';
        return;
      }
      data = tag;
    }

    if (action === 'del') {
      if (!confirm(t('vocabulary.list.confirm_delete', { count: ids.length }))) {
        select.value = '';
        return;
      }
    }

    if (action === 'review') {
      window.location.href = `/review?selection=${ids.join(',')}`;
      return;
    }

    if (action === 'exp' || action === 'expann' || action === 'exptsv') {
      await exportMarked(action, ids);
      select.value = '';
      return;
    }

    const res = await WordsApi.bulkAction(ids, action, data);
    if (res.data?.success) {
      marked.clear();
      await loadWords();
    } else {
      alert(res.data?.message || res.error || t('vocabulary.list.action_failed'));
    }
    select.value = '';
  }

  async function handleAllAction(e: Event): Promise<void> {
    const select = e.target as HTMLSelectElement;
    const action = select.value;
    if (!action) return;

    if (!confirm(t('vocabulary.list.confirm_apply_all', { count: pagination.total }))) {
      select.value = '';
      return;
    }

    let data: string | undefined;
    if (action.endsWith('addtag') || action.endsWith('deltag')) {
      const tag = prompt(t('vocabulary.list.prompt_tag_simple'));
      if (!tag) {
        select.value = '';
        return;
      }
      data = tag;
    }

    const actionCode = action.replace(/^all/, '');
    const res = await WordsApi.allAction(filters, actionCode, data);
    if (res.data?.success) {
      await loadWords();
    } else {
      alert(res.data?.message || res.error || t('vocabulary.list.action_failed'));
    }
    select.value = '';
  }

  // Words-list export dropdown action -> server export format.
  const EXPORT_FORMATS: Record<string, string> = {
    exp: 'anki',
    exptsv: 'tsv',
    expann: 'flexible'
  };

  // Replaces the native form POST to /words: fetch the export body from the
  // bearer-authed /api/v1/terms/export endpoint, then trigger a Blob download.
  // A bearer-authed download can't be a plain navigation (no auth header), so we
  // materialize the returned body client-side. Ownership is enforced server-side.
  async function exportMarked(action: string, ids: number[]): Promise<void> {
    const format = EXPORT_FORMATS[action] ?? 'anki';
    const res = await WordsApi.exportTerms(ids, format);
    if (res.error || !res.data) {
      alert(res.error || t('vocabulary.list.action_failed'));
      return;
    }
    if (!res.data.content) {
      // Plain-English fallback (no new i18n key): the Anki export only includes
      // terms that have both a translation and an example sentence, so a
      // selection can legitimately yield nothing.
      alert('No exportable terms in the selection.');
      return;
    }
    downloadTextFile(res.data.filename || 'lukaisu_export.txt', res.data.content);
  }

  // --- Inline edit ------------------------------------------------------------
  function startEdit(w: WordItem, field: 'translation' | 'romanization'): void {
    editingId = w.id;
    editingField = field;
    const cur = field === 'translation' ? w.translation : w.romanization;
    editValue = cur === '*' ? '' : cur;
  }
  async function saveEdit(): Promise<void> {
    if (editingId == null) return;
    editSaving = true;
    const res = await WordsApi.inlineEdit(editingId, editingField, editValue);
    if (res.data?.success) {
      const w = words.find((x) => x.id === editingId);
      if (w) {
        if (editingField === 'translation') w.translation = res.data.value;
        else w.romanization = res.data.value;
      }
    } else {
      alert(res.data?.error || res.error || t('vocabulary.list.save_failed'));
    }
    editingId = null;
    editValue = '';
    editSaving = false;
  }
  function cancelEdit(): void {
    editingId = null;
    editValue = '';
  }
  const isEditing = (id: number, field: 'translation' | 'romanization'): boolean =>
    editingId === id && editingField === field;

  // --- Display helpers --------------------------------------------------------
  function formatScore(score: number): string {
    if (score < 0) return '0%';
    return Math.floor(score) + '%';
  }
  function statusClass(status: number): string {
    if (status === 99) return 'is-info';
    if (status === 98) return 'is-light';
    if (status >= 5) return 'is-success';
    if (status >= 3) return 'is-warning';
    return 'is-danger';
  }
  function statusDisplay(w: WordItem): string {
    if (w.status >= 98) return w.statusAbbr;
    return w.statusAbbr + '/' + w.days;
  }
  const displayValue = (w: WordItem, field: 'translation' | 'romanization'): string =>
    (field === 'translation' ? w.translation : w.romanization) || '*';

  // CSP-safe markdown: strip formatting to plain text (mirrors main.ts's
  // `$markdown` Alpine magic — the bundle's CSP forbids innerHTML).
  function stripMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  // --- Labels (i18n, matching the Alpine component) ---------------------------
  const termCountLabel = $derived(
    t(
      pagination.total === 1
        ? 'vocabulary.list.term_count_one'
        : 'vocabulary.list.term_count_other',
      { count: pagination.total }
    )
  );
  const pageLabel = $derived(
    t('vocabulary.list.page_x_of_y', {
      page: pagination.page,
      total: pagination.total_pages
    })
  );
  const markedCountLabel = $derived(
    t('vocabulary.list.marked_count', { count: markedCount })
  );

  // --- Page title -------------------------------------------------------------
  // The h1 + document title live in the page shell (words.html), so we update
  // them imperatively, exactly as the Alpine component did.
  function updatePageTitle(): void {
    const title = langName
      ? t('vocabulary.list.title_lang_terms', { lang: langName })
      : t('vocabulary.list.title_terms');
    const h1 = document.querySelector('h1');
    if (h1) {
      const debugSpan = h1.querySelector('.red');
      h1.textContent = title;
      if (debugSpan) {
        h1.appendChild(document.createTextNode(' '));
        h1.appendChild(debugSpan);
      }
    }
    document.title = t('vocabulary.list.document_title', { title });
  }

  // Re-run lucide whenever the rendered icon set changes (rows, columns, the
  // dropdown, or an inline-edit toggle add/remove `<i data-lucide>` nodes).
  // Each column flag is read explicitly so per-column toggles are tracked.
  $effect(() => {
    void words;
    void columns.romanization;
    void columns.translation;
    void columns.tags;
    void columns.sentence;
    void columns.status;
    void columns.score;
    void columnsOpen;
    void loading;
    void editingId;
    void filters.sort;
    void tick().then(() => initIcons());
  });

  // Close the columns dropdown on an outside click (Alpine's `@click.outside`).
  $effect(() => {
    function onDocClick(e: MouseEvent): void {
      if (columnsOpen && dropdownEl && !dropdownEl.contains(e.target as Node)) {
        columnsOpen = false;
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  onMount(async () => {
    filters.lang = activeLanguageId || null;
    filters.per_page = perPage;
    loadColumnState();
    loadFilterState();
    await loadFilterOptions();
    await loadWords();
    loading = false;
    updatePageTitle();
  });
</script>

{#if loading}
  <div class="has-text-centered py-6">
    <span class="icon is-large">
      <i data-lucide="loader-2" class="icon animate-spin" aria-label="Loading" style="width:16px;height:16px"></i>
    </span>
    <p class="mt-2">Loading terms...</p>
  </div>
{:else}
  <!-- Filter bar -->
  <div class="box mb-4">
    <div class="columns is-multiline is-vcentered">
      <!-- Text filter (only when a language is selected and it has texts) -->
      {#if filters.lang && filterOptions.texts.length > 0}
        <div class="column is-narrow">
          <div class="field has-addons">
            <div class="control"><span class="button is-static is-small">Text</span></div>
            <div class="control">
              <div class="select is-small">
                <select value={filters.text_id ?? ''} onchange={(e) => onFilterChange('text_id', e)}>
                  <option value="">All Texts</option>
                  {#each filterOptions.texts as text (text.id)}
                    <option value={text.id}>{text.title}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Status filter -->
      <div class="column is-narrow">
        <div class="field has-addons">
          <div class="control"><span class="button is-static is-small">Status</span></div>
          <div class="control">
            <div class="select is-small">
              <select value={filters.status ?? ''} onchange={(e) => onFilterChange('status', e)}>
                {#each filterOptions.statuses as status (status.value)}
                  <option value={status.value}>{status.label}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Tag filter -->
      {#if filterOptions.tags.length > 0}
        <div class="column is-narrow">
          <div class="field has-addons">
            <div class="control"><span class="button is-static is-small">Tag</span></div>
            <div class="control">
              <div class="select is-small">
                <select value={filters.tag1 ?? ''} onchange={(e) => onFilterChange('tag1', e)}>
                  <option value="">Any Tag</option>
                  {#each filterOptions.tags as tag (tag.id)}
                    <option value={tag.id}>{tag.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Sort -->
      <div class="column is-narrow">
        <div class="field has-addons">
          <div class="control"><span class="button is-static is-small">Sort</span></div>
          <div class="control">
            <div class="select is-small">
              <select value={filters.sort} onchange={(e) => onFilterChange('sort', e)}>
                {#each filterOptions.sorts as sort (sort.value)}
                  <option value={sort.value}>{sort.label}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Per page -->
      <div class="column is-narrow">
        <div class="field has-addons">
          <div class="control"><span class="button is-static is-small">Show</span></div>
          <div class="control">
            <div class="select is-small">
              <select value={filters.per_page} onchange={(e) => setPerPage((e.target as HTMLSelectElement).value)}>
                {#each perPageOptions as opt (opt)}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Column visibility -->
      <div class="column is-narrow">
        <div class="dropdown" class:is-active={columnsOpen} bind:this={dropdownEl}>
          <div class="dropdown-trigger">
            <button type="button" class="button is-small" onclick={() => (columnsOpen = !columnsOpen)}>
              <span>Columns</span>
              <span class="icon is-small">
                <i data-lucide="chevron-down" class="icon" aria-label="Toggle" style="width:16px;height:16px"></i>
              </span>
            </button>
          </div>
          <div class="dropdown-menu" style="min-width: 10rem;">
            <div class="dropdown-content">
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.romanization} onchange={() => toggleColumn('romanization')} /> Romanization
              </label>
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.translation} onchange={() => toggleColumn('translation')} /> Translation
              </label>
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.tags} onchange={() => toggleColumn('tags')} /> Tags
              </label>
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.sentence} onchange={() => toggleColumn('sentence')} /> Sentence
              </label>
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.status} onchange={() => toggleColumn('status')} /> Status
              </label>
              <label class="dropdown-item checkbox is-size-7">
                <input type="checkbox" checked={columns.score} onchange={() => toggleColumn('score')} /> Score
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Search query -->
      <div class="column">
        <div class="field has-addons">
          <div class="control is-expanded has-icons-left">
            <input
              type="text"
              class="input is-small"
              placeholder="Search terms..."
              value={filters.query ?? ''}
              oninput={onQueryInput}
              onkeyup={onQueryEnter}
            />
            <span class="icon is-left">
              <i data-lucide="search" class="icon" aria-label="Search" style="width:16px;height:16px"></i>
            </span>
          </div>
          <div class="control">
            <button type="button" class="button is-small" onclick={resetFilters} title="Reset all filters">
              <i data-lucide="x" class="icon" aria-label="Reset" style="width:16px;height:16px"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Results summary -->
    {#if pagination.total > 0}
      <div class="level mt-3 pt-3" style="border-top: 1px solid #dbdbdb;">
        <div class="level-left">
          <div class="level-item"><span class="tag is-info is-medium">{termCountLabel}</span></div>
        </div>
        <div class="level-right">
          <div class="level-item"><span class="has-text-grey is-size-7">{pageLabel}</span></div>
        </div>
      </div>
    {/if}
  </div>

  <!-- No results message -->
  {#if words.length === 0}
    <div class="notification is-info is-light">
      <p>No terms found matching your filters. <a href="/words/new">Create a new term</a>.</p>
    </div>
  {/if}

  <!-- Multi Actions -->
  {#if words.length > 0}
    <div class="box mb-4">
      <div class="level is-mobile mb-3">
        <div class="level-left">
          <div class="level-item">
            <span class="icon-text">
              <i data-lucide="zap" class="icon" title="Multi Actions" aria-label="Multi Actions" style="width:16px;height:16px"></i>
              <span class="has-text-weight-semibold ml-1">Multi Actions</span>
            </span>
          </div>
        </div>
      </div>

      <div class="field is-grouped is-grouped-multiline">
        <div class="control">
          <div class="field has-addons">
            <div class="control">
              <span class="button is-static is-small"><strong>ALL</strong>&nbsp;<span>{termCountLabel}</span></span>
            </div>
            <div class="control">
              <div class="select is-small">
                <select onchange={handleAllAction}>
                  <option value="">[ Choose Action ]</option>
                  <optgroup label="Status Changes">
                    <option value="alls1">Set Status to 1</option>
                    <option value="alls2">Set Status to 2</option>
                    <option value="alls3">Set Status to 3</option>
                    <option value="alls4">Set Status to 4</option>
                    <option value="alls5">Set Status to 5</option>
                    <option value="alls98">Set Status to Ignored</option>
                    <option value="alls99">Set Status to Well Known</option>
                    <option value="allspl1">Increment Status (+1)</option>
                    <option value="allsmi1">Decrement Status (-1)</option>
                  </optgroup>
                  <optgroup label="Edits">
                    <option value="alllower">Set to Lowercase</option>
                    <option value="allcap">Capitalize</option>
                    <option value="alladdtag">Add Tag</option>
                    <option value="alldeltag">Remove Tag</option>
                  </optgroup>
                  <optgroup label="Danger Zone">
                    <option value="alldel">Delete ALL</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="field is-grouped is-grouped-multiline mt-3">
        <div class="control">
          <div class="buttons are-small">
            <button type="button" class="button is-light" onclick={() => markAll(true)}>
              <i data-lucide="check-check" class="icon" aria-label="Mark All" style="width:16px;height:16px"></i>
              <span class="ml-1">Mark All</span>
            </button>
            <button type="button" class="button is-light" onclick={() => markAll(false)}>
              <i data-lucide="x" class="icon" aria-label="Mark None" style="width:16px;height:16px"></i>
              <span class="ml-1">Mark None</span>
            </button>
            {#if markedCount > 0}
              <span class="tag is-warning ml-2">{markedCountLabel}</span>
            {/if}
          </div>
        </div>
        <div class="control">
          <div class="field has-addons">
            <div class="control"><span class="button is-static is-small">Marked Terms</span></div>
            <div class="control">
              <div class="select is-small">
                <select disabled={markedCount === 0} onchange={handleMultiAction}>
                  <option value="">[ Choose Action ]</option>
                  <optgroup label="Status Changes">
                    <option value="s1">Set Status to 1</option>
                    <option value="s2">Set Status to 2</option>
                    <option value="s3">Set Status to 3</option>
                    <option value="s4">Set Status to 4</option>
                    <option value="s5">Set Status to 5</option>
                    <option value="s98">Set Status to Ignored</option>
                    <option value="s99">Set Status to Well Known</option>
                    <option value="spl1">Increment Status (+1)</option>
                    <option value="smi1">Decrement Status (-1)</option>
                    <option value="today">Set Today's Date</option>
                  </optgroup>
                  <optgroup label="Edits">
                    <option value="lower">Set to Lowercase</option>
                    <option value="cap">Capitalize</option>
                    <option value="delsent">Clear Sentences</option>
                    <option value="addtag">Add Tag</option>
                    <option value="deltag">Remove Tag</option>
                  </optgroup>
                  <optgroup label="Export">
                    <option value="exp">Export (Anki)</option>
                    <option value="exptsv">Export (TSV)</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="review">Review Selection</option>
                  </optgroup>
                  <optgroup label="Danger Zone">
                    <option value="del">Delete Selected</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop Table View -->
    <div class="table-container is-hidden-mobile">
      <table class="table is-striped is-hoverable is-fullwidth">
        <thead>
          <tr>
            <th class="has-text-centered" style="width: 3em;">Mark</th>
            <th class="has-text-centered" style="width: 3em;">Act.</th>
            <th>Term</th>
            {#if columns.romanization}<th>Romanization</th>{/if}
            {#if columns.translation}<th>Translation</th>{/if}
            {#if columns.tags}<th>Tags</th>{/if}
            {#if columns.sentence}<th class="has-text-centered" style="width: 6em;">Sentence</th>{/if}
            {#if columns.status}<th class="has-text-centered" style="width: 5em;">Status</th>{/if}
            {#if columns.score}<th class="has-text-centered" style="width: 5em;">Score</th>{/if}
            {#if filters.sort === 7}<th class="has-text-centered" style="width: 7em;" title="Word Count in Active Texts">Word count</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each words as word (word.id)}
            <tr>
              <td class="has-text-centered">
                <input type="checkbox" class="markcheck" checked={marked.has(word.id)} onchange={(e) => toggleMark(word.id, e.currentTarget.checked)} />
              </td>
              <td class="has-text-centered" style="white-space: nowrap;">
                <div class="buttons are-small is-centered">
                  <a href={`/words/${word.id}/edit`} class="button is-small is-ghost" title="Edit">
                    <i data-lucide="file-pen-line" class="icon" title="Edit" aria-label="Edit" style="width:16px;height:16px"></i>
                  </a>
                </div>
              </td>
              <td>
                <span class={word.ttsClass} dir={word.rightToLeft ? 'rtl' : 'ltr'}><strong>{word.text}</strong></span>
              </td>

              {#if columns.romanization}
                <td>
                  {#if isEditing(word.id, 'romanization')}
                    <span class="inline-edit-container">
                      <!-- svelte-ignore a11y_autofocus -->
                      <textarea class="textarea is-small" rows="1" bind:value={editValue} autofocus
                        onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void saveEdit(); } }}></textarea>
                      <div class="buttons are-small mt-1">
                        <button type="button" class="button is-small is-success" onclick={saveEdit} disabled={editSaving} aria-label="Save" title="Save">
                          <i data-lucide="check" class="icon" aria-label="Save" style="width:16px;height:16px"></i>
                        </button>
                        <button type="button" class="button is-small" onclick={cancelEdit} aria-label="Cancel" title="Cancel">
                          <i data-lucide="x" class="icon" aria-label="Cancel" style="width:16px;height:16px"></i>
                        </button>
                      </div>
                    </span>
                  {:else}
                    <span class="clickedit" role="button" tabindex="0" onclick={() => startEdit(word, 'romanization')} onkeydown={(e) => e.key === 'Enter' && startEdit(word, 'romanization')}>{displayValue(word, 'romanization')}</span>
                  {/if}
                </td>
              {/if}

              {#if columns.translation}
                <td>
                  {#if isEditing(word.id, 'translation')}
                    <span class="inline-edit-container">
                      <!-- svelte-ignore a11y_autofocus -->
                      <textarea class="textarea is-small" rows="2" bind:value={editValue} autofocus
                        onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void saveEdit(); } }}></textarea>
                      <div class="buttons are-small mt-1">
                        <button type="button" class="button is-small is-success" onclick={saveEdit} disabled={editSaving} aria-label="Save" title="Save">
                          <i data-lucide="check" class="icon" aria-label="Save" style="width:16px;height:16px"></i>
                        </button>
                        <button type="button" class="button is-small" onclick={cancelEdit} aria-label="Cancel" title="Cancel">
                          <i data-lucide="x" class="icon" aria-label="Cancel" style="width:16px;height:16px"></i>
                        </button>
                      </div>
                    </span>
                  {:else}
                    <span class="clickedit" role="button" tabindex="0" onclick={() => startEdit(word, 'translation')} onkeydown={(e) => e.key === 'Enter' && startEdit(word, 'translation')}>{stripMarkdown(displayValue(word, 'translation'))}</span>
                  {/if}
                </td>
              {/if}

              {#if columns.tags}
                <td><span class="has-text-grey is-size-7">{word.tags}</span></td>
              {/if}

              {#if columns.sentence}
                <td class="has-text-centered">
                  {#if word.sentenceOk}
                    <span class="has-text-success" title={word.sentence}>
                      <i data-lucide="circle-check" class="icon" aria-label="Yes" style="width:16px;height:16px"></i>
                    </span>
                  {:else}
                    <span class="has-text-danger" title="No valid sentence">
                      <i data-lucide="circle-x" class="icon" aria-label="No" style="width:16px;height:16px"></i>
                    </span>
                  {/if}
                </td>
              {/if}

              {#if columns.status}
                <td class="has-text-centered" title={word.statusLabel}>
                  <span class="tag {statusClass(word.status)}">{statusDisplay(word)}</span>
                </td>
              {/if}

              {#if columns.score}
                <td class="has-text-centered" style="white-space: nowrap;">
                  <span class="tag is-light {statusClass(word.status)}">{formatScore(word.score)}</span>
                </td>
              {/if}

              {#if filters.sort === 7}
                <td class="has-text-centered">{word.textsWordCount || 0}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile Card View -->
    <div class="is-hidden-tablet">
      {#each words as word (word.id)}
        <div class="card mb-3">
          <div class="card-content">
            <div class="level is-mobile mb-2">
              <div class="level-left">
                <div class="level-item">
                  <label class="checkbox">
                    <input type="checkbox" class="markcheck" checked={marked.has(word.id)} onchange={(e) => toggleMark(word.id, e.currentTarget.checked)} />
                  </label>
                </div>
                <div class="level-item">
                  <span class={word.ttsClass} dir={word.rightToLeft ? 'rtl' : 'ltr'}><strong class="is-size-5">{word.text}</strong></span>
                </div>
              </div>
              <div class="level-right">
                <div class="level-item">
                  <div class="tags has-addons mb-0">
                    <span class="tag {statusClass(word.status)}">{word.statusAbbr}</span>
                    <span class="tag {statusClass(word.status)}">{formatScore(word.score)}</span>
                  </div>
                </div>
              </div>
            </div>

            {#if word.romanization && word.romanization !== '*'}
              <p class="has-text-grey is-size-7 mb-1">
                <span class="clickedit" role="button" tabindex="0" onclick={() => startEdit(word, 'romanization')} onkeydown={(e) => e.key === 'Enter' && startEdit(word, 'romanization')}>{word.romanization}</span>
              </p>
            {/if}

            <div class="mb-2">
              {#if isEditing(word.id, 'translation')}
                <span class="inline-edit-container">
                  <!-- svelte-ignore a11y_autofocus -->
                  <textarea class="textarea is-small" rows="2" bind:value={editValue} autofocus
                    onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void saveEdit(); } }}></textarea>
                  <div class="buttons are-small mt-1">
                    <button type="button" class="button is-small is-success" onclick={saveEdit} disabled={editSaving} aria-label="Save" title="Save">Save</button>
                    <button type="button" class="button is-small" onclick={cancelEdit} aria-label="Cancel" title="Cancel">Cancel</button>
                  </div>
                </span>
              {:else}
                <span class="clickedit" role="button" tabindex="0" onclick={() => startEdit(word, 'translation')} onkeydown={(e) => e.key === 'Enter' && startEdit(word, 'translation')}>{stripMarkdown(displayValue(word, 'translation'))}</span>
              {/if}
            </div>

            <div class="is-flex is-justify-content-space-between is-align-items-center">
              <div class="tags">
                {#if word.tags}<span class="tag is-light">{word.tags}</span>{/if}
                {#if columns.sentence && word.sentenceOk}
                  <span class="tag is-success is-light" title={word.sentence}>
                    <i data-lucide="message-square" class="icon" aria-label="Has sentence" style="width:16px;height:16px"></i>
                  </span>
                {/if}
              </div>
              <div class="buttons are-small">
                <a href={`/words/${word.id}/edit`} class="button is-small is-info is-light" aria-label="Edit" title="Edit">
                  <i data-lucide="file-pen-line" class="icon" aria-label="Edit" style="width:16px;height:16px"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if pagination.total_pages > 1}
      <nav class="level mt-4">
        <div class="level-left">
          <div class="level-item"><span class="tag is-info is-medium">{termCountLabel}</span></div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <div class="buttons">
              <button type="button" class="button is-small" disabled={isFirstPage} onclick={() => goToPage(1)} title="First page">
                <i data-lucide="chevrons-left" class="icon" aria-label="First" style="width:16px;height:16px"></i>
              </button>
              <button type="button" class="button is-small" disabled={isFirstPage} onclick={() => goToPage(pagination.page - 1)} title="Previous page">
                <i data-lucide="chevron-left" class="icon" aria-label="Previous" style="width:16px;height:16px"></i>
              </button>
              <span class="button is-static is-small">{paginationText}</span>
              <button type="button" class="button is-small" disabled={isLastPage} onclick={() => goToPage(pagination.page + 1)} title="Next page">
                <i data-lucide="chevron-right" class="icon" aria-label="Next" style="width:16px;height:16px"></i>
              </button>
              <button type="button" class="button is-small" disabled={isLastPage} onclick={() => goToPage(pagination.total_pages)} title="Last page">
                <i data-lucide="chevrons-right" class="icon" aria-label="Last" style="width:16px;height:16px"></i>
              </button>
            </div>
          </div>
        </div>
      </nav>
    {/if}
  {/if}
{/if}

<style>
  .clickedit {
    cursor: pointer;
    border-bottom: 1px dotted #ccc;
  }
  .clickedit:hover {
    background-color: var(--bulma-scheme-main-bis, #f5f5f5);
  }
  .inline-edit-container {
    display: inline-block;
    min-width: 150px;
  }
  .inline-edit-container .textarea {
    min-height: 2em;
  }
</style>
