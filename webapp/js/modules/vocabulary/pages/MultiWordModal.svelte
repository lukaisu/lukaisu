<!--
  Multi-Word Modal — Svelte 5 port of the Alpine `multiWordModal` component.

  A Bulma modal for creating/editing a multi-word expression. It is opened by the
  reader's native text-selection handler (`setupMultiWordSelection` →
  `multiWordForm.loadForEdit(...)`), and driven by the runes
  `MultiWordFormStore` (field state, validation, save). Behaviour matches the
  Alpine version; only the rendering and reactivity are Svelte.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { trapFocus, releaseFocus } from '@shared/accessibility/focus_trap';
  import { announce } from '@shared/accessibility/aria_live';
  import type { MultiWordFormStore } from '@modules/vocabulary/stores/multi_word_form_store.svelte';

  let { multiWordForm }: { multiWordForm: MultiWordFormStore } = $props();

  let modalCardEl = $state<HTMLElement | null>(null);

  const isOpen = $derived(multiWordForm.isVisible);
  const isLoading = $derived(multiWordForm.isLoading);
  const modalTitle = $derived(
    multiWordForm.isNewWord
      ? `New Multi-Word Expression (${multiWordForm.formData.wordCount} words)`
      : `Edit Multi-Word Expression (${multiWordForm.formData.wordCount} words)`
  );
  const wordCountLabel = $derived(multiWordForm.formData.wordCount + ' words');

  // When the modal becomes visible, hydrate icons + trap focus + announce.
  $effect(() => {
    if (!multiWordForm.isVisible) return;
    void tick().then(() => {
      initIcons();
      if (modalCardEl) {
        trapFocus(modalCardEl);
      }
      announce(modalTitle);
    });
  });

  // Close on Escape while open.
  $effect(() => {
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && multiWordForm.isVisible) {
        close();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  function clearGeneralError(): void {
    multiWordForm.errors.general = null;
  }
  function validateField(field: 'translation' | 'romanization' | 'sentence'): void {
    multiWordForm.validateField(field);
  }

  function close(): void {
    releaseFocus();
    multiWordForm.close();
  }

  async function save(): Promise<void> {
    const result = await multiWordForm.save();
    if (result.success) {
      releaseFocus();
      multiWordForm.reset();
    }
    // On error, errors.general is set and displayed.
  }
</script>

<div class="modal" class:is-active={isOpen} role="dialog" aria-modal="true" aria-labelledby="multi-word-modal-title">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-background" onclick={close}></div>
  <div class="modal-card" style="max-width: 500px;" bind:this={modalCardEl}>
    <header class="modal-card-head py-3">
      <p class="modal-card-title is-size-6" id="multi-word-modal-title">{modalTitle}</p>
      <button
        class="delete"
        aria-label="Close dialog"
        onclick={close}
        disabled={isLoading || multiWordForm.isSubmitting}
      ></button>
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

      <!-- Form content -->
      {#if !isLoading}
        <div>
          <!-- General error message -->
          {#if multiWordForm.errors.general}
            <div class="notification is-danger is-light mb-4">
              <button class="delete" aria-label="Dismiss error" onclick={clearGeneralError}></button>
              <span>{multiWordForm.errors.general}</span>
            </div>
          {/if}

          <!-- Multi-word text (read-only) -->
          <div class="field">
            <label class="label is-small" for="multi-word-text">Multi-Word Expression</label>
            <div class="control">
              <input id="multi-word-text" class="input" type="text" value={multiWordForm.formData.text} disabled />
            </div>
            <p class="help">{wordCountLabel}</p>
          </div>

          <!-- Translation -->
          <div class="field">
            <label class="label is-small" for="multi-word-translation">Translation</label>
            <div class="control">
              <textarea
                id="multi-word-translation"
                class="textarea"
                class:is-danger={!!multiWordForm.errors.translation}
                bind:value={multiWordForm.formData.translation}
                onblur={() => validateField('translation')}
                rows="2"
                placeholder="Enter translation..."
              ></textarea>
            </div>
            {#if multiWordForm.errors.translation}
              <p class="help is-danger">{multiWordForm.errors.translation}</p>
            {/if}
          </div>

          <!-- Romanization (if enabled for language) -->
          {#if multiWordForm.showRomanization}
            <div class="field">
              <label class="label is-small" for="multi-word-romanization">Romanization</label>
              <div class="control">
                <input
                  id="multi-word-romanization"
                  class="input"
                  class:is-danger={!!multiWordForm.errors.romanization}
                  type="text"
                  bind:value={multiWordForm.formData.romanization}
                  onblur={() => validateField('romanization')}
                  placeholder="Enter romanization..."
                />
              </div>
              {#if multiWordForm.errors.romanization}
                <p class="help is-danger">{multiWordForm.errors.romanization}</p>
              {/if}
            </div>
          {/if}

          <!-- Sentence -->
          <div class="field">
            <label class="label is-small" for="multi-word-sentence">Example Sentence</label>
            <div class="control">
              <textarea
                id="multi-word-sentence"
                class="textarea"
                class:is-danger={!!multiWordForm.errors.sentence}
                bind:value={multiWordForm.formData.sentence}
                onblur={() => validateField('sentence')}
                rows="2"
                placeholder="Example sentence with {'{term}'} in braces..."
              ></textarea>
            </div>
            {#if multiWordForm.errors.sentence}
              <p class="help is-danger">{multiWordForm.errors.sentence}</p>
            {/if}
            <p class="help">Use {'{curly braces}'} around the term</p>
          </div>

          <!-- New multi-word expressions start as Learning; the level 1-5 is then
               derived from FSRS, not hand-set (issue #238). -->

          <!-- Action buttons -->
          <div class="field is-grouped mt-5">
            <div class="control">
              <button
                type="button"
                class="button is-primary"
                class:is-loading={multiWordForm.isSubmitting}
                disabled={!multiWordForm.canSubmit}
                onclick={save}
              >
                <i data-lucide="save" class="icon" style="width:16px;height:16px"></i>
                <span class="ml-1">Save</span>
              </button>
            </div>
            <div class="control">
              <button type="button" class="button" onclick={close} disabled={multiWordForm.isSubmitting}>Cancel</button>
            </div>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>
