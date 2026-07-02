<!--
  Text Reader — Svelte 5 port of the Alpine reader island (the coupled
  `textReader` + `wordPopover` + `wordModal`/`wordEditForm` + `multiWordModal`
  x-data regions of read.html), ported together because they are inseparable:
  they share the reader's word state and call each other's methods.

  This component owns the three runes stores (`WordStore`, `WordFormStore`,
  `MultiWordFormStore` — ports of the three coupled Alpine stores) and threads
  them into the toolbar, the text display, the word popover, the edit modal and
  the multi-word modal. It reuses the existing `text_renderer` (render + in-place
  DOM patch), `text_styles`, `book_nav_renderer`, `TextsApi`/`TermsApi` and the
  native-selection helper unchanged.

  Rendering split (parity-critical): the whole text is rendered with
  `{@html renderText(...)}` and re-rendered ONLY when a *display* setting changes
  (show-all multiword expansion). Individual word changes (status set, term
  saved/deleted) DO NOT re-render — the stores patch the DOM imperatively
  (`updateWordStatusInDOM`/`updateWordTranslationInDOM`), matching the Alpine
  flow so scroll position and focus are preserved with no flicker. Show /
  translations / text-size / width apply via reactive CSS, not a re-render.

  The audio player is its own Svelte island (`AudioPlayer.svelte`), hosted here
  between the toolbar and the text (its original read_desktop.php position) and
  shown only when the loaded text has audio. This component otherwise manages the
  toolbar, book nav, text, popover and modals.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { TextsApi } from '@modules/text/api/texts_api';
  import { SettingsApi } from '@modules/admin/api/settings_api';
  import { renderBookNav } from '@modules/text/pages/reading/book_nav_renderer';
  import {
    renderText,
    updateWordStatusInDOM,
    type RenderSettings
  } from '@modules/text/pages/reading/text_renderer';
  import { setupMultiWordSelection } from '@modules/text/pages/reading/text_multiword_selection';
  import { WordStore } from '@modules/vocabulary/stores/word_store.svelte';
  import { WordFormStore } from '@modules/vocabulary/stores/word_form_store.svelte';
  import { MultiWordFormStore } from '@modules/vocabulary/stores/multi_word_form_store.svelte';
  import WordPopover from '@modules/vocabulary/pages/WordPopover.svelte';
  import WordModal from '@modules/vocabulary/pages/WordModal.svelte';
  import MultiWordModal from '@modules/vocabulary/pages/MultiWordModal.svelte';
  import AudioPlayer from '@modules/text/pages/AudioPlayer.svelte';

  // `langId` is accepted in the config blob but resolved from the loaded text's
  // config (like the Alpine reader), so only `textId` is needed here.
  let { textId = 0 }: { textId?: number } = $props();

  // The three coupled stores (shared across the popover, modal and multi-word
  // modal — the same coupling the Alpine stores provided).
  const store = new WordStore();
  const wordForm = new WordFormStore();
  const multiWordForm = new MultiWordFormStore();

  // Reader-level UI state (was the `textReader` component's own state).
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let showAll = $state(false);
  let showTranslations = $state(true);
  let readerWidth = $state(100);
  let readerTextSize = $state(100);

  // Rendered text HTML. Reassigned ONLY on a full re-render (initial load +
  // show-all toggle); individual word changes patch the DOM imperatively, so
  // this string stays put and the {@html} block is left untouched.
  let textHtml = $state('');
  let textContainer = $state<HTMLElement | null>(null);

  // Debounce timers for persisting reader settings.
  let saveWidthTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTextSizeTimer: ReturnType<typeof setTimeout> | null = null;

  function getRenderSettings(): RenderSettings {
    return {
      showAll,
      showTranslations,
      rightToLeft: store.rightToLeft,
      textSize: store.textSize,
      showLearning: store.showLearning,
      displayStatTrans: store.displayStatTrans,
      modeTrans: store.modeTrans,
      annTextSize: store.annTextSize
    };
  }

  function renderTextContent(): void {
    textHtml = renderText(store.words, getRenderSettings());
  }

  function handleWordClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const wordEl = target.closest('.word, .mword') as HTMLElement | null;
    if (!wordEl) return;

    event.preventDefault();
    event.stopPropagation();

    const hex = wordEl.getAttribute('data_hex') || '';
    const position = parseInt(
      wordEl.getAttribute('data_order') || wordEl.getAttribute('data_pos') || '0',
      10
    );
    if (!hex) return;

    store.selectWord(hex, position, wordEl);
  }

  function toggleShowAll(): void {
    showAll = !showAll;
    store.showAll = showAll;
    renderTextContent();
  }

  function toggleTranslations(): void {
    showTranslations = !showTranslations;
    store.showTranslations = showTranslations;
    // Translations are shown/hidden via the `.hide-translations` CSS class
    // (bound reactively below) — no re-render, matching the Alpine version.
  }

  function debouncedSaveWidth(value: string): void {
    if (saveWidthTimer) clearTimeout(saveWidthTimer);
    saveWidthTimer = setTimeout(() => {
      void SettingsApi.save('set-reader-width', value);
    }, 300);
  }

  function debouncedSaveTextSize(value: string): void {
    if (saveTextSizeTimer) clearTimeout(saveTextSizeTimer);
    saveTextSizeTimer = setTimeout(() => {
      void SettingsApi.save('set-reader-text-size', value);
    }, 300);
  }

  function increaseTextSize(): void {
    readerTextSize = Math.min(readerTextSize + 10, 300);
    debouncedSaveTextSize(String(readerTextSize));
  }

  function decreaseTextSize(): void {
    readerTextSize = Math.max(readerTextSize - 10, 50);
    debouncedSaveTextSize(String(readerTextSize));
  }

  function onReaderWidthChange(event: Event): void {
    readerWidth = Number((event.target as HTMLInputElement).value);
    debouncedSaveWidth(String(readerWidth));
  }

  function updateWordDisplay(hex: string, status: number, wordId: number | null): void {
    updateWordStatusInDOM(hex, status, wordId);
  }

  async function markAllWellKnown(): Promise<void> {
    if (!confirm('Mark all unknown words as Well Known?')) return;

    statusMessage = null;
    try {
      const response = await TextsApi.markAllWellKnown(store.textId);
      if (response.error) {
        console.error('Failed to mark all well-known:', response.error);
        statusMessage = 'Failed to mark words as well-known.';
        return;
      }
      const words = response.data?.words ?? [];
      for (const word of words) {
        updateWordDisplay(word.hex, 99, word.wid);
        store.updateWordInStore(word.hex, { wordId: word.wid, status: 99 });
      }
      statusMessage = `Marked ${words.length} word${words.length !== 1 ? 's' : ''} as Well Known.`;
    } catch (err) {
      console.error('Error marking all well-known:', err);
      statusMessage = 'Error marking words as well-known.';
    }
  }

  async function markAllIgnored(): Promise<void> {
    if (!confirm('Mark all unknown words as Ignored?')) return;

    statusMessage = null;
    try {
      const response = await TextsApi.markAllIgnored(store.textId);
      if (response.error) {
        console.error('Failed to mark all ignored:', response.error);
        statusMessage = 'Failed to mark words as ignored.';
        return;
      }
      const words = response.data?.words ?? [];
      for (const word of words) {
        updateWordDisplay(word.hex, 98, word.wid);
        store.updateWordInStore(word.hex, { wordId: word.wid, status: 98 });
      }
      statusMessage = `Marked ${words.length} word${words.length !== 1 ? 's' : ''} as Ignored.`;
    } catch (err) {
      console.error('Error marking all ignored:', err);
      statusMessage = 'Error marking words as ignored.';
    }
  }

  async function loadBookNav(id: number): Promise<void> {
    const host = document.getElementById('book-context-nav');
    if (!host) return;
    try {
      const res = await TextsApi.getBookContext(id);
      const html = renderBookNav(res.data?.book ?? null);
      host.innerHTML = html;
      if (html !== '') {
        initIcons();
      }
    } catch (err) {
      console.error('Failed to load book navigation:', err);
    }
  }

  // Re-hydrate lucide icons after the toolbar/text render and whenever the
  // toggle icons or text change (matching the Alpine `initIcons()` calls).
  $effect(() => {
    void isLoading;
    void showAll;
    void showTranslations;
    void textHtml;
    void store.title;
    void tick().then(() => initIcons());
  });

  onMount(async () => {
    isLoading = true;
    error = null;

    try {
      if (!textId || textId === 0) {
        isLoading = false;
        return;
      }

      await store.loadText(textId);

      if (!store.isInitialized) {
        error = 'Failed to load text';
        isLoading = false;
        return;
      }

      // Initialize reader layout from the store.
      readerWidth = store.readerWidth;
      readerTextSize = store.textSize;
      store.showAll = showAll;
      store.showTranslations = showTranslations;

      // Render the text content (reader layout applies via reactive CSS below).
      renderTextContent();

      isLoading = false;

      // Wire native multi-word selection once #thetext is in the DOM. Its
      // callback opens our runes multi-word store (the Alpine path, with no
      // callback, still drives the Alpine store for the PWA build).
      await tick();
      if (textContainer) {
        setupMultiWordSelection(textContainer, (tid, position, text, count) => {
          void multiWordForm.loadForEdit(tid, position, text, count);
        });
      }

      // Book/chapter nav is non-critical chrome — load after the text is
      // readable so a slow/missing response never blocks reading.
      void loadBookNav(textId);
    } catch (err) {
      console.error('Error initializing text reader:', err);
      error = 'An error occurred while loading the text';
      isLoading = false;
    }
  });
</script>

<div class="reading-page">
  <!-- Reading toolbar -->
  <div class="box py-2 px-4 mb-0" style="border-radius: 0;">
    <div class="level is-mobile">
      <div class="level-left">
        <div class="level-item">
          <strong>{store.title || 'Loading...'}</strong>
        </div>
      </div>
      <div class="level-right">
        <div class="level-item">
          <div class="field is-grouped is-grouped-multiline">
            <div class="control">
              <a href="/review?text={textId}" class="button is-small">Review</a>
            </div>
            <div class="control">
              <a href="/texts/{textId}/edit" class="button is-small">Edit</a>
            </div>
            <!-- Display settings dropdown -->
            <div class="control">
              <div class="dropdown is-hoverable is-right">
                <div class="dropdown-trigger">
                  <button class="button is-small">
                    <span class="icon is-small">
                      <i data-lucide="sliders" style="width:14px;height:14px"></i>
                    </span>
                    <span>Display</span>
                  </button>
                </div>
                <div class="dropdown-menu" style="min-width:220px">
                  <div class="dropdown-content">
                    <!-- Toggles -->
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
                    <a class="dropdown-item" role="button" tabindex="0" onclick={(e) => { e.preventDefault(); toggleShowAll(); }}>
                      <span class="icon is-small mr-2">
                        {#if showAll}
                          <i data-lucide="square-check-big" style="width:14px;height:14px"></i>
                        {:else}
                          <i data-lucide="square" style="width:14px;height:14px"></i>
                        {/if}
                      </span>
                      Multi-word expressions
                    </a>
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
                    <a class="dropdown-item" role="button" tabindex="0" onclick={(e) => { e.preventDefault(); toggleTranslations(); }}>
                      <span class="icon is-small mr-2">
                        {#if showTranslations}
                          <i data-lucide="square-check-big" style="width:14px;height:14px"></i>
                        {:else}
                          <i data-lucide="square" style="width:14px;height:14px"></i>
                        {/if}
                      </span>
                      Translations
                    </a>
                    <hr class="dropdown-divider" />
                    <!-- Text size -->
                    <div class="dropdown-item">
                      <span class="label is-small mb-1">Text size</span>
                      <div class="field has-addons">
                        <p class="control">
                          <button class="button is-small" onclick={decreaseTextSize} aria-label="Decrease text size">
                            <span class="icon is-small">
                              <i data-lucide="minus" style="width:12px;height:12px"></i>
                            </span>
                          </button>
                        </p>
                        <p class="control">
                          <span class="button is-small is-static" style="min-width:3.5em">{readerTextSize}%</span>
                        </p>
                        <p class="control">
                          <button class="button is-small" onclick={increaseTextSize} aria-label="Increase text size">
                            <span class="icon is-small">
                              <i data-lucide="plus" style="width:12px;height:12px"></i>
                            </span>
                          </button>
                        </p>
                      </div>
                    </div>
                    <!-- Reader width -->
                    <div class="dropdown-item">
                      <label class="label is-small mb-1" for="reader-width-range">Reading width</label>
                      <input
                        id="reader-width-range"
                        type="range"
                        min="40"
                        max="100"
                        step="5"
                        value={readerWidth}
                        oninput={onReaderWidthChange}
                        style="width:100%"
                        title="Reading area width"
                      />
                    </div>
                    <hr class="dropdown-divider" />
                    <!-- Print -->
                    <a class="dropdown-item" href="/text/{textId}/print-plain">
                      <span class="icon is-small mr-2">
                        <i data-lucide="printer" style="width:14px;height:14px"></i>
                      </span>
                      Print
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <!-- Actions dropdown -->
            <div class="control">
              <div class="dropdown is-hoverable is-right">
                <div class="dropdown-trigger">
                  <button class="button is-small">Actions</button>
                </div>
                <div class="dropdown-menu">
                  <div class="dropdown-content">
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
                    <a class="dropdown-item" role="button" tabindex="0" onclick={(e) => { e.preventDefault(); markAllWellKnown(); }}>
                      Mark all Well Known
                    </a>
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
                    <a class="dropdown-item" role="button" tabindex="0" onclick={(e) => { e.preventDefault(); markAllIgnored(); }}>
                      Mark all Ignored
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Audio player (Svelte island, between the toolbar and the text — the
       original read_desktop.php position). Mounted only when the loaded text has
       an audio source; it fetches its own config + player settings from
       /texts/{id}/audio and reveals itself once that resolves. -->
  {#if store.audioUri}
    <AudioPlayer textId={store.textId} />
  {/if}

  <!-- Chapter navigation: client-rendered from /texts/{id}/book-context. -->
  <div id="book-context-nav"></div>

  <!-- Loading state -->
  {#if isLoading}
    <div class="has-text-centered py-6">
      <div class="loading-spinner"></div>
      <p class="mt-4 has-text-grey">Loading text...</p>
    </div>
  {/if}

  <!-- Error state -->
  {#if error}
    <div class="notification is-danger mx-4 mt-4">
      <button class="delete" aria-label="Dismiss error" onclick={() => (error = null)}></button>
      <p>{error}</p>
    </div>
  {/if}

  <!-- Status message (mark-all feedback) -->
  {#if statusMessage}
    <div class="notification is-info is-light mx-4 mt-2 py-2 px-4">
      <button class="delete is-small" aria-label="Dismiss message" onclick={() => (statusMessage = null)}></button>
      <span>{statusMessage}</span>
    </div>
  {/if}

  <!-- Text content -->
  {#if !isLoading && !error}
    <div class="reading-content p-4" style={readerWidth < 100 ? `max-width: ${readerWidth}%` : ''}>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        id="thetext"
        class="content"
        class:hide-translations={!showTranslations}
        style="font-size: {readerTextSize}%; {store.rightToLeft ? 'direction: rtl;' : ''}"
        bind:this={textContainer}
        onclick={handleWordClick}
      >
        <!-- Client-rendered word HTML (text_renderer output); CSP-safe — renderer
             output, not eval/user input. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html textHtml}
      </div>
    </div>
  {/if}

  <!-- Coupled word-interaction islands (share the stores above) -->
  <WordPopover {store} />
  <WordModal {store} {wordForm} />
  <MultiWordModal {multiWordForm} />
</div>
