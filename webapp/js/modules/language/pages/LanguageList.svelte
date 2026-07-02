<!--
  Language List (Manage Languages) — Svelte 5 port of the Alpine `languageList`
  component (`language_list_component.ts` + `stores/language_store.ts`).

  Lists every configured language with its text/archived/term/feed counts, a
  highlighted "current language" panel, and per-row actions: set-current,
  edit (link), reparse, and delete (behind a confirm modal). The data layer is
  the *same* as the Alpine version (`LanguagesApi` → local-first Dexie or a
  remote `/api/v1`), so behaviour is unchanged; only the rendering is Svelte.
  Reactivity uses runes ($state/$derived) and the store's plain methods are
  inlined here, and Svelte compiles to plain JS so the island runs under the
  bundle's strict `script-src 'self'` CSP.

  This backs only the bundled app's `languages.html`. The PHP server's PWA still
  renders the Alpine `languageList` component — the two are built from the same
  `src/frontend/` source and coexist until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import {
    LanguagesApi,
    type LanguageListItem
  } from '@modules/language/api/languages_api';

  // --- Reactive state (runes) -------------------------------------------------
  // Mirrors the Alpine store (`language_store.ts`) + component
  // (`language_list_component.ts`) state, inlined into the island.
  let languages = $state<LanguageListItem[]>([]);
  let currentLanguageId = $state(0);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let deleteConfirmId = $state<number | null>(null);
  let refreshingId = $state<number | null>(null);

  // Notification state (component-level in the Alpine version).
  let notification = $state<string | null>(null);
  let notificationType = $state<'success' | 'error' | 'info'>('info');
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;

  // --- Derived ----------------------------------------------------------------
  const currentLanguage = $derived(languages.find((l) => l.id === currentLanguageId));

  // --- Helpers ----------------------------------------------------------------
  function getLanguage(id: number): LanguageListItem | undefined {
    return languages.find((l) => l.id === id);
  }

  /** A language is deletable only when it has no texts/archived/terms/feeds. */
  function canDelete(lang: LanguageListItem): boolean {
    return (
      lang.textCount === 0 &&
      lang.archivedTextCount === 0 &&
      lang.wordCount === 0 &&
      lang.feedCount === 0
    );
  }

  // --- Data operations (inlined from the Alpine store) ------------------------
  async function loadLanguages(): Promise<void> {
    isLoading = true;
    error = null;

    try {
      const response = await LanguagesApi.list();

      if (response.error || !response.data) {
        error = response.error || 'Failed to load languages';
        isLoading = false;
        return;
      }

      languages = response.data.languages;
      currentLanguageId = response.data.currentLanguageId;
    } catch (e) {
      console.error('Error loading languages:', e);
      error = 'Failed to load languages';
    }

    isLoading = false;
  }

  async function setCurrentLanguage(id: number): Promise<boolean> {
    try {
      const response = await LanguagesApi.setDefault(id);

      if (response.error || !response.data?.success) {
        error = response.error || 'Failed to set default language';
        return false;
      }

      currentLanguageId = id;
      return true;
    } catch (e) {
      console.error('Error setting default language:', e);
      error = 'Failed to set default language';
      return false;
    }
  }

  async function deleteLanguage(id: number): Promise<boolean> {
    try {
      const response = await LanguagesApi.delete(id);

      if (response.error) {
        error = response.error;
        return false;
      }

      if (!response.data?.success) {
        error = response.data?.error || 'Failed to delete language';
        return false;
      }

      // Remove from local list.
      languages = languages.filter((l) => l.id !== id);

      // Clear current language if it was the one deleted.
      if (currentLanguageId === id) {
        currentLanguageId = 0;
      }

      deleteConfirmId = null;
      return true;
    } catch (e) {
      console.error('Error deleting language:', e);
      error = 'Failed to delete language';
      return false;
    }
  }

  async function refreshLanguage(id: number): Promise<boolean> {
    refreshingId = id;

    try {
      const response = await LanguagesApi.refresh(id);

      if (response.error || !response.data?.success) {
        error = response.error || 'Failed to refresh language';
        refreshingId = null;
        return false;
      }

      refreshingId = null;
      return true;
    } catch (e) {
      console.error('Error refreshing language:', e);
      error = 'Failed to refresh language';
      refreshingId = null;
      return false;
    }
  }

  // --- Delete confirmation modal ----------------------------------------------
  function showDeleteConfirm(id: number): void {
    deleteConfirmId = id;
  }
  function hideDeleteConfirm(): void {
    deleteConfirmId = null;
  }

  // --- Notifications ----------------------------------------------------------
  function showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    notification = message;
    notificationType = type;

    clearTimeout(notificationTimer);
    // Auto-hide after 5 seconds for success/info (errors stay until dismissed).
    if (type !== 'error') {
      notificationTimer = setTimeout(() => {
        clearNotification();
      }, 5000);
    }
  }
  function clearNotification(): void {
    notification = null;
  }

  // --- Actions (mirror the Alpine component methods) --------------------------
  async function handleSetDefault(id: number): Promise<void> {
    const lang = getLanguage(id);
    if (!lang) return;

    const success = await setCurrentLanguage(id);

    if (success) {
      showNotification(
        t('language.list.set_current_success', { name: lang.name }),
        'success'
      );
    } else {
      showNotification(error || t('language.list.set_current_failed'), 'error');
    }
  }

  async function handleDelete(id: number): Promise<void> {
    const lang = getLanguage(id);
    if (!lang) return;

    if (!canDelete(lang)) {
      showNotification(t('language.list.cannot_delete'), 'error');
      hideDeleteConfirm();
      return;
    }

    const success = await deleteLanguage(id);

    if (success) {
      showNotification(
        t('language.list.delete_success', { name: lang.name }),
        'success'
      );
    } else {
      showNotification(error || t('language.list.delete_failed'), 'error');
    }
  }

  async function handleRefresh(id: number): Promise<void> {
    const lang = getLanguage(id);
    if (!lang) return;

    showNotification(t('language.list.reparsing', { name: lang.name }), 'info');

    const success = await refreshLanguage(id);

    if (success) {
      showNotification(
        t('language.list.reparse_success', { name: lang.name }),
        'success'
      );
    } else {
      showNotification(error || t('language.list.reparse_failed'), 'error');
    }
  }

  // Re-run lucide whenever the rendered icon set changes (initial load, list
  // mutations on delete, the current-language panel, reparse spinners, or the
  // delete modal opening add/remove `<i data-lucide>` nodes). Mirrors the
  // Alpine component's `refreshIcons()` after each state change.
  $effect(() => {
    void languages;
    void isLoading;
    void error;
    void currentLanguageId;
    void refreshingId;
    void deleteConfirmId;
    void tick().then(() => initIcons());
  });

  onMount(async () => {
    await loadLanguages();
  });
</script>

<!-- Notification area -->
{#if notification}
  <div
    class="notification"
    class:is-success={notificationType === 'success'}
    class:is-danger={notificationType === 'error'}
    class:is-info={notificationType === 'info'}
  >
    <button class="delete" aria-label="Dismiss notification" onclick={clearNotification}></button>
    <span>{notification}</span>
  </div>
{/if}

<!-- Loading state -->
{#if isLoading}
  <div class="has-text-centered py-6">
    <span class="icon is-large">
      <i data-lucide="loader-2" class="animate-spin" aria-label="Loading"></i>
    </span>
    <p>Loading languages...</p>
  </div>
{/if}

<!-- Error state -->
{#if error && !isLoading}
  <div class="notification is-danger">
    <button class="delete" aria-label="Dismiss error" onclick={() => (error = null)}></button>
    <span>{error}</span>
  </div>
{/if}

<!-- Empty state -->
{#if !isLoading && !error && languages.length === 0}
  <div class="has-text-centered py-6">
    <p class="mb-4">No languages found. Create your first language to get started.</p>
    <a href="/languages/new" class="button is-primary">
      <span class="icon"><i data-lucide="circle-plus" class="icon" aria-label="New Language" style="width:16px;height:16px"></i></span>
      <span>New Language</span>
    </a>
  </div>
{/if}

<!-- Main content (when languages exist) -->
{#if !isLoading && languages.length > 0}
  <!-- Current Language Section -->
  {#if currentLanguage}
    <div class="box mb-5">
      <div class="level mb-4">
        <div class="level-left">
          <div class="level-item">
            <h2 class="title is-4 mb-0">
              <span class="icon mr-2 has-text-primary">
                <i data-lucide="languages" style="width: 24px; height: 24px;" aria-label="Language"></i>
              </span>
              <span>{currentLanguage.name}</span>
            </h2>
          </div>
          <div class="level-item">
            {#if currentLanguage.hasExportTemplate}
              <span class="tag is-info is-light" title="Custom export template available">
                <span class="icon">
                  <i data-lucide="file-down" style="width: 12px; height: 12px;" aria-label="Export Template"></i>
                </span>
                <span>Export Template</span>
              </span>
            {/if}
          </div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <div class="buttons">
              <a href={'/review?lang=' + currentLanguage.id} class="button is-primary is-outlined">
                <span class="icon">
                  <i data-lucide="circle-help" style="width: 16px; height: 16px;" aria-label="Review"></i>
                </span>
                <span>Review</span>
              </a>
              {#if currentLanguage.textCount > 0}
                <button
                  type="button"
                  class="button is-warning is-outlined"
                  class:is-loading={refreshingId === currentLanguage.id}
                  onclick={() => handleRefresh(currentLanguage.id)}
                >
                  <span class="icon">
                    <i data-lucide="zap" style="width: 16px; height: 16px;" aria-label="Reparse"></i>
                  </span>
                  <span>Reparse</span>
                </button>
              {/if}
              <a href={'/languages/' + currentLanguage.id + '/edit'} class="button is-info is-outlined">
                <span class="icon">
                  <i data-lucide="file-pen" style="width: 16px; height: 16px;" aria-label="Edit"></i>
                </span>
                <span>Edit</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <nav class="level">
        <div class="level-item has-text-centered">
          <a href={'/texts?page=1&query=&filterlang=' + currentLanguage.id} class="has-text-centered">
            <p class="heading">Texts</p>
            <p class="title is-5">{currentLanguage.textCount}</p>
          </a>
        </div>
        <div class="level-item has-text-centered">
          <a href={'/text/archived?page=1&query=&filterlang=' + currentLanguage.id} class="has-text-centered">
            <p class="heading">Archived</p>
            <p class="title is-5">{currentLanguage.archivedTextCount}</p>
          </a>
        </div>
        <div class="level-item has-text-centered">
          <a href={'/words?lang=' + currentLanguage.id} class="has-text-centered">
            <p class="heading">Terms</p>
            <p class="title is-5">{currentLanguage.wordCount}</p>
          </a>
        </div>
        <div class="level-item has-text-centered">
          <a
            href={'/feeds?query=&selected_feed=&check_autoupdate=1&filterlang=' + currentLanguage.id}
            class="has-text-centered"
          >
            <p class="heading">Feeds</p>
            <p class="title is-5">
              <span>{currentLanguage.feedCount}</span>
              (<span>{currentLanguage.articleCount}</span>)
            </p>
          </a>
        </div>
      </nav>
    </div>
  {/if}

  <!-- All Languages Table -->
  <div class="box">
    <div class="level mb-4">
      <div class="level-left">
        <div class="level-item">
          <h3 class="title is-5 mb-0">All Languages</h3>
        </div>
      </div>
      <div class="level-right">
        <div class="level-item">
          <a href="/languages/new" class="button is-primary">
            <span class="icon"><i data-lucide="circle-plus" class="icon" aria-label="New Language" style="width:16px;height:16px"></i></span>
            <span>New Language</span>
          </a>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table class="table is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th>Language</th>
            <th class="has-text-centered">Texts</th>
            <th class="has-text-centered">Archived</th>
            <th class="has-text-centered">Terms</th>
            <th class="has-text-centered">Feeds</th>
            <th class="has-text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each languages as lang (lang.id)}
            <tr style={lang.id === currentLanguageId ? 'border-left: 3px solid hsl(171, 100%, 41%)' : ''}>
              <td>
                <strong>{lang.name}</strong>
                {#if lang.id === currentLanguageId}
                  <span class="tag is-primary is-light ml-2">Current</span>
                {/if}
                {#if lang.hasExportTemplate}
                  <span class="tag is-info is-light ml-1" title="Export template">
                    <span class="icon is-small">
                      <i data-lucide="file-down" style="width: 10px; height: 10px;" aria-label="Export template"></i>
                    </span>
                  </span>
                {/if}
              </td>
              <td class="has-text-centered">
                <a href={'/texts?page=1&query=&filterlang=' + lang.id}>{lang.textCount}</a>
              </td>
              <td class="has-text-centered">
                <a href={'/text/archived?page=1&query=&filterlang=' + lang.id}>{lang.archivedTextCount}</a>
              </td>
              <td class="has-text-centered">
                <a href={'/words?lang=' + lang.id}>{lang.wordCount}</a>
              </td>
              <td class="has-text-centered">
                <a href={'/feeds?query=&selected_feed=&check_autoupdate=1&filterlang=' + lang.id}>
                  <span>{lang.feedCount}</span>
                  (<span>{lang.articleCount}</span>)
                </a>
              </td>
              <td class="has-text-right">
                <div class="buttons is-right are-small">
                  {#if lang.id !== currentLanguageId}
                    <button
                      type="button"
                      class="button is-small is-primary is-outlined"
                      onclick={() => handleSetDefault(lang.id)}
                      title="Set as Current"
                    >
                      <span class="icon">
                        <i data-lucide="circle-check" style="width: 14px; height: 14px;" aria-label="Set as Current"></i>
                      </span>
                    </button>
                  {/if}
                  <a href={'/languages/' + lang.id + '/edit'} class="button is-small is-info is-outlined" title="Edit">
                    <span class="icon">
                      <i data-lucide="file-pen" style="width: 14px; height: 14px;" aria-label="Edit"></i>
                    </span>
                  </a>
                  {#if lang.textCount > 0}
                    <button
                      type="button"
                      class="button is-small is-warning is-outlined"
                      class:is-loading={refreshingId === lang.id}
                      onclick={() => handleRefresh(lang.id)}
                      title="Reparse Texts"
                    >
                      <span class="icon">
                        <i data-lucide="zap" style="width: 14px; height: 14px;" aria-label="Reparse Texts"></i>
                      </span>
                    </button>
                  {/if}
                  {#if canDelete(lang)}
                    <button
                      type="button"
                      class="button is-small is-danger is-outlined"
                      onclick={() => showDeleteConfirm(lang.id)}
                      title="Delete"
                    >
                      <span class="icon">
                        <i data-lucide="circle-minus" style="width: 14px; height: 14px;" aria-label="Delete"></i>
                      </span>
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<!-- Delete confirmation modal -->
<div class="modal" class:is-active={deleteConfirmId !== null} role="dialog" aria-modal="true" aria-labelledby="language-delete-title">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-background" onclick={hideDeleteConfirm}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title" id="language-delete-title">Confirm Delete</p>
      <button class="delete" aria-label="close" onclick={hideDeleteConfirm}></button>
    </header>
    <section class="modal-card-body">
      {#if deleteConfirmId !== null}
        <p>
          Are you sure you want to delete the language "<strong>{getLanguage(deleteConfirmId)?.name}</strong>"?
        </p>
      {/if}
      <p class="has-text-danger mt-2">This action cannot be undone.</p>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-danger" onclick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}>
        Delete
      </button>
      <button class="button" onclick={hideDeleteConfirm}>Cancel</button>
    </footer>
  </div>
</div>
