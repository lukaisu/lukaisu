<!--
  Starter Vocabulary — Svelte 5 port of the Alpine `starterVocab` component
  (the retired `starter_vocab.php` view's `x-data="starterVocab"` region).

  Drives the post-language-creation import flow:
  choose sources -> import frequency words -> enrich -> import curated dicts -> done.

  Server-gated (Job-B-style): the frequency-word import, Wiktionary enrichment,
  and curated-dictionary import are all `/api/v1` endpoints (bearer-token authed);
  none run offline, so the page only mounts this island when a server is connected
  (the gate lives in `app/starter-vocab.ts`, mirroring feeds.ts). The server-only
  bootstrap data (language name, FrequencyWords availability, curated dictionaries)
  is fetched once by the entry and passed in as `config`.

  Behaviour is a faithful port of the Alpine component — same endpoints, same
  request shapes, same step machine; only the rendering is Svelte. Lucide icons in
  the client-rendered markup are re-hydrated from a `$effect` keyed on the step.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { apiPost, apiPostForm } from '@shared/api/client';
  import type {
    CuratedDictSource,
    StarterVocabConfig
  } from '@modules/vocabulary/api/starter_vocab_api';

  interface ImportResult {
    imported: number;
    skipped: number;
    total: number;
  }

  interface EnrichStats {
    done: number;
    failed: number;
    total: number;
  }

  /** The frequency-enrichment batch response from the starter-vocab endpoint. */
  interface EnrichResponse {
    enriched: number;
    failed: number;
    remaining: number;
    total: number;
    warning: string;
  }

  interface CuratedImportResponse {
    success: boolean;
    dictId?: number;
    imported?: number;
    error?: string;
  }

  interface DictMessage {
    success: boolean;
    text: string;
  }

  const { config }: { config: StarterVocabConfig } = $props();

  // Server-relative links for the "done" step — the bundle's link router
  // (installLinkRouter, booted by app/starter-vocab.ts) rewrites these. `config`
  // is a static mount-time prop, but these are `$derived` to keep svelte-check
  // happy about reading a prop at the top level.
  const skipUrl = $derived(`/texts/new?filterlang=${config.langId}`);
  const vocabUrl = $derived(`/words?filterlang=${config.langId}`);

  // Escape the (server-provided) language name before interpolating it into the
  // `{@html}` intro/unavailable strings, which carry `<strong>{lang}</strong>`.
  function esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const langNameEsc = $derived(esc(config.langName));

  let step = $state<'choose' | 'importing' | 'enriching' | 'dictImporting' | 'done' | 'error'>(
    'choose'
  );
  let size = $state(100);
  let mode = $state<'translation' | 'definition'>('translation');
  // Defaults to the FrequencyWords availability, then user-toggleable. Kept as an
  // override over a `$derived` so the prop read stays inside a derived.
  let wiktionaryOverride = $state<boolean | null>(null);
  const useWiktionary = $derived(wiktionaryOverride ?? config.isAvailable);
  let wiktResult = $state<ImportResult>({ imported: 0, skipped: 0, total: 0 });
  let enrichStats = $state<EnrichStats>({ done: 0, failed: 0, total: 0 });
  let enrichWarning = $state('');
  let enrichProgress = $state(0);
  let errorMessage = $state('');
  // Plain flag (not UI-bound): set by the Stop button, read by the enrich loop.
  let stopEnrichmentFlag = false;

  // Curated dictionary state.
  const dictSources = $derived<CuratedDictSource[]>(
    config.curatedDictionaries.flatMap((g) => g.sources)
  );
  let selectedDictUrls = $state<string[]>([]);
  let dictMessages = $state<DictMessage[]>([]);
  let dictBatchCurrent = $state(0);
  let dictBatchTotal = $state(0);

  const canImport = $derived(useWiktionary || selectedDictUrls.length > 0);

  function sizeClass(value: number): string {
    return size === value ? 'button is-primary is-selected' : 'button';
  }

  function setSize(value: number): void {
    size = value;
  }

  function toggleWiktionary(): void {
    wiktionaryOverride = !useWiktionary;
  }

  // These short status strings were hardcoded English in the Alpine component
  // (they were never `__e()` i18n keys), so the port keeps them verbatim.
  function enrichingLabel(): string {
    return mode === 'translation' ? 'Fetching translations...' : 'Fetching definitions...';
  }

  function enrichedModeLabel(): string {
    return mode === 'translation' ? 'translations' : 'definitions';
  }

  function isSourceSelected(url: string): boolean {
    return selectedDictUrls.includes(url);
  }

  function toggleSource(url: string): void {
    selectedDictUrls = selectedDictUrls.includes(url)
      ? selectedDictUrls.filter((u) => u !== url)
      : [...selectedDictUrls, url];
  }

  function dictTypeLabel(source: CuratedDictSource): string {
    if (source.dictType === 'definition') {
      return 'Definitions';
    }
    if (source.dictType === 'translation' && source.targetLanguage) {
      return source.targetLanguage;
    }
    return 'Translation';
  }

  function stopEnrichment(): void {
    stopEnrichmentFlag = true;
  }

  function retryImport(): void {
    step = 'choose';
  }

  async function startImport(): Promise<void> {
    try {
      // Phase 1: Wiktionary frequency words.
      if (useWiktionary) {
        step = 'importing';

        const response = await apiPostForm<ImportResult>(
          `/languages/${config.langId}/starter-vocab/import`,
          { count: size }
        );

        if (response.error || !response.data) {
          errorMessage = response.error || 'Unknown error occurred.';
          step = 'error';
          return;
        }

        wiktResult = response.data;

        if (response.data.imported > 0) {
          enrichStats = { done: 0, failed: 0, total: response.data.imported };
          stopEnrichmentFlag = false;
          step = 'enriching';
          await enrichAll();
        }
      }

      // Phase 2: Curated dictionaries.
      if (selectedDictUrls.length > 0) {
        await importDictBatch();
      }

      step = 'done';
    } catch {
      errorMessage = 'Network error. Please check your connection.';
      step = 'error';
    }
  }

  async function enrichAll(): Promise<void> {
    while (!stopEnrichmentFlag) {
      const response = await apiPostForm<EnrichResponse>(
        `/languages/${config.langId}/starter-vocab/enrich`,
        { mode }
      );

      if (response.error || !response.data) {
        enrichWarning = response.error || 'Enrichment encountered an error.';
        return;
      }

      const data = response.data;
      enrichStats.done = data.total - data.remaining;
      enrichStats.total = data.total;
      enrichStats.failed += data.failed;
      enrichProgress =
        data.total > 0 ? Math.round(((data.total - data.remaining) / data.total) * 100) : 100;

      if (data.warning) {
        enrichWarning = data.warning;
      }

      if (data.remaining <= 0) {
        return;
      }
    }
  }

  async function importDictBatch(): Promise<void> {
    const sources = dictSources.filter((s) => selectedDictUrls.includes(s.url));
    if (sources.length === 0) return;

    step = 'dictImporting';
    dictBatchTotal = sources.length;
    dictBatchCurrent = 0;
    dictMessages = [];

    for (const source of sources) {
      dictBatchCurrent++;
      const response = await apiPost<CuratedImportResponse>('/local-dictionaries/import-curated', {
        language_id: config.langId,
        url: source.url,
        format: source.format,
        name: source.name
      });

      const result = response.data ?? {
        success: false,
        error: response.error || 'Unknown error'
      };

      if (result.success) {
        dictMessages = [
          ...dictMessages,
          {
            success: true,
            text: `${source.name}: imported ${result.imported ?? 0} entries.`
          }
        ];
      } else {
        dictMessages = [
          ...dictMessages,
          {
            success: false,
            text: `${source.name}: ${result.error ?? 'Import failed.'}`
          }
        ];
      }
    }

    selectedDictUrls = [];
  }

  // Re-hydrate lucide icons after a step change swaps the rendered `<i data-lucide>`
  // nodes in/out (the role the Alpine `lukaisu:contentLoaded` dispatch played).
  $effect(() => {
    void step;
    void tick().then(() => initIcons());
  });
</script>

<div class="container" style="max-width: 640px;">
  <h2 class="title is-4 mb-4">{t('vocabulary.starter.title')}</h2>

  {#if !config.isAvailable && dictSources.length === 0}
    <div class="notification is-warning">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML; lang is escaped -->
      {@html t('vocabulary.starter.not_available_html', { lang: langNameEsc })}
    </div>
    <a class="button is-primary" href={skipUrl}>
      {t('vocabulary.starter.continue_to_text')}
    </a>
  {:else if step === 'choose'}
    <!-- Step 1: Choose sources and options -->
    <div class="box">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML; lang is escaped -->
      <p class="mb-4">{@html t('vocabulary.starter.intro_html', { lang: langNameEsc })}</p>

      <div class="field">
        <p class="label">{t('vocabulary.starter.enrichment_mode')}</p>
        <div class="control">
          <label class="radio">
            <input type="radio" bind:group={mode} value="translation" />
            {t('vocabulary.starter.translation')}
            <span class="has-text-grey is-size-7">{t('vocabulary.starter.translation_hint')}</span>
          </label>
        </div>
        <div class="control mt-1">
          <label class="radio">
            <input type="radio" bind:group={mode} value="definition" />
            {t('vocabulary.starter.definition')}
            <span class="has-text-grey is-size-7">{t('vocabulary.starter.definition_hint')}</span>
          </label>
        </div>
      </div>

      <hr />
      <p class="label">{t('vocabulary.starter.sources')}</p>

      {#if config.isAvailable}
        <!-- Wiktionary frequency words source -->
        <label
          class="box mb-3 p-4"
          style="cursor: pointer;"
          class:has-background-success-light={useWiktionary}
        >
          <div class="is-flex is-align-items-center">
            <input type="checkbox" class="mr-3" checked={useWiktionary} onchange={toggleWiktionary} />
            <div class="is-flex-grow-1">
              <p class="has-text-weight-semibold mb-1">{t('vocabulary.starter.most_common')}</p>
              <p class="is-size-7 has-text-grey mb-2">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML (static anchors) -->
                {@html t('vocabulary.starter.most_common_help_html')}
              </p>
              {#if useWiktionary}
                <div class="field">
                  <p class="label is-small">{t('vocabulary.starter.how_many')}</p>
                  <div class="buttons has-addons are-small">
                    <button class={sizeClass(50)} onclick={() => setSize(50)}>50</button>
                    <button class={sizeClass(100)} onclick={() => setSize(100)}>100</button>
                    <button class={sizeClass(500)} onclick={() => setSize(500)}>500</button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </label>
      {/if}

      <!-- Curated dictionaries -->
      {#each dictSources as source (source.name)}
        <label
          class="box mb-3 p-4"
          style="cursor: pointer;"
          class:has-background-success-light={isSourceSelected(source.url)}
        >
          <div class="is-flex is-align-items-center">
            <input
              type="checkbox"
              class="mr-3"
              checked={isSourceSelected(source.url)}
              disabled={!source.directDownload}
              onchange={() => toggleSource(source.url)}
            />
            <div class="is-flex-grow-1">
              <p class="has-text-weight-semibold mb-1">{source.name}</p>
              <div class="tags mb-1">
                <span class="tag is-light">{source.entries}</span>
                <span class="tag is-info is-light">{source.format}</span>
                <span class="tag is-success is-light">{source.license}</span>
                <span class="tag is-primary is-light">{dictTypeLabel(source)}</span>
              </div>
              <p class="is-size-7 has-text-grey">{source.notes}</p>
              {#if !source.directDownload}
                <p class="is-size-7 has-text-warning-dark">
                  {t('vocabulary.starter.manual_download')}
                  <a href={source.url} target="_blank" rel="noopener">
                    {t('vocabulary.starter.visit_site')}
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

      <div class="field is-grouped mt-5">
        <div class="control">
          <button class="button is-success" disabled={!canImport} onclick={startImport}>
            <span class="icon is-small"
              ><i data-lucide="download" style="width:14px;height:14px"></i></span
            >
            <span class="ml-1">{t('vocabulary.starter.import')}</span>
          </button>
        </div>
        <div class="control">
          <a class="button" href={skipUrl}>{t('vocabulary.starter.skip')}</a>
        </div>
      </div>
    </div>
  {:else if step === 'importing'}
    <!-- Step 2: Importing frequency words -->
    <div class="box">
      <p class="mb-3"><strong>{t('vocabulary.starter.fetching')}</strong></p>
      <progress class="progress is-info" max="100"></progress>
      <p class="has-text-grey is-size-7">{t('vocabulary.starter.fetching_help')}</p>
    </div>
  {:else if step === 'enriching'}
    <!-- Step 3: Enriching with translations/definitions -->
    <div class="box">
      <p class="mb-3"><strong>{enrichingLabel()}</strong></p>
      <progress class="progress is-success" value={enrichProgress} max="100"></progress>
      <p class="is-size-7 mb-3">
        {enrichStats.done}
        {t('vocabulary.starter.of')}
        {enrichStats.total}
        {t('vocabulary.starter.words_enriched')}
        {#if enrichStats.failed > 0}
          <span class="has-text-grey"
            >({enrichStats.failed} {t('vocabulary.starter.not_found')})</span
          >
        {/if}
      </p>

      {#if enrichWarning}
        <div class="notification is-warning is-light is-size-7 p-3 mb-3">{enrichWarning}</div>
      {/if}

      <div class="field is-grouped">
        <div class="control">
          <button class="button is-warning is-small" onclick={stopEnrichment}>
            {t('vocabulary.starter.stop_continue')}
          </button>
        </div>
      </div>
    </div>
  {:else if step === 'dictImporting'}
    <!-- Step 4: Importing curated dictionaries -->
    <div class="box">
      <p class="mb-3"><strong>{t('vocabulary.starter.importing_dicts')}</strong></p>
      <progress class="progress is-info" value={dictBatchCurrent} max={dictBatchTotal}></progress>
      <p class="is-size-7 has-text-grey">
        {t('vocabulary.starter.dictionary')}
        {dictBatchCurrent}
        {t('vocabulary.starter.of')}
        {dictBatchTotal}
      </p>
    </div>
  {:else if step === 'done'}
    <!-- Step 5: Done -->
    <div class="box">
      <div class="notification is-success is-light">
        {#if wiktResult.imported > 0 || wiktResult.skipped > 0}
          <p>
            {t('vocabulary.starter.imported')}
            <strong>{wiktResult.imported}</strong>
            {t('vocabulary.starter.words')}
            {#if wiktResult.skipped > 0}
              <span>({wiktResult.skipped} {t('vocabulary.starter.already_existed')})</span>
            {/if}
            {t('vocabulary.starter.for_lang')} <strong>{config.langName}</strong>.
          </p>
        {/if}
        {#if enrichStats.done > 0}
          <p class="mt-1">
            {enrichStats.done}
            {t('vocabulary.starter.enriched_with')}
            {enrichedModeLabel()}.
          </p>
        {/if}
        {#each dictMessages as msg, i (i)}
          <p class="mt-1" class:has-text-danger={!msg.success}>{msg.text}</p>
        {/each}
      </div>

      <div class="field is-grouped">
        <div class="control">
          <a class="button is-primary" href={skipUrl}>
            {t('vocabulary.starter.continue_to_text')}
          </a>
        </div>
        <div class="control">
          <a class="button" href={vocabUrl}>{t('vocabulary.starter.view_vocabulary')}</a>
        </div>
      </div>
    </div>
  {:else if step === 'error'}
    <!-- Error state -->
    <div class="box">
      <div class="notification is-danger is-light">
        <strong>{t('vocabulary.starter.import_failed')}</strong>
        <span>{errorMessage}</span>
      </div>
      <div class="field is-grouped">
        <div class="control">
          <button class="button" onclick={retryImport}>{t('vocabulary.starter.try_again')}</button>
        </div>
        <div class="control">
          <a class="button" href={skipUrl}>{t('vocabulary.starter.skip')}</a>
        </div>
      </div>
    </div>
  {/if}
</div>
