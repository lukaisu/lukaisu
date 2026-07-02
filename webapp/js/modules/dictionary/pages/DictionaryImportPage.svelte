<!--
  Dictionary Import — Svelte 5 port of the Alpine `dictionaryImport` screen
  (src/Modules/Dictionary/Views/import.php).

  Server-enhanced (Job B, surface 3): imported dictionaries are stored, fetched
  and parsed by a connected Lukaisu Server, so this island only mounts when a
  server is connected (dictionary-import.ts gates it; offline it reveals a
  "connect a server" notice and mounts nothing). It composes three pieces around
  a language picker:

    1. "Your dictionaries" — lists the language's local dictionaries and deletes
       them, driven by the local-dictionaries API (GET / DELETE
       `/api/v1/local-dictionaries`).
    2. CuratedDictBrowser — the reusable D3a island: one-click import of a tested,
       freely-licensed dictionary (POST `/api/v1/local-dictionaries/import-curated`,
       the only import path a bearer client can drive).
    3. "Import a file" — the faithful port of import.php's multipart upload form
       (CSV / JSON / StarDict, with the same format-reactive option panels). The
       local-dictionaries API cannot ingest a raw upload (it needs a server-side
       temp path), so this stays a native `POST /dictionaries/import` to the kept
       server route (DictionaryController@processImport), which parses the file and
       302s back. Only reachable same-origin (the page is server-gated).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import { apiGet, apiDelete, apiPostMultipart } from '@shared/api/client';
  import CuratedDictBrowser from '@modules/vocabulary/components/CuratedDictBrowser.svelte';
  import type { CuratedDictGroup } from '@modules/vocabulary/api/word_upload_api';

  interface LanguageOption {
    id: number;
    name: string;
  }

  /** One local dictionary row, as returned by GET /api/v1/local-dictionaries. */
  interface DictRow {
    id: number;
    name: string;
    source_format: string;
    entry_count: number;
    enabled: boolean;
  }

  const {
    languages,
    curatedGroups,
    initialLangId,
    initialDictId = null,
    initialError = '',
    csrfToken = '',
    basePath = ''
  }: {
    languages: LanguageOption[];
    curatedGroups: CuratedDictGroup[];
    initialLangId: number;
    initialDictId?: number | null;
    initialError?: string;
    csrfToken?: string;
    basePath?: string;
  } = $props();

  // Seed the mutable local copies from the props once (the props are static
  // per mount); untrack documents that and silences Svelte's
  // state_referenced_locally warning, as CuratedDictBrowser does.
  let langId = $state(untrack(() => initialLangId));
  let format = $state<'csv' | 'json' | 'stardict'>('csv');
  let fileName = $state('');
  let submitting = $state(false);
  let dicts = $state<DictRow[]>([]);
  let error = $state(untrack(() => initialError));

  const acceptTypes: Record<string, string> = {
    csv: '.csv,.tsv,.txt',
    json: '.json',
    // StarDict needs companion .idx/.dict files alongside .ifo, so the user
    // uploads an archive that contains all three.
    stardict: '.zip,.tar,.tgz,.gz,.bz2,.xz'
  };

  const langName = $derived(languages.find((l) => l.id === langId)?.name ?? '');

  // When a specific dictionary is targeted (processImport bounces back here with
  // ?dict_id= on error), lock the form to it — mirrors import.php's $dictionary
  // branch. Otherwise the user picks "create new" or an existing one.
  const targetDict = $derived(
    initialDictId != null ? dicts.find((d) => d.id === initialDictId) ?? null : null
  );

  async function loadDictionaries(): Promise<void> {
    if (langId <= 0) {
      dicts = [];
      return;
    }
    const res = await apiGet<{ dictionaries: DictRow[]; mode: number }>('/local-dictionaries', {
      language_id: langId
    });
    if (res.error) {
      error = res.error;
      dicts = [];
      return;
    }
    error = '';
    dicts = res.data?.dictionaries ?? [];
  }

  async function deleteDictionary(dict: DictRow): Promise<void> {
    if (!window.confirm(t('dictionary.confirm_delete_dict'))) {
      return;
    }
    const res = await apiDelete<{ success?: boolean; error?: string }>(
      `/local-dictionaries/${dict.id}`
    );
    if (res.error || res.data?.error || res.data?.success === false) {
      error = res.error || res.data?.error || t('dictionary.no_local_dicts');
      return;
    }
    await loadDictionaries();
  }

  function onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    fileName = input.files?.[0]?.name ?? '';
  }

  // The dictionary-file upload moved off the cookie-authed native form POST onto
  // POST /api/v1/local-dictionaries/import (Phase R): send the multipart body via
  // apiPostMultipart (bearer + CSRF) and, on success, mirror the retired flow by
  // landing on the dictionaries list with the imported-count flash the
  // server-rendered index renders. The file input + option fields are unchanged,
  // so `new FormData(form)` carries the same payload the server already parses.
  async function handleImport(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    submitting = true;
    error = '';
    try {
      const res = await apiPostMultipart<{ dictId: number; imported: number; langId: number }>(
        '/local-dictionaries/import',
        formData
      );
      if (res.error || !res.data) {
        error = res.error || 'Import failed.';
        submitting = false;
        return;
      }
      window.location.assign(
        `${basePath}/dictionaries?lang=${res.data.langId}&message=imported_${res.data.imported}`
      );
    } catch {
      error = 'Import failed. Please check your connection.';
      submitting = false;
    }
  }

  function dictionariesHref(): string {
    return `${basePath}/dictionaries?lang=${langId}`;
  }

  onMount(() => {
    void loadDictionaries();
  });
</script>

<div class="box mb-4">
  <div class="level is-mobile">
    <div class="level-left">
      <a class="button is-light" href={dictionariesHref()}>
        <span class="icon is-small"><i data-lucide="arrow-left"></i></span>
        <span>{t('dictionary.back_to_dictionaries')}</span>
      </a>
    </div>
  </div>
</div>

{#if error}
  <div class="notification is-danger is-light mb-4">
    <button class="delete" aria-label="close" onclick={() => (error = '')}></button>
    {error}
  </div>
{/if}

<!-- Language picker: a bundled page has no server-chosen language context, so it
     lets the reader choose which language to manage (default from ?lang). -->
<div class="field">
  <label class="label" for="dict-import-lang">{t('common.language')}</label>
  <div class="control">
    <div class="select is-fullwidth">
      <select id="dict-import-lang" bind:value={langId} onchange={() => void loadDictionaries()}>
        {#each languages as lang (lang.id)}
          <option value={lang.id}>{lang.name}</option>
        {/each}
      </select>
    </div>
  </div>
</div>

<!-- Your dictionaries (list + delete via the local-dictionaries API). -->
<div class="box">
  <h3 class="title is-5">{t('dictionary.dictionaries_for').replace('{language}', langName)}</h3>
  {#if dicts.length === 0}
    <p class="has-text-grey">{t('dictionary.no_local_dicts')}</p>
  {:else}
    <div class="table-container">
      <table class="table is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            <th>{t('dictionary.col_format')}</th>
            <th class="has-text-right">{t('dictionary.col_entries')}</th>
            <th>{t('common.status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each dicts as dict (dict.id)}
            <tr>
              <td>{dict.name}</td>
              <td>{dict.source_format}</td>
              <td class="has-text-right">{dict.entry_count}</td>
              <td>
                <span class="tag is-light" class:is-success={dict.enabled}>
                  {dict.enabled ? t('common.enabled') : t('common.disabled')}
                </span>
              </td>
              <td class="has-text-right">
                <button
                  type="button"
                  class="button is-small is-danger is-outlined"
                  onclick={() => deleteDictionary(dict)}
                >
                  {t('common.delete')}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Curated one-click import (reusable D3a island). -->
<div class="box">
  <h3 class="title is-5">{t('dictionary.import_a_dictionary')}</h3>
  <CuratedDictBrowser groups={curatedGroups} languageId={langId} languageName={langName} />
</div>

<!-- Import a file — faithful port of import.php's multipart upload form. -->
<div class="box">
  <h3 class="title is-4">{t('dictionary.import_dictionary')}</h3>
  <p class="subtitle is-6">{t('dictionary.import_dictionary_subtitle')}</p>

  <!-- action/method are inert: onsubmit preventDefaults and posts the FormData
       through apiPostMultipart. enctype documents the multipart payload. -->
  <form enctype="multipart/form-data" onsubmit={handleImport}>
    <input type="hidden" name="_csrf_token" value={csrfToken} />
    <input type="hidden" name="lang_id" value={langId} />

    <!-- Dictionary selection -->
    <div class="field">
      <label class="label" for="dict-import-dict">{t('dictionary.dictionary')}</label>
      <div class="control">
        {#if targetDict}
          <input type="hidden" name="dict_id" value={targetDict.id} />
          <input type="text" class="input" value={targetDict.name} readonly />
          <p class="help">{t('dictionary.adding_to_existing')}</p>
        {:else if dicts.length > 0}
          <div class="select is-fullwidth">
            <select id="dict-import-dict" name="dict_id">
              <option value="">{t('dictionary.create_new_option')}</option>
              {#each dicts as dict (dict.id)}
                <option value={dict.id}>{dict.name} ({dict.entry_count})</option>
              {/each}
            </select>
          </div>
        {:else}
          <p class="help">{t('dictionary.new_dict_will_be_created')}</p>
        {/if}
      </div>
    </div>

    <!-- Dictionary name (for new dictionaries) -->
    {#if !targetDict}
      <div class="field">
        <label class="label" for="dict-import-name">{t('dictionary.dictionary_name')}</label>
        <div class="control">
          <input
            id="dict-import-name"
            type="text"
            name="dict_name"
            class="input"
            placeholder={t('dictionary.dictionary_name_example')}
          />
        </div>
        <p class="help">{t('dictionary.auto_generate_help')}</p>
      </div>
    {/if}

    <!-- File format -->
    <div class="field">
      <label class="label" for="dict-import-format">{t('dictionary.file_format')}</label>
      <div class="control">
        <div class="select is-fullwidth">
          <select id="dict-import-format" name="format" bind:value={format}>
            <option value="csv">{t('dictionary.format_csv')}</option>
            <option value="json">{t('dictionary.format_json')}</option>
            <option value="stardict">{t('dictionary.format_stardict')}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- File upload -->
    <div class="field">
      <label class="label" for="dict-import-file">{t('dictionary.dictionary_file')}</label>
      <div class="file has-name is-fullwidth">
        <label class="file-label">
          <input
            id="dict-import-file"
            class="file-input"
            type="file"
            name="file"
            required
            accept={acceptTypes[format]}
            onchange={onFileSelected}
          />
          <span class="file-cta">
            <span class="file-icon"><i data-lucide="upload"></i></span>
            <span class="file-label">{t('dictionary.choose_file')}</span>
          </span>
          <span class="file-name">{fileName || t('dictionary.no_file_selected')}</span>
        </label>
      </div>
      {#if format === 'csv'}
        <p class="help">{t('dictionary.csv_help')}</p>
      {:else if format === 'json'}
        <p class="help">{t('dictionary.json_help')}</p>
      {:else}
        <p class="help">{t('dictionary.stardict_help')}</p>
      {/if}
    </div>

    <!-- CSV options -->
    {#if format === 'csv'}
      <div class="box">
        <h5 class="title is-6">{t('dictionary.csv_options')}</h5>

        <div class="field">
          <label class="label" for="dict-import-delimiter">{t('dictionary.delimiter')}</label>
          <div class="control">
            <div class="select">
              <select id="dict-import-delimiter" name="delimiter">
                <option value=",">{t('dictionary.delimiter_comma')}</option>
                <option value="tab">{t('dictionary.delimiter_tab')}</option>
                <option value=";">{t('dictionary.delimiter_semicolon')}</option>
                <option value="|">{t('dictionary.delimiter_pipe')}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="checkbox">
            <input type="checkbox" name="has_header" value="yes" checked />
            {t('dictionary.first_row_header')}
          </label>
        </div>

        <h6 class="title is-6 mt-4">{t('dictionary.column_mapping')}</h6>
        <div class="columns">
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-term-col">{t('dictionary.term_column')}</label>
              <div class="control">
                <input
                  id="dict-import-term-col"
                  type="number"
                  name="term_column"
                  class="input"
                  value="0"
                  min="0"
                />
              </div>
              <p class="help">{t('dictionary.first_column_help')}</p>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-def-col">{t('dictionary.definition_column')}</label>
              <div class="control">
                <input
                  id="dict-import-def-col"
                  type="number"
                  name="definition_column"
                  class="input"
                  value="1"
                  min="0"
                />
              </div>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-reading-col">{t('dictionary.reading_column')}</label>
              <div class="control">
                <input
                  id="dict-import-reading-col"
                  type="number"
                  name="reading_column"
                  class="input"
                />
              </div>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-pos-col">{t('dictionary.pos_column')}</label>
              <div class="control">
                <input id="dict-import-pos-col" type="number" name="pos_column" class="input" />
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- JSON options -->
    {#if format === 'json'}
      <div class="box">
        <h5 class="title is-6">{t('dictionary.json_field_mapping')}</h5>
        <p class="mb-3">{t('dictionary.json_field_help')}</p>

        <div class="columns">
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-term-field">{t('dictionary.term_field')}</label>
              <div class="control">
                <input
                  id="dict-import-term-field"
                  type="text"
                  name="term_field"
                  class="input"
                  placeholder="word"
                />
              </div>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-def-field">{t('dictionary.definition_field')}</label>
              <div class="control">
                <input
                  id="dict-import-def-field"
                  type="text"
                  name="definition_field"
                  class="input"
                  placeholder="meaning"
                />
              </div>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-reading-field">{t('dictionary.reading_field')}</label>
              <div class="control">
                <input
                  id="dict-import-reading-field"
                  type="text"
                  name="reading_field"
                  class="input"
                  placeholder="furigana"
                />
              </div>
            </div>
          </div>
          <div class="column is-3">
            <div class="field">
              <label class="label" for="dict-import-pos-field">{t('dictionary.pos_field')}</label>
              <div class="control">
                <input
                  id="dict-import-pos-field"
                  type="text"
                  name="pos_field"
                  class="input"
                  placeholder="pos"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- StarDict info -->
    {#if format === 'stardict'}
      <div class="box">
        <h5 class="title is-6">{t('dictionary.stardict_format')}</h5>
        <p>{t('dictionary.stardict_intro')}</p>
        <ul class="mt-2 mb-2">
          <li><strong>.ifo</strong> - {t('dictionary.stardict_ifo')}</li>
          <li><strong>.idx</strong> - {t('dictionary.stardict_idx')}</li>
          <li><strong>.dict</strong> / <strong>.dict.dz</strong> - {t('dictionary.stardict_dict')}</li>
        </ul>
        <p class="has-text-info">{t('dictionary.stardict_archive_required')}</p>
        <p class="help mt-2">{t('dictionary.stardict_archive_formats')}</p>
      </div>
    {/if}

    <!-- Submit -->
    <div class="field mt-5">
      <div class="control">
        <button
          type="submit"
          class="button is-primary is-medium"
          class:is-loading={submitting}
          disabled={submitting || !fileName}
        >
          <span class="icon is-small"><i data-lucide="upload"></i></span>
          <span>{t('dictionary.import_dictionary')}</span>
        </button>
      </div>
    </div>
  </form>
</div>
