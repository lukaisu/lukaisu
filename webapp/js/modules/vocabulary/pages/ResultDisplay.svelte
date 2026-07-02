<!--
  Import Result Display — Svelte 5 port of the retired `upload_result.php` view
  (the Alpine `wordUploadResultApp` component).

  Renders the outcome of a manual `POST /word/upload`: a success/warning banner
  with the imported-term count, then a paginated table of the imported terms
  (term / romanization, translation, tags, valid-sentence flag, status). The
  parent (`WordUpload.svelte`) hands us the `{lastUpdate, rtl, recno}` the POST
  returned; we page the terms client-side from `GET /api/v1/terms/imported`
  (100/page), exactly as the Alpine component did. RTL languages get `dir="rtl"`
  on the term text. `onReset` lets the parent swap back to the upload form.

  Behaviour is a faithful port of the Alpine component — same endpoint, same
  pagination, same row layout; only the rendering is Svelte (native markup
  instead of `innerHTML` strings). Lucide icons in the client-rendered table are
  re-hydrated from an `$effect` keyed on the loaded terms + load state.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { apiGet } from '@shared/api/client';
  import { statuses } from '@shared/stores/app_data';

  /** One imported-term row, as returned by `GET /api/v1/terms/imported`. */
  interface ImportedTerm {
    id: number;
    text: string;
    translation: string;
    romanization: string;
    sentence: string;
    status: number;
    SentOK: number;
    taglist: string;
  }

  interface ImportedTermsResponse {
    navigation: { current_page: number; total_pages: number };
    terms: ImportedTerm[];
  }

  const {
    lastUpdate,
    rtl = false,
    recno,
    onReset
  }: {
    lastUpdate: string;
    rtl?: boolean;
    recno: number;
    onReset?: () => void;
  } = $props();

  let currentPage = $state(1);
  let totalPages = $state(1);
  let terms = $state<ImportedTerm[]>([]);
  let isLoading = $state(false);
  // Starts optimistic (recno > 0); a failed fetch flips it off, mirroring the
  // Alpine component's `hasTerms` flag. `recno` is a per-mount prop (the parent
  // remounts on each import), so the initial read is untracked.
  let hasTerms = $state(untrack(() => recno > 0));

  const importedLabel = $derived(
    recno === 1
      ? t('vocabulary.upload.terms_imported_one')
      : t('vocabulary.upload.terms_imported_other')
  );

  function statusInfo(status: number): { name: string; abbr: string } {
    return statuses[status] ?? { name: 'Unknown', abbr: '?' };
  }

  function tagsOf(taglist: string): string[] {
    return taglist
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  }

  async function loadPage(page: number): Promise<void> {
    if (recno === 0) {
      hasTerms = false;
      return;
    }

    isLoading = true;
    const response = await apiGet<ImportedTermsResponse>('/terms/imported', {
      last_update: lastUpdate,
      count: recno,
      page
    });

    if (response.data) {
      currentPage = response.data.navigation.current_page;
      totalPages = response.data.navigation.total_pages;
      terms = response.data.terms;
      hasTerms = true;
    } else {
      hasTerms = false;
    }
    isLoading = false;
  }

  function goToPage(page: number): void {
    if (page >= 1 && page <= totalPages) {
      void loadPage(page);
    }
  }

  function onPageSelect(event: Event): void {
    goToPage(Number((event.target as HTMLSelectElement).value));
  }

  onMount(() => {
    if (recno > 0) {
      void loadPage(1);
    }
  });

  // Re-hydrate lucide icons after the table (re)renders.
  $effect(() => {
    void terms;
    void isLoading;
    void hasTerms;
    void tick().then(() => initIcons());
  });
</script>

<!-- Import result feedback banner -->
{#if recno > 0}
  <article class="message is-success mb-4">
    <div class="message-body">
      <span class="icon-text">
        <span class="icon"><i data-lucide="check"></i></span>
        <span>
          <strong>{t('vocabulary.upload.import_successful')}</strong>
          {recno}
          {importedLabel}
        </span>
      </span>
    </div>
  </article>
{:else}
  <article class="message is-warning mb-4">
    <div class="message-body">
      <span class="icon-text">
        <span class="icon"><i data-lucide="alert-triangle"></i></span>
        <span>
          <strong>{t('vocabulary.upload.no_terms_warning')}</strong>
          {t('vocabulary.upload.no_terms_reason')}
        </span>
      </span>
    </div>
  </article>
{/if}

<div class="box">
  {#if !hasTerms && !isLoading}
    <p class="has-text-centered has-text-grey py-4">
      {t('vocabulary.upload.no_terms_imported')}
    </p>
  {:else if isLoading}
    <div class="has-text-centered py-4">
      <span class="icon"><i data-lucide="loader-2" class="animate-spin"></i></span>
      <span>{t('vocabulary.common.loading')}</span>
    </div>
  {:else}
    <!-- Pagination -->
    <nav class="level mb-4">
      <div class="level-left">
        <div class="level-item">
          <span class="tag is-medium is-info is-light">
            {recno}&nbsp;{recno === 1 ? t('vocabulary.common.term') : t('vocabulary.common.terms')}
          </span>
        </div>
      </div>
      <div class="level-right">
        <div class="level-item">
          <nav class="pagination is-small" aria-label="pagination">
            {#if currentPage > 1}
              <span class="pagination-previous">
                <span
                  class="icon is-clickable"
                  title={t('vocabulary.list.first_page')}
                  onclick={() => goToPage(1)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && goToPage(1)}
                >
                  <i data-lucide="chevrons-left"></i>
                </span>
                <span
                  class="icon is-clickable"
                  title={t('vocabulary.list.previous_page')}
                  onclick={() => goToPage(currentPage - 1)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && goToPage(currentPage - 1)}
                >
                  <i data-lucide="chevron-left"></i>
                </span>
              </span>
            {/if}
            <span class="pagination-list">
              <span class="mr-2">{t('vocabulary.upload.results.page')}</span>
              {#if totalPages <= 1}
                <span>1</span>
              {:else}
                <div class="select is-small">
                  <select value={currentPage} onchange={onPageSelect}>
                    {#each Array.from({ length: totalPages }, (_, i) => i + 1) as p (p)}
                      <option value={p}>{p}</option>
                    {/each}
                  </select>
                </div>
              {/if}
              <span class="ml-1 mr-1">{t('vocabulary.upload.results.of')}</span>
              <span>{totalPages}</span>
            </span>
            {#if currentPage < totalPages}
              <span class="pagination-next">
                <span
                  class="icon is-clickable"
                  title={t('vocabulary.list.next_page')}
                  onclick={() => goToPage(currentPage + 1)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && goToPage(currentPage + 1)}
                >
                  <i data-lucide="chevron-right"></i>
                </span>
                <span
                  class="icon is-clickable"
                  title={t('vocabulary.list.last_page')}
                  onclick={() => goToPage(totalPages)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && goToPage(totalPages)}
                >
                  <i data-lucide="chevrons-right"></i>
                </span>
              </span>
            {/if}
          </nav>
        </div>
      </div>
    </nav>

    <!-- Results table -->
    <div class="table-container">
      <table class="table is-striped is-hoverable is-fullwidth">
        <thead>
          <tr>
            <th>{t('vocabulary.upload.results.term_romanization')}</th>
            <th>{t('vocabulary.upload.results.translation')}</th>
            <th>{t('vocabulary.upload.results.tags')}</th>
            <th class="has-text-centered" title={t('vocabulary.common.sentence')}>
              {t('vocabulary.upload.results.sentence_short')}
            </th>
            <th class="has-text-centered">{t('vocabulary.upload.results.status')}</th>
          </tr>
        </thead>
        <tbody>
          {#each terms as term (term.id)}
            <tr>
              <td>
                {#if rtl}
                  <span dir="rtl">{term.text}</span>
                {:else}
                  <span>{term.text}</span>
                {/if}
                <span class="has-text-grey"> / </span>
                <span class="has-text-grey-dark">{term.romanization !== '' ? term.romanization : '*'}</span>
              </td>
              <td><span>{term.translation}</span></td>
              <td>
                <span class="tags">
                  {#each tagsOf(term.taglist) as tag (tag)}
                    <span class="tag is-info is-light is-small">{tag}</span>
                  {/each}
                </span>
              </td>
              <td class="has-text-centered">
                {#if term.SentOK !== 0}
                  <span class="icon has-text-success" title={term.sentence}>
                    <i data-lucide="check"></i>
                  </span>
                {:else}
                  <span class="icon has-text-danger" title={t('vocabulary.list.no_valid_sentence')}>
                    <i data-lucide="x"></i>
                  </span>
                {/if}
              </td>
              <td class="has-text-centered" title={statusInfo(term.status).name}>
                <span class="tag is-light">{statusInfo(term.status).abbr}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Import-more / navigation actions -->
<div class="field is-grouped mt-4">
  {#if onReset}
    <div class="control">
      <button type="button" class="button is-primary" onclick={() => onReset?.()}>
        <span class="icon is-small"><i data-lucide="file-up"></i></span>
        <span>{t('vocabulary.actions.import_more_terms')}</span>
      </button>
    </div>
  {/if}
  <div class="control">
    <a class="button" href="/words">
      <span class="icon is-small"><i data-lucide="list"></i></span>
      <span>{t('vocabulary.actions.my_terms')}</span>
    </a>
  </div>
</div>
