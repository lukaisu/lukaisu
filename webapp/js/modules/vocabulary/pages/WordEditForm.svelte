<!--
  Word Edit Form — Svelte 5 port of the Alpine `wordEditForm` component.

  The reactive term create/edit form shown inside the word modal. Driven by the
  runes `WordFormStore` (field state, validation, dirty detection, similar terms,
  tag autocomplete); on save it writes the result back into the shared
  `WordStore` and patches the rendered reading text in place
  (`updateWordStatusInDOM` / `updateWordTranslationInDOM`), exactly as the Alpine
  component did. Close/cancel is signalled to the parent modal through the form
  store's `shouldCloseModal` / `shouldReturnToInfo` flags.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import {
    updateWordStatusInDOM,
    updateWordTranslationInDOM
  } from '@modules/text/pages/reading/text_renderer';
  import type { SimilarTermForEdit } from '@modules/vocabulary/api/terms_api';
  import type { WordFormStore } from '@modules/vocabulary/stores/word_form_store.svelte';
  import type { WordStore } from '@modules/vocabulary/stores/word_store.svelte';

  interface StatusInfo {
    value: number;
    label: string;
    abbr: string;
  }

  // Settable status options (issue #238, Phase 2). Learning level 1-5 is derived
  // from FSRS, so the picker only offers start-Learning / Well-known / Ignored.
  // Computed once here — i18n is booted before this island mounts.
  function buildStatuses(): StatusInfo[] {
    const learning = t('common.status_learning');
    const wellKnown = t('common.status_well_known');
    const ignored = t('common.status_ignored');
    return [
      { value: 1, label: learning, abbr: learning },
      { value: 99, label: wellKnown, abbr: wellKnown },
      { value: 98, label: ignored, abbr: ignored }
    ];
  }
  const statuses = buildStatuses();

  let { wordForm, store }: { wordForm: WordFormStore; store: WordStore } = $props();

  // Tag input state
  let tagInput = $state('');
  let showTagSuggestions = $state(false);
  let filteredTags = $state<string[]>([]);

  type FormDataField = 'translation' | 'romanization' | 'sentence' | 'notes';

  function hasFieldError(field: FormDataField): boolean {
    return !!wordForm.errors[field];
  }
  function getFieldError(field: FormDataField): string | null {
    return wordForm.errors[field] ?? null;
  }
  function validateField(field: keyof typeof wordForm.formData): void {
    wordForm.validateField(field);
  }
  function clearGeneralError(): void {
    wordForm.errors.general = null;
  }
  function setFormStatus(value: number): void {
    wordForm.formData.status = value;
  }
  function getStatusClass(status: number): string {
    switch (status) {
      case 1:
        return 'is-danger';
      case 2:
        return 'is-warning';
      case 3:
        return 'is-info';
      case 4:
        return 'is-primary';
      case 5:
      case 99:
        return 'is-success';
      case 98:
        return 'is-light';
      default:
        return '';
    }
  }
  function getStatusButtonClass(status: number): string {
    const colorClass = getStatusClass(status);
    const outlined = wordForm.formData.status !== status ? ' is-outlined' : '';
    return colorClass + outlined;
  }
  function getSimilarTermDisplay(term: SimilarTermForEdit): string {
    return term.translation ? ': ' + term.translation : '';
  }

  async function save(): Promise<void> {
    const result = await wordForm.save();

    if (result.success && result.hex) {
      const hex = result.hex;
      const status = wordForm.formData.status;
      const translation = wordForm.formData.translation;
      const romanization = wordForm.formData.romanization;
      const wordId = result.wordId ?? null;

      // Update the shared word store with new data.
      store.updateWordInStore(hex, {
        wordId,
        status,
        translation,
        romanization,
        tags: wordForm.formData.tags.join(', ')
      });

      // Patch the rendered reading text in place (no full re-render).
      updateWordStatusInDOM(hex, status, wordId);
      updateWordTranslationInDOM(hex, translation, romanization);

      // Signal the modal to close.
      wordForm.shouldCloseModal = true;
    }
  }

  function cancel(): void {
    if (wordForm.isDirty) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return;
      }
    }
    wordForm.shouldReturnToInfo = true;
  }

  function addTag(tag: string): void {
    tag = tag.trim();
    if (tag && !wordForm.formData.tags.includes(tag)) {
      wordForm.formData.tags.push(tag);
    }
    tagInput = '';
    showTagSuggestions = false;
  }

  function removeTag(tag: string): void {
    const index = wordForm.formData.tags.indexOf(tag);
    if (index > -1) {
      wordForm.formData.tags.splice(index, 1);
    }
  }

  function filterTags(): void {
    const input = tagInput.toLowerCase().trim();
    if (!input) {
      filteredTags = [];
      showTagSuggestions = false;
      return;
    }
    filteredTags = wordForm.allTags
      .filter((tag) => tag.toLowerCase().startsWith(input) && !wordForm.formData.tags.includes(tag))
      .slice(0, 8);
    showTagSuggestions = filteredTags.length > 0;
  }

  function selectTagSuggestion(tag: string): void {
    addTag(tag);
  }

  function hideTagSuggestions(): void {
    // Delay hiding to allow click on a suggestion.
    setTimeout(() => {
      showTagSuggestions = false;
    }, 200);
  }

  function copyFromSimilar(term: SimilarTermForEdit): void {
    if (term.translation) {
      wordForm.copyTranslationFromSimilar(term.translation);
    }
  }

  // Re-hydrate lucide icons whenever the rendered icon set changes (similar
  // terms / tags add/remove `<i data-lucide>` nodes).
  $effect(() => {
    void wordForm.similarTerms.length;
    void wordForm.formData.tags.length;
    void tick().then(() => initIcons());
  });
</script>

<div>
  <!-- General error message -->
  {#if wordForm.errors.general}
    <div class="notification is-danger is-light mb-4">
      <button class="delete" aria-label="Dismiss error" onclick={clearGeneralError}></button>
      <span>{wordForm.errors.general}</span>
    </div>
  {/if}

  <!-- Term (read-only) -->
  <div class="field">
    <label class="label is-small" for="word-edit-term">Term</label>
    <div class="control">
      <input id="word-edit-term" class="input" type="text" value={wordForm.formData.text} disabled />
    </div>
  </div>

  <!-- Translation -->
  <div class="field">
    <label class="label is-small" for="word-edit-translation">
      Translation <span class="has-text-danger">*</span>
    </label>
    <div class="control">
      <textarea
        id="word-edit-translation"
        class="textarea"
        class:is-danger={hasFieldError('translation')}
        bind:value={wordForm.formData.translation}
        onblur={() => validateField('translation')}
        rows="2"
        placeholder="Enter translation..."
      ></textarea>
    </div>
    {#if hasFieldError('translation')}
      <p class="help is-danger">{getFieldError('translation')}</p>
    {/if}
  </div>

  <!-- Romanization (if enabled for language) -->
  {#if wordForm.showRomanization}
    <div class="field">
      <label class="label is-small" for="word-edit-romanization">Romanization</label>
      <div class="control">
        <input
          id="word-edit-romanization"
          class="input"
          class:is-danger={hasFieldError('romanization')}
          type="text"
          bind:value={wordForm.formData.romanization}
          onblur={() => validateField('romanization')}
          placeholder="Enter romanization..."
        />
      </div>
      {#if hasFieldError('romanization')}
        <p class="help is-danger">{getFieldError('romanization')}</p>
      {/if}
    </div>
  {/if}

  <!-- Sentence -->
  <div class="field">
    <label class="label is-small" for="word-edit-sentence">Example Sentence</label>
    <div class="control">
      <textarea
        id="word-edit-sentence"
        class="textarea"
        class:is-danger={hasFieldError('sentence')}
        bind:value={wordForm.formData.sentence}
        onblur={() => validateField('sentence')}
        rows="2"
        placeholder="Example sentence with {'{term}'} in braces..."
      ></textarea>
    </div>
    {#if hasFieldError('sentence')}
      <p class="help is-danger">{getFieldError('sentence')}</p>
    {/if}
    <p class="help">Use {'{curly braces}'} around the term</p>
  </div>

  <!-- Notes -->
  <div class="field">
    <label class="label is-small" for="word-edit-notes">Notes</label>
    <div class="control">
      <textarea
        id="word-edit-notes"
        class="textarea"
        class:is-danger={hasFieldError('notes')}
        bind:value={wordForm.formData.notes}
        onblur={() => validateField('notes')}
        rows="2"
        placeholder="Personal notes about this term..."
      ></textarea>
    </div>
    {#if hasFieldError('notes')}
      <p class="help is-danger">{getFieldError('notes')}</p>
    {/if}
  </div>

  <!-- Status -->
  <div class="field">
    <span class="label is-small">Status</span>
    <div class="buttons are-small">
      {#each statuses as s (s.value)}
        <button
          type="button"
          class="button {getStatusButtonClass(s.value)}"
          onclick={() => setFormStatus(s.value)}
        >{s.abbr}</button>
      {/each}
    </div>
  </div>

  <!-- Tags -->
  <div class="field">
    <span class="label is-small">Tags</span>
    <div class="control">
      <!-- Current tags -->
      {#if wordForm.formData.tags.length > 0}
        <div class="tags mb-2">
          {#each wordForm.formData.tags as tag (tag)}
            <span class="tag is-info is-light">
              <span>{tag}</span>
              <button type="button" class="delete is-small" aria-label="Remove tag" onclick={() => removeTag(tag)}></button>
            </span>
          {/each}
        </div>
      {/if}
      <!-- Tag input with autocomplete -->
      <div class="dropdown" class:is-active={showTagSuggestions}>
        <div class="dropdown-trigger" style="width: 100%;">
          <input
            class="input is-small"
            type="text"
            bind:value={tagInput}
            oninput={filterTags}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            onblur={hideTagSuggestions}
            placeholder="Add tag..."
          />
        </div>
        <div class="dropdown-menu" role="menu" style="width: 100%;">
          <div class="dropdown-content">
            {#each filteredTags as tag (tag)}
              <!-- mousedown (not click) so it fires before the input's blur hides the menu. -->
              <button
                type="button"
                class="dropdown-item"
                style="width: 100%; text-align: left;"
                onmousedown={(e) => {
                  e.preventDefault();
                  selectTagSuggestion(tag);
                }}>{tag}</button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Similar Terms -->
  {#if wordForm.similarTerms.length > 0}
    <div class="field">
      <span class="label is-small">Similar Terms</span>
      <div class="is-size-7">
        {#each wordForm.similarTerms as term (term.id)}
          <div class="is-flex is-justify-content-space-between is-align-items-center py-1" style="border-bottom: 1px solid #f0f0f0;">
            <div>
              <span class="has-text-weight-semibold">{term.text}</span>
              <span class="has-text-grey">{getSimilarTermDisplay(term)}</span>
            </div>
            {#if term.translation}
              <button type="button" class="button is-small is-ghost" onclick={() => copyFromSimilar(term)} title="Copy translation" aria-label="Copy translation">
                <i data-lucide="copy" class="icon" style="width:12px;height:12px"></i>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Action buttons -->
  <div class="field is-grouped mt-5">
    <div class="control">
      <button
        type="button"
        class="button is-primary"
        class:is-loading={wordForm.isSubmitting}
        disabled={!wordForm.canSubmit}
        onclick={save}
      >
        <i data-lucide="save" class="icon" style="width:16px;height:16px"></i>
        <span class="ml-1">Save</span>
      </button>
    </div>
    <div class="control">
      <button type="button" class="button" onclick={cancel} disabled={wordForm.isSubmitting}>Cancel</button>
    </div>
  </div>
</div>
