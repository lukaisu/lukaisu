<!--
  Word Popover — Svelte 5 port of the Alpine `wordPopover` component.

  A non-blocking popover positioned near the clicked word, so the reader can keep
  reading while viewing/editing a word's status. Driven by the runes `WordStore`
  (the same store the reader and modal share): it reads the selected word and the
  target element the reader recorded on click, computes a viewport-aware position
  (the ported `calculatePosition`), and proxies status changes / quick-create /
  delete / "open edit" back to the store. Behaviour matches the Alpine version;
  only the rendering and reactivity are Svelte.

  The `.word-popover*` classes are global (css/base/styles.css, loaded by
  main.ts), so they style this island's markup directly — no scoped styles here.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { speechDispatcher } from '@shared/utils/user_interactions';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { announce } from '@shared/accessibility/aria_live';
  import { orderedStatuses } from '@shared/stores/statuses';
  import type { WordStore } from '@modules/vocabulary/stores/word_store.svelte';

  interface StatusInfo {
    value: number;
    label: string;
    abbr: string;
    class: string;
  }

  // Status buttons, derived from the single status store (issue #238). Order:
  // learning 1-5, then well-known, then ignored.
  const STATUSES: StatusInfo[] = orderedStatuses([1, 2, 3, 4, 5, 99, 98]).map((d) => ({
    value: d.value,
    label: d.label,
    abbr: d.abbr,
    class: d.buttonClass
  }));

  const POPOVER_CONFIG = { offsetY: 8, minWidth: 280, maxWidth: 350 };

  let { store }: { store: WordStore } = $props();

  let position = $state<{ top: number; left: number; placement: 'above' | 'below' }>({
    top: 0,
    left: 0,
    placement: 'below'
  });
  let popoverEl = $state<HTMLElement | null>(null);

  // --- Derived word view (null-safe, matching the Alpine CSP-safe proxies) ----
  const word = $derived(store.getSelectedWord());
  const isOpen = $derived(store.isPopoverOpen);
  const isLoading = $derived(store.isLoading);
  const isUnknown = $derived(!word || word.status === 0);
  const wordText = $derived(word ? word.text : '');
  const wordTranslation = $derived(word ? word.translation : '');
  const wordRomanization = $derived(word ? word.romanization : '');
  const hasTranslation = $derived(!!word && !isUnknown && !!word.translation);
  const hasRomanization = $derived(!!word && !!word.romanization);
  const hasWordId = $derived(!!word && !!word.wordId);
  const wordLabel = $derived(isUnknown ? 'Add' : 'Edit');

  // --- Positioning (ported from calculatePosition) ----------------------------
  function calculatePosition(): void {
    const targetEl = store.popoverTargetElement;
    if (!targetEl) return;

    const popoverWidth = popoverEl?.offsetWidth || POPOVER_CONFIG.minWidth;
    const popoverHeight = popoverEl?.offsetHeight || 200;

    const targetRect = targetEl.getBoundingClientRect();

    let top = targetRect.bottom + POPOVER_CONFIG.offsetY + window.scrollY;
    let left = targetRect.left + window.scrollX;
    let placement: 'above' | 'below' = 'below';

    if (targetRect.bottom + POPOVER_CONFIG.offsetY + popoverHeight > window.innerHeight) {
      top = targetRect.top - popoverHeight - POPOVER_CONFIG.offsetY + window.scrollY;
      placement = 'above';
    }

    if (top < window.scrollY + 10) {
      top = window.scrollY + 10;
    }

    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    position = { top, left, placement };
  }

  // Re-position whenever the popover opens or the target word changes. Defer to
  // after the DOM updates (the popover must be in the DOM to measure it).
  $effect(() => {
    const open = store.isPopoverOpen;
    const targetEl = store.popoverTargetElement;
    if (!open || !targetEl) return;
    void tick().then(() => {
      calculatePosition();
      initIcons();
      const w = store.getSelectedWord();
      if (w) {
        const statusInfo = STATUSES.find((s) => s.value === w.status);
        announce(`${w.text}, ${statusInfo?.label || 'Unknown'}`);
      }
    });
  });

  // Click-outside + Escape, matching the Alpine document listeners.
  $effect(() => {
    function onDocClick(event: MouseEvent): void {
      if (!store.isPopoverOpen) return;
      const target = event.target as HTMLElement;
      if (popoverEl && !popoverEl.contains(target) && !target.closest('.word, .mword')) {
        store.closePopover();
      }
    }
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && store.isPopoverOpen) {
        store.closePopover();
      }
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeydown);
    };
  });

  // --- Actions ----------------------------------------------------------------
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

  function openEditForm(): void {
    store.openEditModal();
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

{#if isOpen}
  <div
    class="word-popover word-popover--{position.placement}"
    role="dialog"
    aria-label="Word details"
    style="top: {position.top}px; left: {position.left}px;"
    bind:this={popoverEl}
  >
    <div class="word-popover__arrow word-popover__arrow--{position.placement}"></div>

    <div class="word-popover__content">
      {#if isLoading}
        <div class="has-text-centered py-2">
          <span class="icon">
            <i data-lucide="loader-2" class="icon-spin" style="width:16px;height:16px" aria-hidden="true"></i>
          </span>
        </div>
      {/if}

      {#if word && !isLoading}
        <div>
          <!-- Word text and audio button -->
          <div class="is-flex is-justify-content-space-between is-align-items-center mb-2">
            <span class="is-size-5 has-text-weight-bold">{wordText}</span>
            <button type="button" class="button is-small is-rounded is-ghost" onclick={speakWord} title="Listen" aria-label="Listen">
              <i data-lucide="volume-2" class="icon" style="width:14px;height:14px"></i>
            </button>
          </div>

          <!-- Translation for known words -->
          {#if hasTranslation}
            <div class="mb-2">
              <p class="is-size-7 word-popover__translation">{wordTranslation}</p>
              {#if hasRomanization}
                <p class="is-size-7 word-popover__romanization">{wordRomanization}</p>
              {/if}
            </div>
          {/if}

          <!-- Status actions for known words. Learning level 1-5 is derived from
               FSRS (read-only); only Learning / Well-known / Ignored are settable
               (issue #238). -->
          {#if !isUnknown}
            <div class="mb-2">
              <div class="buttons are-small mb-0">
                <button class={getStatusButtonClass(1)} disabled={isLoading} onclick={() => setStatus(1)}>Learning</button>
                <button class="button {isCurrentStatus(99) ? 'is-success' : 'is-outlined is-success'}" disabled={isLoading} onclick={() => setStatus(99)}>Known</button>
                <button class="button {isCurrentStatus(98) ? 'is-warning' : 'is-outlined is-warning'}" disabled={isLoading} onclick={() => setStatus(98)}>Ignore</button>
              </div>
            </div>
          {/if}

          <!-- Quick actions for unknown words -->
          {#if isUnknown}
            <div class="mb-2">
              <div class="buttons are-small mb-0">
                <button class="button is-success is-small" disabled={isLoading} onclick={markWellKnown}>
                  <i data-lucide="check" class="icon" style="width:12px;height:12px"></i>
                  <span class="ml-1">Known</span>
                </button>
                <button class="button is-warning is-small" disabled={isLoading} onclick={markIgnored}>
                  <i data-lucide="x" class="icon" style="width:12px;height:12px"></i>
                  <span class="ml-1">Ignore</span>
                </button>
              </div>
            </div>
          {/if}

          <!-- Action row -->
          <div class="is-flex is-justify-content-space-between is-align-items-center pt-2 word-popover__actions">
            <div class="buttons are-small mb-0">
              <button class="button is-info is-outlined is-small" onclick={openEditForm} disabled={isLoading}>
                <i data-lucide="edit" class="icon" style="width:12px;height:12px"></i>
                <span class="ml-1">{wordLabel}</span>
              </button>
              {#if !isUnknown && hasWordId}
                <button class="button is-danger is-outlined is-small" disabled={isLoading} onclick={deleteWord} aria-label="Delete">
                  <i data-lucide="trash-2" class="icon" style="width:12px;height:12px"></i>
                </button>
              {/if}
            </div>

            <!-- Dictionary links -->
            <div class="buttons are-small mb-0">
              {#if hasDictUrl('dict1')}
                <a href={getDictUrl('dict1')} target="_blank" class="button is-link is-outlined is-small" rel="noopener" title="Dictionary 1">Dict 1</a>
              {/if}
              {#if hasDictUrl('dict2')}
                <a href={getDictUrl('dict2')} target="_blank" class="button is-link is-outlined is-small" rel="noopener" title="Dictionary 2">Dict 2</a>
              {/if}
              {#if hasDictUrl('translator')}
                <a href={getDictUrl('translator')} target="_blank" class="button is-link is-outlined is-small" rel="noopener" title="Translate" aria-label="Translate">
                  <i data-lucide="languages" class="icon" style="width:12px;height:12px"></i>
                </a>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
