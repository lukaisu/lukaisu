<!--
  Word Upload — Svelte 5 port of the Alpine word-upload screen (the retired
  `upload_form.php` view's `wordUploadPageApp` + `wordUploadFormApp` +
  `curatedDictBrowser` components).

  Three tabs:
   1. Frequency Words — import the most common words for the current language
      from frequency lists, with optional Wiktionary enrichment. Driven entirely
      client-side: an /api/v1 form-POST to the shared starter-vocab frequency
      import endpoint, then a polled enrichment loop (the same bearer-authed
      endpoints the StarterVocab island uses).
   2. Dictionaries — the reusable `CuratedDictBrowser` island (curated reference
      dictionaries, batch-imported via `/api/v1/local-dictionaries/import-curated`).
   3. Manual Upload — a multipart `<form>` that `fetch()`-POSTs a CSV/TSV/pasted
      term list, or a dictionary file, to the kept `/word/upload` endpoint
      (`config.uploadUrl`). The POST now returns JSON ({lastUpdate, rtl, recno})
      instead of a server-rendered page; on success we render the imported-terms
      table in-place with `ResultDisplay` (the Svelte port of `upload_result.php`)
      — the island owns both the form and its result.

  Server-gated (Job-B-style): every operation needs a connected server, so the
  page only mounts this island when one is connected (the gate lives in
  `app/word-upload.ts`, mirroring feeds.ts / starter-vocab.ts). The server-only
  bootstrap data (current language, FrequencyWords availability, curated
  dictionaries, base-path-correct endpoints) is fetched once by the entry and
  passed in as `config`.

  Behaviour is a faithful port of the Alpine components — same endpoints, same
  request shapes, same step/tab machine; only the rendering is Svelte. Lucide
  icons in the client-rendered markup are re-hydrated from a `$effect` keyed on
  the active tab + frequency step.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { apiPostForm, apiPostMultipart, getCsrfToken } from '@shared/api/client';
  import { statuses } from '@shared/stores/app_data';
  import CuratedDictBrowser from '@modules/vocabulary/components/CuratedDictBrowser.svelte';
  import ResultDisplay from '@modules/vocabulary/pages/ResultDisplay.svelte';
  import type { WordUploadConfig } from '@modules/vocabulary/api/word_upload_api';

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

  const { config }: { config: WordUploadConfig } = $props();

  const csrfToken = getCsrfToken();

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
  const hasLanguage = $derived(config.langName !== '');

  // The settable status options for the manual-import "Status for all" select —
  // statuses 1-5, 99, 98 with the localized labels, mirroring the PHP
  // SelectOptionsBuilder::forWordStatus(null, false, false) output (default 1).
  const STATUS_VALUES = [1, 2, 3, 4, 5, 99, 98];
  function statusLabel(value: number): string {
    const s = statuses[value];
    if (!s) {
      return String(value);
    }
    return s.abbr !== '' && s.abbr !== s.name ? `${s.name} [${s.abbr}]` : s.name;
  }

  // ===== Tab state =====
  let activeTab = $state<'frequency' | 'dictionary' | 'manual'>('frequency');

  // ===== Frequency import state (port of wordUploadPageApp) =====
  let freqStep = $state<'choose' | 'importing' | 'enriching' | 'done' | 'error'>('choose');
  let freqSize = $state(100);
  let freqMode = $state<'translation' | 'definition'>('translation');
  let freqResult = $state<ImportResult>({ imported: 0, skipped: 0, total: 0 });
  let enrichStats = $state<EnrichStats>({ done: 0, failed: 0, total: 0 });
  let enrichProgress = $state(0);
  let enrichWarning = $state('');
  let freqError = $state('');
  // Plain flag (not UI-bound): set by the Stop button, read by the enrich loop.
  let stopEnrichmentFlag = false;

  function sizeClass(value: number): string {
    return freqSize === value ? 'button is-info is-selected' : 'button';
  }

  // These short status strings were hardcoded English in the Alpine component
  // (never `__e()` i18n keys), so the port keeps them verbatim.
  function freqEnrichingLabel(): string {
    return freqMode === 'translation' ? 'Fetching translations...' : 'Fetching definitions...';
  }

  function freqEnrichedModeLabel(): string {
    return freqMode === 'translation' ? 'translations' : 'definitions';
  }

  async function startFrequencyImport(): Promise<void> {
    freqStep = 'importing';
    freqError = '';

    try {
      const response = await apiPostForm<ImportResult>(
        `/languages/${config.langId}/starter-vocab/import`,
        { count: freqSize }
      );

      if (response.error || !response.data) {
        freqError = response.error || 'Unknown error occurred.';
        freqStep = 'error';
        return;
      }

      freqResult = response.data;

      if (response.data.imported > 0) {
        enrichStats = { done: 0, failed: 0, total: response.data.imported };
        stopEnrichmentFlag = false;
        freqStep = 'enriching';
        await enrichAll();
      }

      freqStep = 'done';
    } catch {
      freqError = 'Network error. Please check your connection.';
      freqStep = 'error';
    }
  }

  async function enrichAll(): Promise<void> {
    while (!stopEnrichmentFlag) {
      const response = await apiPostForm<EnrichResponse>(
        `/languages/${config.langId}/starter-vocab/enrich`,
        { mode: freqMode }
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

  function stopEnrichment(): void {
    stopEnrichmentFlag = true;
  }

  function resetFrequencyImport(): void {
    freqStep = 'choose';
    freqResult = { imported: 0, skipped: 0, total: 0 };
    enrichStats = { done: 0, failed: 0, total: 0 };
    enrichProgress = 0;
    enrichWarning = '';
    freqError = '';
  }

  // ===== Manual upload form state (port of wordUploadFormApp) =====
  let manualMethod = $state<'dict-file' | 'csv-file' | 'paste'>('dict-file');
  let importMode = $state('0');
  let delimiter = $state('c');
  // Five column slots (Col1..Col5); the last three are revealed on demand.
  let cols = $state<string[]>(['w', 't', 'x', 'x', 'x']);
  let extraCols = $state(0);
  let dictFormat = $state('csv');
  let dictFileName = $state('');

  const showDelimiter = $derived(importMode === '4' || importMode === '5');
  const isDictFile = $derived(manualMethod === 'dict-file');
  const showDictCsvOptions = $derived(manualMethod === 'dict-file' && dictFormat === 'csv');

  const COL_LABELS: Record<string, string> = {
    w: t('vocabulary.upload.manual.col_term'),
    t: t('vocabulary.upload.manual.col_translation'),
    r: t('vocabulary.upload.manual.col_romanization'),
    s: t('vocabulary.upload.manual.col_sentence'),
    g: t('vocabulary.upload.manual.col_tag_list')
  };
  const COL_EXAMPLES: Record<string, string> = {
    w: 'Haus',
    t: 'house',
    r: 'haus',
    s: 'Das Haus ist gross.',
    g: 'A1 housing'
  };
  // The column dropdown options (value -> label), 'x' = don't import.
  const COLUMN_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'w', label: t('vocabulary.upload.manual.col_term') },
    { value: 't', label: t('vocabulary.upload.manual.col_translation') },
    { value: 'r', label: t('vocabulary.upload.manual.col_romanization') },
    { value: 's', label: t('vocabulary.upload.manual.col_sentence') },
    { value: 'g', label: t('vocabulary.upload.manual.col_tag_list') },
    { value: 'x', label: t('vocabulary.upload.manual.col_dont_import') }
  ];

  const previewHeaders = $derived(cols.map((c) => COL_LABELS[c]).filter(Boolean));
  const previewRow = $derived(cols.map((c) => COL_EXAMPLES[c]).filter(Boolean));
  const hasPreview = $derived(previewHeaders.length > 0);
  const dictFileLabel = $derived(dictFileName || t('vocabulary.upload.manual.no_file_selected'));

  function setManualMethod(method: 'dict-file' | 'csv-file' | 'paste'): void {
    manualMethod = method;
  }

  function updateDictFileName(event: Event): void {
    const input = event.target as HTMLInputElement;
    dictFileName = input.files?.[0]?.name ?? '';
  }

  function addColumn(): void {
    if (extraCols < 3) {
      extraCols++;
    }
  }

  function removeColumn(): void {
    if (extraCols > 0) {
      cols[1 + extraCols] = 'x';
      extraCols--;
    }
  }

  // ===== Manual upload submit (replaces the native form navigation) =====
  // The Alpine form did a browser POST to `/word/upload` and let the server
  // render the result page (`upload_result.php`). It now returns JSON
  // ({lastUpdate, rtl, recno}) and we render the result in-place with
  // `ResultDisplay` — the island owns both the form and its result.
  interface ManualResult {
    lastUpdate: string;
    rtl: boolean;
    recno: number;
  }
  let manualSubmitting = $state(false);
  let manualError = $state('');
  let manualResult = $state<ManualResult | null>(null);

  async function handleManualSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    // `new FormData(form)` omits the submit button, so carry its `op` explicitly
    // (Import vs ImportDictionary — the two operations the manual tab offers).
    const submitter = event.submitter as HTMLButtonElement | null;
    const formData = new FormData(form);
    formData.set('op', submitter?.value ?? 'Import');

    manualSubmitting = true;
    manualError = '';
    try {
      // apiPostMultipart carries the FormData (files + the hidden `id` /
      // `_csrf_token` inputs) with a bearer token, so a connected remote server
      // accepts the upload cross-origin.
      const response = await apiPostMultipart<ManualResult>('/terms/upload', formData);

      if (response.error || !response.data) {
        manualError = response.error || 'Import failed.';
        manualResult = null;
        return;
      }

      const data = response.data;
      manualResult = {
        lastUpdate: String(data.lastUpdate ?? ''),
        rtl: Boolean(data.rtl),
        recno: Number(data.recno ?? 0)
      };
    } catch {
      manualError = 'Network error. Please check your connection.';
      manualResult = null;
    } finally {
      manualSubmitting = false;
    }
  }

  function resetManual(): void {
    manualResult = null;
    manualError = '';
  }

  // ===== Icon hydration =====
  $effect(() => {
    void activeTab;
    void freqStep;
    void manualMethod;
    void manualResult;
    void manualError;
    void tick().then(() => initIcons());
  });
</script>

<!-- Navigation action card (mirrors PageLayoutHelper::buildActionCard). -->
<div class="card action-card mb-4">
  <div class="card-content">
    <div class="buttons is-centered">
      <a href="/words" class="button is-light is-primary">
        <span class="icon"><i data-lucide="list"></i></span>
        <span>{t('vocabulary.actions.my_terms')}</span>
      </a>
      <a href="/term-tags" class="button is-light">
        <span class="icon"><i data-lucide="tags"></i></span>
        <span>{t('vocabulary.actions.term_tags')}</span>
      </a>
    </div>
  </div>
</div>

<div>
  <!-- ==================== MAIN TABS ==================== -->
  <div class="tabs is-boxed mb-4">
    <ul>
      <li class:is-active={activeTab === 'frequency'}>
        <a
          href="#frequency"
          onclick={(e) => {
            e.preventDefault();
            activeTab = 'frequency';
          }}
        >
          <span class="icon is-small"><i data-lucide="trending-up"></i></span>
          <span>{t('vocabulary.upload.frequency_words')}</span>
        </a>
      </li>
      <li class:is-active={activeTab === 'dictionary'}>
        <a
          href="#dictionary"
          onclick={(e) => {
            e.preventDefault();
            activeTab = 'dictionary';
          }}
        >
          <span class="icon is-small"><i data-lucide="book-open"></i></span>
          <span>{t('vocabulary.upload.dictionaries')}</span>
        </a>
      </li>
      <li class:is-active={activeTab === 'manual'}>
        <a
          href="#manual"
          onclick={(e) => {
            e.preventDefault();
            activeTab = 'manual';
          }}
        >
          <span class="icon is-small"><i data-lucide="file-up"></i></span>
          <span>{t('vocabulary.upload.manual_upload')}</span>
        </a>
      </li>
    </ul>
  </div>

  <!-- ==================== TAB 1: FREQUENCY WORDS ==================== -->
  {#if activeTab === 'frequency'}
    {#if !hasLanguage}
      <div class="notification is-warning">{t('vocabulary.upload.select_language_first')}</div>
    {:else if !config.isFrequencyAvailable}
      <div class="notification is-info is-light">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML; lang is escaped -->
        {@html t('vocabulary.upload.freq.not_available_html', { lang: langNameEsc })}
      </div>
    {:else if freqStep === 'choose'}
      <div class="box">
        <p class="mb-4">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML; lang is escaped -->
          {@html t('vocabulary.upload.freq.intro_html', { lang: langNameEsc })}
        </p>

        <div class="field">
          <p class="label">{t('vocabulary.upload.freq.enrichment_mode')}</p>
          <div class="control">
            <label class="radio">
              <input type="radio" bind:group={freqMode} value="translation" />
              {t('vocabulary.upload.freq.translation')}
              <span class="has-text-grey is-size-7">{t('vocabulary.upload.freq.translation_hint')}</span>
            </label>
          </div>
          <div class="control mt-1">
            <label class="radio">
              <input type="radio" bind:group={freqMode} value="definition" />
              {t('vocabulary.upload.freq.definition')}
              <span class="has-text-grey is-size-7">{t('vocabulary.upload.freq.definition_hint')}</span>
            </label>
          </div>
        </div>

        <hr />
        <div class="field">
          <p class="label">{t('vocabulary.upload.freq.how_many')}</p>
          <div class="buttons has-addons">
            <button type="button" class={sizeClass(50)} onclick={() => (freqSize = 50)}>50</button>
            <button type="button" class={sizeClass(100)} onclick={() => (freqSize = 100)}>100</button>
            <button type="button" class={sizeClass(500)} onclick={() => (freqSize = 500)}>500</button>
          </div>
          <p class="help has-text-grey">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML (static anchors) -->
            {@html t('vocabulary.upload.freq.source_help_html')}
          </p>
        </div>

        <div class="field mt-5">
          <div class="control">
            <button type="button" class="button is-success" onclick={startFrequencyImport}>
              <span class="icon is-small"><i data-lucide="download"></i></span>
              <span>{t('vocabulary.upload.import')}</span>
            </button>
          </div>
        </div>
      </div>
    {:else if freqStep === 'importing'}
      <div class="box">
        <p class="mb-3"><strong>{t('vocabulary.upload.freq.fetching')}</strong></p>
        <progress class="progress is-info" max="100"></progress>
        <p class="has-text-grey is-size-7">{t('vocabulary.upload.freq.fetching_help')}</p>
      </div>
    {:else if freqStep === 'enriching'}
      <div class="box">
        <p class="mb-3"><strong>{freqEnrichingLabel()}</strong></p>
        <progress class="progress is-success" value={enrichProgress} max="100"></progress>
        <p class="is-size-7 mb-3">
          {enrichStats.done}
          {t('vocabulary.upload.freq.words_enriched_of')}
          {enrichStats.total}
          {t('vocabulary.upload.freq.words_enriched_suffix')}
          {#if enrichStats.failed > 0}
            <span class="has-text-grey"
              >({enrichStats.failed} {t('vocabulary.upload.freq.not_found')})</span
            >
          {/if}
        </p>

        {#if enrichWarning}
          <div class="notification is-warning is-light is-size-7 p-3 mb-3">{enrichWarning}</div>
        {/if}

        <div class="field is-grouped">
          <div class="control">
            <button type="button" class="button is-warning is-small" onclick={stopEnrichment}>
              {t('vocabulary.upload.freq.stop_continue')}
            </button>
          </div>
        </div>
      </div>
    {:else if freqStep === 'done'}
      <div class="box">
        <div class="notification is-success is-light">
          {#if freqResult.imported > 0 || freqResult.skipped > 0}
            <p>
              {t('vocabulary.upload.freq.imported_words')}
              <strong>{freqResult.imported}</strong>
              {t('vocabulary.upload.freq.words')}
              {#if freqResult.skipped > 0}
                <span>({freqResult.skipped} {t('vocabulary.upload.freq.already_existed')})</span>
              {/if}
              {t('vocabulary.upload.freq.for_lang')} <strong>{config.langName}</strong>.
            </p>
          {/if}
          {#if enrichStats.done > 0}
            <p class="mt-1">
              {enrichStats.done}
              {t('vocabulary.upload.freq.enriched_with')}
              {freqEnrichedModeLabel()}.
            </p>
          {/if}
        </div>

        <div class="field is-grouped">
          <div class="control">
            <button type="button" class="button is-primary" onclick={resetFrequencyImport}>
              {t('vocabulary.upload.import_more')}
            </button>
          </div>
          <div class="control">
            <a class="button" href={`/words?lang=${config.langId}`}>
              {t('vocabulary.upload.freq.view_vocabulary')}
            </a>
          </div>
        </div>
      </div>
    {:else if freqStep === 'error'}
      <div class="box">
        <div class="notification is-danger is-light">
          <strong>{t('vocabulary.upload.import_failed')}</strong>
          <span>{freqError}</span>
        </div>
        <div class="field">
          <div class="control">
            <button type="button" class="button" onclick={resetFrequencyImport}>
              {t('vocabulary.upload.try_again')}
            </button>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- ==================== TAB 2: DICTIONARIES ==================== -->
  {#if activeTab === 'dictionary'}
    <CuratedDictBrowser
      groups={config.curatedDictionaries}
      languageId={config.langId}
      languageName={config.langName}
    />
  {/if}

  <!-- ==================== TAB 3: MANUAL UPLOAD ==================== -->
  {#if activeTab === 'manual'}
    {#if manualResult}
      <ResultDisplay
        lastUpdate={manualResult.lastUpdate}
        rtl={manualResult.rtl}
        recno={manualResult.recno}
        onReset={resetManual}
      />
    {:else}
      {#if manualError}
        <div class="notification is-danger is-light">
          <button class="delete" aria-label="close" onclick={() => (manualError = '')}></button>
          <strong>{t('vocabulary.upload.import_failed')}</strong>
          <span>{manualError}</span>
        </div>
      {/if}
      <!-- action/method are inert: onsubmit preventDefaults and posts the
           FormData through apiPostMultipart. enctype documents the payload. -->
      <form enctype="multipart/form-data" onsubmit={handleManualSubmit}>
      <input type="hidden" name="_csrf_token" value={csrfToken} />
      <!-- Language ID from current language setting -->
      <input type="hidden" name="id" value={config.langId} />

      <!-- ==================== INPUT SOURCE ==================== -->
      <div class="box">
        <div class="field">
          <p class="label">{t('vocabulary.upload.manual.import_from')}</p>
          <div class="tabs is-boxed is-small mb-3">
            <ul>
              <li class:is-active={manualMethod === 'dict-file'}>
                <a
                  href="#dict-file"
                  onclick={(e) => {
                    e.preventDefault();
                    setManualMethod('dict-file');
                  }}
                >
                  <span class="icon is-small"><i data-lucide="book-open"></i></span>
                  <span>{t('vocabulary.upload.manual.dict_file')}</span>
                </a>
              </li>
              <li class:is-active={manualMethod === 'csv-file'}>
                <a
                  href="#csv-file"
                  onclick={(e) => {
                    e.preventDefault();
                    setManualMethod('csv-file');
                  }}
                >
                  <span class="icon is-small"><i data-lucide="file-up"></i></span>
                  <span>{t('vocabulary.upload.manual.csv_tsv_file')}</span>
                </a>
              </li>
              <li class:is-active={manualMethod === 'paste'}>
                <a
                  href="#paste"
                  onclick={(e) => {
                    e.preventDefault();
                    setManualMethod('paste');
                  }}
                >
                  <span class="icon is-small"><i data-lucide="clipboard-paste"></i></span>
                  <span>{t('vocabulary.upload.manual.paste_text')}</span>
                </a>
              </li>
            </ul>
          </div>

          <!-- Dictionary File -->
          {#if manualMethod === 'dict-file'}
            <div>
              <h5 class="title is-6 mb-3">{t('vocabulary.upload.manual.upload_dict_file')}</h5>
              <div class="field mb-3">
                <p class="label is-small">{t('vocabulary.upload.manual.file_format')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="dict_format" bind:value={dictFormat}>
                      <option value="csv">{t('vocabulary.upload.manual.fmt_csv')}</option>
                      <option value="json">{t('vocabulary.upload.manual.fmt_json')}</option>
                      <option value="stardict">{t('vocabulary.upload.manual.fmt_stardict')}</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="file has-name is-fullwidth">
                <label class="file-label">
                  <input class="file-input" type="file" name="dict_file" onchange={updateDictFileName} />
                  <span class="file-cta">
                    <span class="file-icon"><i data-lucide="upload"></i></span>
                    <span class="file-label">{t('vocabulary.upload.manual.choose_file')}</span>
                  </span>
                  <span class="file-name">{dictFileLabel}</span>
                </label>
              </div>
              {#if dictFormat === 'stardict'}
                <p class="help">{t('vocabulary.upload.manual.stardict_help')}</p>
              {/if}
              <div class="field mt-3">
                <p class="label is-small">{t('vocabulary.upload.manual.dict_name')}</p>
                <div class="control">
                  <input
                    type="text"
                    name="dict_name"
                    class="input is-small"
                    placeholder={t('vocabulary.upload.manual.dict_name_placeholder')}
                  />
                </div>
              </div>
            </div>
          {/if}

          <!-- CSV/TSV File Upload -->
          {#if manualMethod === 'csv-file'}
            <div>
              <div class="file has-name is-fullwidth">
                <label class="file-label">
                  <input class="file-input" type="file" name="thefile" />
                  <span class="file-cta">
                    <span class="file-icon"><i data-lucide="upload"></i></span>
                    <span class="file-label">{t('vocabulary.upload.manual.choose_file')}</span>
                  </span>
                  <span class="file-name">{t('vocabulary.upload.manual.no_file_selected')}</span>
                </label>
              </div>
              <p class="help">{t('vocabulary.upload.manual.csv_help')}</p>
            </div>
          {/if}

          <!-- Paste Text -->
          {#if manualMethod === 'paste'}
            <div>
              <div class="control">
                <textarea
                  class="textarea"
                  name="Upload"
                  rows="10"
                  placeholder={t('vocabulary.upload.manual.paste_placeholder')}
                ></textarea>
              </div>
              <p class="help">{t('vocabulary.upload.manual.paste_help')}</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- ==================== FORMAT SETTINGS (csv-file/paste modes) ==================== -->
      {#if !isDictFile}
        <div class="box">
          <h4 class="title is-5 mb-4">
            <span class="icon-text">
              <span class="icon"><i data-lucide="settings-2"></i></span>
              <span>{t('vocabulary.upload.manual.format_settings')}</span>
            </span>
          </h4>

          <div class="notification is-light is-small mb-4">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML (static code sample) -->
            {@html t('vocabulary.upload.manual.format_intro_html')}
          </div>

          <div class="columns">
            <div class="column is-half">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.field_delimiter')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="Tab" bind:value={delimiter}>
                      <option value="c">{t('vocabulary.upload.manual.delim_comma')}</option>
                      <option value="t">{t('vocabulary.upload.manual.delim_tab')}</option>
                      <option value="h">{t('vocabulary.upload.manual.delim_hash')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div class="column is-half">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.ignore_first')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="IgnFirstLine">
                      <option value="0">{t('vocabulary.upload.manual.no')}</option>
                      <option value="1">{t('vocabulary.upload.manual.yes_header')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Column Assignment -->
          <h5 class="title is-6 mt-4 mb-3">{t('vocabulary.upload.manual.column_assignment')}</h5>
          <div class="columns is-multiline">
            {#each [0, 1] as colIndex (colIndex)}
              <div class="column is-half-tablet">
                <div class="field">
                  <p class="label is-small">
                    {t('vocabulary.upload.manual.column_n', { n: colIndex + 1 })}
                  </p>
                  <div class="control">
                    <div class="select is-fullwidth is-small">
                      <select name={`Col${colIndex + 1}`} bind:value={cols[colIndex]}>
                        {#each COLUMN_OPTIONS as opt (opt.value)}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <!-- Extra columns (shown on demand) -->
          {#each [2, 3, 4] as colIndex (colIndex)}
            {#if extraCols >= colIndex - 1}
              <div class="columns">
                <div class="column is-half-tablet">
                  <div class="field">
                    <p class="label is-small">
                      {t('vocabulary.upload.manual.column_n', { n: colIndex + 1 })}
                    </p>
                    <div class="control">
                      <div class="select is-fullwidth is-small">
                        <select name={`Col${colIndex + 1}`} bind:value={cols[colIndex]}>
                          {#each COLUMN_OPTIONS as opt (opt.value)}
                            <option value={opt.value}>{opt.label}</option>
                          {/each}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          {/each}

          <div class="buttons mt-2">
            {#if extraCols < 3}
              <button type="button" class="button is-small is-light" onclick={addColumn}>
                <span class="icon is-small"><i data-lucide="plus"></i></span>
                <span>{t('vocabulary.upload.manual.add_column')}</span>
              </button>
            {/if}
            {#if extraCols > 0}
              <button type="button" class="button is-small is-light" onclick={removeColumn}>
                <span class="icon is-small"><i data-lucide="minus"></i></span>
                <span>{t('vocabulary.upload.manual.remove_column')}</span>
              </button>
            {/if}
          </div>

          <!-- Live Preview -->
          {#if hasPreview}
            <div class="mt-3">
              <h5 class="title is-6 mb-2">{t('vocabulary.upload.manual.preview')}</h5>
              <div class="table-container">
                <table class="table is-bordered is-narrow is-size-7 is-fullwidth">
                  <thead>
                    <tr>
                      {#each previewHeaders as header, i (i)}
                        <th class="has-background-light">{header}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {#each previewRow as cell, i (i)}
                        <td>{cell}</td>
                      {/each}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="help has-text-grey">{t('vocabulary.upload.manual.preview_help')}</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- ==================== DICTIONARY CSV OPTIONS (dict CSV mode only) ==================== -->
      {#if showDictCsvOptions}
        <div class="box">
          <h4 class="title is-5 mb-4">
            <span class="icon-text">
              <span class="icon"><i data-lucide="settings-2"></i></span>
              <span>{t('vocabulary.upload.manual.csv_options')}</span>
            </span>
          </h4>

          <div class="columns">
            <div class="column is-one-third">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.delimiter')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="dict_delimiter">
                      <option value=",">{t('vocabulary.upload.manual.delim_comma_short')}</option>
                      <option value="tab">{t('vocabulary.upload.manual.delim_tab_short')}</option>
                      <option value=";">{t('vocabulary.upload.manual.delim_semicolon')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div class="column is-one-third">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.first_row')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="dict_has_header">
                      <option value="yes">{t('vocabulary.upload.manual.header_row')}</option>
                      <option value="no">{t('vocabulary.upload.manual.data_row')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="columns">
            <div class="column is-one-third">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.term_column')}</p>
                <div class="control">
                  <input type="number" name="dict_term_column" class="input is-small" value="0" min="0" />
                </div>
                <p class="help">{t('vocabulary.upload.manual.first_col_help')}</p>
              </div>
            </div>
            <div class="column is-one-third">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.definition_column')}</p>
                <div class="control">
                  <input type="number" name="dict_definition_column" class="input is-small" value="1" min="0" />
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- ==================== IMPORT OPTIONS (csv-file/paste modes) ==================== -->
      {#if !isDictFile}
        <div class="box">
          <h4 class="title is-5 mb-4">
            <span class="icon-text">
              <span class="icon"><i data-lucide="package-import"></i></span>
              <span>{t('vocabulary.upload.manual.import_options')}</span>
            </span>
          </h4>

          <div class="columns">
            <div class="column is-half">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.import_mode')}</p>
                <div class="control">
                  <div class="select is-fullwidth">
                    <select name="Over" bind:value={importMode}>
                      <option value="0" title={t('vocabulary.upload.manual.mode_only_new_title')}>
                        {t('vocabulary.upload.manual.mode_only_new')}
                      </option>
                      <option value="1" title={t('vocabulary.upload.manual.mode_replace_title')}>
                        {t('vocabulary.upload.manual.mode_replace')}
                      </option>
                      <option value="2" title={t('vocabulary.upload.manual.mode_update_empty_title')}>
                        {t('vocabulary.upload.manual.mode_update_empty')}
                      </option>
                      <option value="3" title={t('vocabulary.upload.manual.mode_no_new_title')}>
                        {t('vocabulary.upload.manual.mode_no_new')}
                      </option>
                      <option value="4" title={t('vocabulary.upload.manual.mode_merge_title')}>
                        {t('vocabulary.upload.manual.mode_merge')}
                      </option>
                      <option value="5" title={t('vocabulary.upload.manual.mode_update_existing_title')}>
                        {t('vocabulary.upload.manual.mode_update_existing')}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Translation Delimiter (conditional) -->
              {#if showDelimiter}
                <div class="field mt-3">
                  <p class="label is-small">{t('vocabulary.upload.manual.translation_delimiter')}</p>
                  <div class="field has-addons">
                    <div class="control">
                      <input
                        class="input is-small"
                        type="text"
                        name="transl_delim"
                        style="width: 5em;"
                        value={config.translationDelimiter}
                      />
                    </div>
                    <div class="control">
                      <span class="icon has-text-danger mt-1" title={t('vocabulary.upload.manual.required')}>
                        <i data-lucide="asterisk"></i>
                      </span>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <div class="column is-half">
              <div class="field">
                <p class="label is-small">{t('vocabulary.upload.manual.status_for_all')}</p>
                <div class="field has-addons">
                  <div class="control is-expanded">
                    <div class="select is-fullwidth">
                      <select name="status" required>
                        {#each STATUS_VALUES as value (value)}
                          <option {value} selected={value === 1}>{statusLabel(value)}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                  <div class="control">
                    <span class="icon has-text-danger mt-2" title={t('vocabulary.upload.manual.required')}>
                      <i data-lucide="asterisk"></i>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- ==================== WARNING & SUBMIT ==================== -->
      {#if !isDictFile}
        <article class="message is-warning">
          <div class="message-body">
            <div class="level">
              <div class="level-left">
                <div class="level-item">
                  <span class="icon is-medium"><i data-lucide="alert-triangle"></i></span>
                </div>
                <div class="level-item">
                  <div>
                    <p class="has-text-weight-bold">{t('vocabulary.upload.manual.backup_advisable')}</p>
                    <p class="is-size-7">{t('vocabulary.upload.manual.double_check')}</p>
                  </div>
                </div>
              </div>
              <div class="level-right">
                <div class="level-item">
                  <a class="button is-warning is-outlined is-small" href="/admin/backup">
                    <span class="icon is-small"><i data-lucide="database"></i></span>
                    <span>{t('vocabulary.upload.manual.backup')}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </article>
      {/if}

      <!-- Form Actions -->
      <div class="field is-grouped is-grouped-right">
        {#if !isDictFile}
          <div class="control">
            <button
              type="submit"
              name="op"
              value="Import"
              class="button is-primary"
              class:is-loading={manualSubmitting}
              disabled={manualSubmitting}
            >
              <span class="icon is-small"><i data-lucide="upload"></i></span>
              <span>{t('vocabulary.upload.manual.import_terms')}</span>
            </button>
          </div>
        {:else}
          <div class="control">
            <button
              type="submit"
              name="op"
              value="ImportDictionary"
              class="button is-primary"
              class:is-loading={manualSubmitting}
              disabled={manualSubmitting}
            >
              <span class="icon is-small"><i data-lucide="upload"></i></span>
              <span>{t('vocabulary.upload.manual.import_dictionary')}</span>
            </button>
          </div>
        {/if}
      </div>
      </form>

      <!-- Help notes -->
      <article class="message is-light mt-5">
        <div class="message-body is-size-7">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted i18n HTML (static anchor) -->
          <p>{@html t('vocabulary.upload.manual.help_note_html')}</p>
        </div>
      </article>
    {/if}
  {/if}
</div>
