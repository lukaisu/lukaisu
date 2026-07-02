<!--
  Curated Dictionary Browser — Svelte 5 port of the Alpine `curatedDictBrowser`
  component (the word-upload "Dictionaries" tab in `upload_form.php`).

  Reusable island: it lists the curated reference dictionaries (grouped by
  language, with a language filter + free-text search), lets the user pick one or
  more direct-download sources, and batch-imports them into the current language
  via `POST /api/v1/local-dictionaries/import-curated` (the same endpoint the
  StarterVocab island uses). It owns no server-only data — the caller passes the
  curated registry + the target language as props — so the word-upload island
  (D3a) and the dictionary-import screen (D3c) can both mount it.

  Behaviour is a faithful port of the Alpine component: same filter/search,
  same selection + batch loop, same endpoint and request shape; only the
  rendering is Svelte. Lucide icons in the client-rendered markup are re-hydrated
  from an `$effect` keyed on the filtered groups.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { apiPost } from '@shared/api/client';
  import type {
    CuratedDictGroup,
    CuratedDictSource
  } from '@modules/vocabulary/api/word_upload_api';

  interface CuratedImportResponse {
    success: boolean;
    dictId?: number;
    imported?: number;
    vocabCreated?: number;
    error?: string;
  }

  interface BatchMessage {
    success: boolean;
    text: string;
  }

  const {
    groups,
    languageId,
    languageName = ''
  }: {
    groups: CuratedDictGroup[];
    languageId: number;
    languageName?: string;
  } = $props();

  /**
   * Find the curated group matching a user language name. Handles
   * "Chinese (Simplified)" matching "Chinese", or an exact "French" match.
   * Mirrors `findGroupByLanguageName` in the Alpine component.
   */
  function findGroupByLanguageName(name: string): CuratedDictGroup | undefined {
    const lower = name.toLowerCase();
    if (!lower) {
      return undefined;
    }
    const exact = groups.find((g) => g.languageName.toLowerCase() === lower);
    if (exact) {
      return exact;
    }
    const prefix = groups.find((g) => lower.startsWith(g.languageName.toLowerCase()));
    if (prefix) {
      return prefix;
    }
    return groups.find((g) => g.languageName.toLowerCase().startsWith(lower));
  }

  // Preselect the language filter from the current language, like the Alpine
  // `init()` did (it then kept syncing via $watch; here the prop is static, so
  // we read it once via untrack for the initial value only).
  let dictLanguageFilter = $state(
    untrack(() => findGroupByLanguageName(languageName)?.language ?? '')
  );
  let dictSearch = $state('');

  let selectedUrls = $state<string[]>([]);
  let batchImporting = $state(false);
  let batchCurrent = $state(0);
  let batchTotal = $state(0);
  let batchMessages = $state<BatchMessage[]>([]);

  const filteredGroups = $derived.by<CuratedDictGroup[]>(() => {
    let result = groups;
    if (dictLanguageFilter) {
      result = result.filter((g) => g.language === dictLanguageFilter);
    }
    const search = dictSearch.toLowerCase().trim();
    if (search) {
      result = result
        .map((g) => ({
          ...g,
          sources: g.sources.filter(
            (s) =>
              s.name.toLowerCase().includes(search) ||
              s.format.toLowerCase().includes(search) ||
              s.notes.toLowerCase().includes(search)
          )
        }))
        .filter((g) => g.sources.length > 0);
    }
    return result;
  });

  const selectedCount = $derived(selectedUrls.length);

  function isSelected(url: string): boolean {
    return selectedUrls.includes(url);
  }

  function toggleSelection(url: string): void {
    selectedUrls = selectedUrls.includes(url)
      ? selectedUrls.filter((u) => u !== url)
      : [...selectedUrls, url];
  }

  function dismissMessage(index: number): void {
    batchMessages = batchMessages.filter((_, i) => i !== index);
  }

  async function importSelected(): Promise<void> {
    if (!languageId) {
      batchMessages = [{ success: false, text: t('vocabulary.upload.select_language_first') }];
      return;
    }

    // Collect the selected sources, in registry order.
    const sources: CuratedDictSource[] = [];
    for (const group of groups) {
      for (const source of group.sources) {
        if (selectedUrls.includes(source.url)) {
          sources.push(source);
        }
      }
    }
    if (sources.length === 0) {
      return;
    }

    batchImporting = true;
    batchTotal = sources.length;
    batchCurrent = 0;
    batchMessages = [];

    for (const source of sources) {
      batchCurrent++;
      const response = await apiPost<CuratedImportResponse>('/local-dictionaries/import-curated', {
        language_id: languageId,
        url: source.url,
        format: source.format,
        name: source.name
      });

      const result = response.data ?? {
        success: false,
        error: response.error || 'Unknown error'
      };

      if (result.success) {
        const vocab = result.vocabCreated
          ? ` and ${result.vocabCreated} vocabulary terms`
          : '';
        batchMessages = [
          ...batchMessages,
          { success: true, text: `${source.name}: imported ${result.imported ?? 0} entries${vocab}.` }
        ];
      } else {
        batchMessages = [
          ...batchMessages,
          { success: false, text: `${source.name}: ${result.error ?? 'Import failed.'}` }
        ];
      }
    }

    batchImporting = false;
    selectedUrls = [];
  }

  function dictTypeTag(source: CuratedDictSource): string {
    return `${source.targetLanguage} ${t('vocabulary.upload.dict.translations_suffix')}`;
  }

  // Re-hydrate lucide icons after the filtered list re-renders (the role the
  // Alpine `lukaisu:contentLoaded` dispatch played).
  $effect(() => {
    void filteredGroups;
    void tick().then(() => initIcons());
  });
</script>

<div class="notification is-info is-light mb-4">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML (static markup) -->
  {@html t('vocabulary.upload.dict.intro_html')}
</div>

<!-- Batch import results -->
{#each batchMessages as msg, i (i)}
  <div class="notification mb-3" class:is-success={msg.success} class:is-danger={!msg.success} class:is-light={true}>
    <button class="delete" aria-label="close" onclick={() => dismissMessage(i)}></button>
    <span>{msg.text}</span>
  </div>
{/each}

<!-- Batch import progress -->
{#if batchImporting}
  <div class="notification is-info is-light mb-4">
    <p class="mb-2">
      <strong>{t('vocabulary.upload.dict.importing')}</strong>
      {batchCurrent}
      {t('vocabulary.upload.freq.words_enriched_of')}
      {batchTotal}
    </p>
    <progress class="progress is-info is-small" value={batchCurrent} max={batchTotal}></progress>
  </div>
{/if}

<!-- Language filter + search -->
<div class="field is-grouped mb-4">
  <div class="control">
    <div class="select">
      <select bind:value={dictLanguageFilter}>
        <option value="">{t('vocabulary.upload.dict.all_languages')}</option>
        {#each groups as group (group.language)}
          <option value={group.language}>{group.languageName}</option>
        {/each}
      </select>
    </div>
  </div>
  <div class="control is-expanded">
    <input
      class="input"
      type="search"
      placeholder={t('vocabulary.upload.dict.search_placeholder')}
      bind:value={dictSearch}
    />
  </div>
</div>

<!-- Dictionary list grouped by language -->
{#if filteredGroups.length === 0}
  <div class="notification is-light">{t('vocabulary.upload.dict.no_match')}</div>
{/if}

{#each filteredGroups as group (group.language)}
  <div class="mb-5">
    <h3 class="title is-5 mb-3">{group.languageName}</h3>
    {#each group.sources as source (source.name)}
      <label
        class="box mb-3 p-4"
        style="cursor: pointer;"
        class:has-background-success-light={isSelected(source.url)}
      >
        <div class="is-flex is-align-items-center">
          <input
            type="checkbox"
            class="mr-3"
            checked={isSelected(source.url)}
            disabled={!source.directDownload || batchImporting}
            onchange={() => toggleSelection(source.url)}
          />
          <div class="is-flex-grow-1">
            <p class="has-text-weight-semibold mb-1">{source.name}</p>
            <div class="tags mb-1">
              <span class="tag is-info is-light">{source.format}</span>
              <span class="tag is-light">{source.entries}</span>
              <span class="tag is-success is-light">{source.license}</span>
              {#if source.targetLanguage}
                <span class="tag is-warning is-light">{dictTypeTag(source)}</span>
              {/if}
            </div>
            <p class="is-size-7 has-text-grey">{source.notes}</p>
            {#if !source.directDownload}
              <p class="is-size-7 has-text-warning-dark">
                {t('vocabulary.upload.dict.manual_download')}
                <a href={source.url} target="_blank" rel="noopener">
                  {t('vocabulary.upload.dict.visit_site')}
                  <span class="icon is-small"
                    ><i data-lucide="external-link" style="width:14px;height:14px"></i></span
                  >
                </a>
              </p>
            {/if}
          </div>
        </div>
      </label>
    {/each}
  </div>
{/each}

<!-- Import button -->
<div class="field is-grouped mt-4">
  <div class="control">
    <button
      type="button"
      class="button is-success"
      disabled={selectedCount === 0 || batchImporting}
      onclick={importSelected}
    >
      <span class="icon is-small"><i data-lucide="download"></i></span>
      <span>{t('vocabulary.upload.dict.import_selected')}</span>
    </button>
  </div>
</div>
