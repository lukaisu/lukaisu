<!--
  Word Modal — Svelte 5 port of the Alpine `wordModal` component (+ its nested
  `wordEditForm`, here the child `WordEditForm.svelte`).

  A centered Bulma modal for editing a term. Opened from the popover's "Edit"
  (`store.openEditModal()`), it loads the edit form via the runes `WordFormStore`
  and shows it; on save/cancel the form store raises `shouldCloseModal` /
  `shouldReturnToInfo`, which this component watches to reset and close — the same
  flag-based handoff the Alpine component used. The (rarely reached) info view is
  ported too, to match read.html exactly. State coordination flows entirely
  through the shared `WordStore` / `WordFormStore`.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { speechDispatcher } from '@shared/utils/user_interactions';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { trapFocus, releaseFocus } from '@shared/accessibility/focus_trap';
  import { announce } from '@shared/accessibility/aria_live';
  import { t } from '@shared/i18n/translator';
  import { parseInlineMarkdown } from '@shared/utils/inline_markdown';
  import type { WordStore } from '@modules/vocabulary/stores/word_store.svelte';
  import type { WordFormStore } from '@modules/vocabulary/stores/word_form_store.svelte';
  import WordEditForm from './WordEditForm.svelte';

  interface StatusInfo {
    value: number;
    label: string;
    abbr: string;
    class: string;
  }

  // Status definitions (info view). Computed once — i18n is booted before mount.
  function buildStatuses(): StatusInfo[] {
    const learning = t('common.status_learning');
    const learned = t('common.status_learned');
    const wellKnown = t('common.status_well_known');
    const ignored = t('common.status_ignored');
    return [
      { value: 1, label: `${learning} (1)`, abbr: '1', class: 'is-danger' },
      { value: 2, label: `${learning} (2)`, abbr: '2', class: 'is-warning' },
      { value: 3, label: `${learning} (3)`, abbr: '3', class: 'is-info' },
      { value: 4, label: `${learning} (4)`, abbr: '4', class: 'is-primary' },
      { value: 5, label: learned, abbr: '5', class: 'is-success' },
      { value: 99, label: wellKnown, abbr: wellKnown, class: 'is-success is-light' },
      { value: 98, label: ignored, abbr: ignored, class: 'is-light' }
    ];
  }
  const STATUSES = buildStatuses();

  let { store, wordForm }: { store: WordStore; wordForm: WordFormStore } = $props();

  type ViewMode = 'info' | 'edit';
  let viewMode = $state<ViewMode>('info');
  let modalCardEl = $state<HTMLElement | null>(null);

  // --- Derived word view ------------------------------------------------------
  const word = $derived(store.getSelectedWord());
  const isOpen = $derived(store.isEditModalOpen);
  const isLoading = $derived(store.isLoading || wordForm.isLoading);
  const isUnknown = $derived(!word || word.status === 0);
  const wordText = $derived(word ? word.text : '');
  const wordTranslation = $derived(word ? word.translation : '');
  const wordRomanization = $derived(word ? word.romanization : '');
  const wordNotes = $derived(word ? (word.notes ?? '') : '');
  const wordTags = $derived(word ? (word.tags ?? '') : '');
  const hasTranslation = $derived(!!word && !isUnknown && !!word.translation);
  const hasRomanization = $derived(!!word && !!word.romanization);
  const hasNotes = $derived(!!word && !isUnknown && !!word.notes);
  const hasTags = $derived(!!word && !isUnknown && !!word.tags);
  const hasWordId = $derived(!!word && !!word.wordId);

  const modalTitle = $derived.by(() => {
    if (viewMode === 'edit') {
      return wordForm.isNewWord ? 'Add Term' : 'Edit Term';
    }
    if (isUnknown) {
      return 'New Word';
    }
    return 'Word';
  });

  // --- Open/close coordination ------------------------------------------------
  let modalWasOpen = false;

  // When the modal opens, load + show the edit form (matches the Alpine
  // auto-showEditForm). `untrack` keeps the synchronous store reads inside the
  // flow from becoming effect dependencies (we only want to react to the open
  // flag transition).
  $effect(() => {
    const open = store.isEditModalOpen;
    untrack(() => {
      if (open && !modalWasOpen) {
        modalWasOpen = true;
        void showEditForm();
      } else if (!open && modalWasOpen) {
        modalWasOpen = false;
      }
    });
  });

  // Form store signals to close the modal (after a successful save).
  $effect(() => {
    if (wordForm.shouldCloseModal) {
      untrack(() => {
        wordForm.shouldCloseModal = false;
        viewMode = 'info';
        wordForm.reset();
        releaseFocus();
        store.closeEditModal();
      });
    }
  });

  // Form store signals to cancel the edit (return to info / close modal).
  $effect(() => {
    if (wordForm.shouldReturnToInfo) {
      untrack(() => {
        wordForm.shouldReturnToInfo = false;
        viewMode = 'info';
        wordForm.reset();
        releaseFocus();
        store.closeEditModal();
      });
    }
  });

  // Close on Escape while open.
  $effect(() => {
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && store.isEditModalOpen) {
        close();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  async function showEditForm(): Promise<void> {
    const w = store.getSelectedWord();
    if (!w) return;

    await wordForm.loadForEdit(store.textId, w.position, w.wordId ?? undefined);
    viewMode = 'edit';

    await tick();
    initIcons();
    if (modalCardEl) {
      trapFocus(modalCardEl);
    }
    announce(modalTitle);
  }

  function close(): void {
    if (wordForm.isDirty) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
      wordForm.reset();
    }
    releaseFocus();
    store.closeEditModal();
  }

  // --- Info-view actions ------------------------------------------------------
  function speakWord(): void {
    if (word && store.langId) {
      void speechDispatcher(word.text, store.langId);
    }
  }
  async function setStatus(status: number): Promise<void> {
    if (!word) return;
    await store.setStatus(word.hex, status);
    const statusInfo = STATUSES.find((s) => s.value === status);
    announce(`Changed to ${statusInfo?.label || 'status ' + status}`);
  }
  async function markWellKnown(): Promise<void> {
    if (!word) return;
    await store.createQuickWord(word.hex, word.position, 99);
  }
  async function markIgnored(): Promise<void> {
    if (!word) return;
    await store.createQuickWord(word.hex, word.position, 98);
  }
  async function deleteWord(): Promise<void> {
    if (!word) return;
    if (confirm('Delete this term?')) {
      await store.deleteWord(word.hex);
    }
  }
  function getDictUrl(which: 'dict1' | 'dict2' | 'translator'): string {
    return store.getDictUrl(which);
  }
  function hasDictUrl(which: 'dict1' | 'dict2' | 'translator'): boolean {
    return store.hasDictUrl(which);
  }
  function isCurrentStatus(status: number): boolean {
    return word ? word.status === status : false;
  }
  function getStatusButtonClass(status: number): string {
    const statusInfo = STATUSES.find((s) => s.value === status);
    const baseClass = statusInfo?.class || '';
    if (isCurrentStatus(status)) {
      return `button is-small ${baseClass}`;
    }
    return `button is-small is-outlined ${baseClass}`;
  }
</script>

<div class="modal" class:is-active={isOpen} role="dialog" aria-modal="true" aria-labelledby="word-modal-title">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-background" onclick={close}></div>
  <div class="modal-card" style="max-width: 500px;" bind:this={modalCardEl}>
    <header class="modal-card-head py-3">
      <p class="modal-card-title is-size-6" id="word-modal-title">{modalTitle}</p>
      <button class="delete" aria-label="Close dialog" onclick={close} disabled={isLoading}></button>
    </header>
    <section class="modal-card-body">
      <!-- Loading overlay -->
      {#if isLoading}
        <div class="has-text-centered py-4">
          <span class="icon is-large">
            <i data-lucide="loader-2" class="icon-spin" style="width:24px;height:24px" aria-hidden="true"></i>
          </span>
          <p class="mt-2">Loading...</p>
        </div>
      {/if}

      <!-- INFO VIEW -->
      {#if viewMode === 'info' && word && !isLoading}
        <div>
          <!-- Word text and audio -->
          <div class="is-flex is-justify-content-space-between is-align-items-center mb-3">
            <span class="is-size-4 has-text-weight-bold">{wordText}</span>
            <button class="button is-small is-rounded" onclick={speakWord} title="Listen" aria-label="Listen">
              <i data-lucide="volume-2" class="icon" style="width:16px;height:16px"></i>
            </button>
          </div>

          <!-- Translation/Romanization for known words -->
          {#if hasTranslation}
            <div class="mb-3">
              <!-- Server/user markdown; CSP-safe (parseInlineMarkdown escapes first). -->
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <p class="has-text-grey-dark">{@html parseInlineMarkdown(wordTranslation)}</p>
              {#if hasRomanization}
                <p class="is-size-7 has-text-grey">{wordRomanization}</p>
              {/if}
            </div>
          {/if}

          <!-- Notes for known words -->
          {#if hasNotes}
            <div class="mb-3">
              <p class="is-size-7 has-text-grey mb-1">Notes:</p>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <p class="has-text-grey-dark is-size-7">{@html parseInlineMarkdown(wordNotes)}</p>
            </div>
          {/if}

          <!-- Tags if present -->
          {#if hasTags}
            <div class="mb-3">
              <span class="tag is-info is-light">{wordTags}</span>
            </div>
          {/if}

          <!-- Status actions for known words (issue #238). -->
          {#if !isUnknown}
            <div class="mb-4">
              <p class="is-size-7 has-text-grey mb-2">Status:</p>
              <div class="buttons are-small">
                <button class={getStatusButtonClass(1)} disabled={isLoading} onclick={() => setStatus(1)}>Learning</button>
                <button class="button {isCurrentStatus(99) ? 'is-success' : 'is-outlined is-success'}" disabled={isLoading} onclick={() => setStatus(99)}>Well Known</button>
                <button class="button {isCurrentStatus(98) ? 'is-warning' : 'is-outlined is-warning'}" disabled={isLoading} onclick={() => setStatus(98)}>Ignored</button>
              </div>
            </div>
          {/if}

          <!-- Quick actions for unknown words -->
          {#if isUnknown}
            <div class="mb-4">
              <p class="is-size-7 has-text-grey mb-2">Quick actions:</p>
              <div class="buttons">
                <button class="button is-success" disabled={isLoading} onclick={markWellKnown}>
                  <i data-lucide="check" class="icon" style="width:16px;height:16px"></i>
                  <span class="ml-1">I know this well</span>
                </button>
                <button class="button is-warning" disabled={isLoading} onclick={markIgnored}>
                  <i data-lucide="x" class="icon" style="width:16px;height:16px"></i>
                  <span class="ml-1">Ignore</span>
                </button>
              </div>
            </div>
          {/if}

          <!-- Edit/Delete for known words -->
          {#if !isUnknown && hasWordId}
            <div class="mb-4">
              <div class="buttons are-small">
                <button class="button is-info is-outlined" onclick={showEditForm} disabled={isLoading}>
                  <i data-lucide="edit" class="icon" style="width:14px;height:14px"></i>
                  <span class="ml-1">Edit</span>
                </button>
                <button class="button is-danger is-outlined" disabled={isLoading} onclick={deleteWord}>
                  <i data-lucide="trash-2" class="icon" style="width:14px;height:14px"></i>
                  <span class="ml-1">Delete</span>
                </button>
              </div>
            </div>
          {/if}

          <!-- Edit link for unknown words -->
          {#if isUnknown}
            <div class="mb-4">
              <button class="button is-info" onclick={showEditForm} disabled={isLoading}>
                <i data-lucide="edit" class="icon" style="width:16px;height:16px"></i>
                <span class="ml-1">Add with translation</span>
              </button>
            </div>
          {/if}

          <!-- Dictionary links -->
          {#if hasDictUrl('dict1') || hasDictUrl('dict2') || hasDictUrl('translator')}
            <div class="pt-3" style="border-top: 1px solid #dbdbdb;">
              <p class="is-size-7 has-text-grey mb-2">Lookup:</p>
              <div class="buttons are-small">
                {#if hasDictUrl('dict1')}
                  <a href={getDictUrl('dict1')} target="_blank" class="button is-outlined is-link" rel="noopener">
                    <i data-lucide="book-open" class="icon" style="width:14px;height:14px"></i>
                    <span class="ml-1">Dict 1</span>
                  </a>
                {/if}
                {#if hasDictUrl('dict2')}
                  <a href={getDictUrl('dict2')} target="_blank" class="button is-outlined is-link" rel="noopener">
                    <i data-lucide="book-open" class="icon" style="width:14px;height:14px"></i>
                    <span class="ml-1">Dict 2</span>
                  </a>
                {/if}
                {#if hasDictUrl('translator')}
                  <a href={getDictUrl('translator')} target="_blank" class="button is-outlined is-link" rel="noopener">
                    <i data-lucide="languages" class="icon" style="width:14px;height:14px"></i>
                    <span class="ml-1">Translate</span>
                  </a>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- EDIT VIEW -->
      {#if viewMode === 'edit' && !isLoading}
        <WordEditForm {wordForm} {store} />
      {/if}
    </section>
  </div>
</div>
