<!--
  Text Print — Svelte 5 port of the Alpine `textPrintApp` plain-print island
  (the single `x-data="textPrintApp()"` region of the bundle's text-print.html).

  Scope is **plain print only**, matching the bundle entry: the component reads a
  text's stored occurrences via `TextsApi.getPrintItems` (local-first Dexie or a
  remote `/api/v1`), then renders each word/punctuation token with per-status
  annotations (translation / romanization / tags) in one of three placements
  (behind / in front / ruby). The "improved annotated text" (annotated + edit
  modes) is a server-only feature with no on-device store, so — exactly like the
  Alpine bundle page — it is not rendered here; that path stays server-backed
  through the WebView.

  Rendering parity: each item is emitted as its own `<span>` whose innerHTML is
  `formatItem(item)` via `{@html}`, mirroring the Alpine `<template x-for>` +
  `<span x-effect="setItemHtml($el, item)">`. Because `formatItem` reads the
  reactive option state ($state/$derived), changing a dropdown re-renders the
  spans in place — the same client-side filtering Alpine's `x-effect` gave, with
  no page reload. The print-only / `@media print` CSS (`.noprint`, `#print`,
  `#printoptions`) and the annotation classes (`.annterm`, `.anntrans`,
  `.annrom`, ruby variants) live in global `css/base/styles.css`, so they reach
  this `{@html}` content unchanged.

  This backs only the bundled app's text-print.html. The PHP server's PWA still
  renders the Alpine `text_print_app.ts`; the two are built from the same source
  and coexist until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { apiPost } from '@shared/api/client';
  import { TextsApi, type PrintItem, type PrintConfig } from '@modules/text/api/texts_api';

  // Only the text id is needed; mode is pinned to plain (see header), and the
  // rest of the config (title, RTL, text size, saved filters) comes from the
  // loaded text's print config.
  let { textId = 0 }: { textId?: number } = $props();

  // Annotation flags (bitmask) — same values as the Alpine component.
  const ANN_SHOW_TRANS = 1;
  const ANN_SHOW_ROM = 2;
  const ANN_SHOW_TAGS = 4;

  // Annotation placement options.
  const ANN_PLACEMENT_INFRONT = 1;
  const ANN_PLACEMENT_RUBY = 2;

  // --- Reactive state (runes) -------------------------------------------------
  let loading = $state(true);
  let items = $state<PrintItem[]>([]);
  let config = $state<PrintConfig | null>(null);

  // Filter state (defaults match the Alpine component / print repository).
  let statusFilter = $state(14); // Status 1..4
  let annotationFlags = $state(3); // Translation + Romanization
  let placementMode = $state(0); // Behind

  // --- Derived ----------------------------------------------------------------
  const showRom = $derived((annotationFlags & ANN_SHOW_ROM) !== 0);
  const showTrans = $derived((annotationFlags & ANN_SHOW_TRANS) !== 0);
  const showTags = $derived((annotationFlags & ANN_SHOW_TAGS) !== 0);

  // Safe config accessors (mirror the Alpine getConfig* getters).
  const configTitle = $derived(config ? config.title : '');
  const configTextSize = $derived(config ? config.textSize : 100);
  const configRtl = $derived(config ? config.rtlScript : false);

  // --- Pure helpers -----------------------------------------------------------
  /** Escape HTML entities (identical to the Alpine helper). */
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if a word status is within the selected range bitmask.
   * Bit 0 (1)→1, 1 (2)→2, 2 (4)→3, 3 (8)→4, 4 (16)→5, 5 (32)→98, 6 (64)→99.
   */
  function checkStatusRange(status: number | null, range: number): boolean {
    if (status === null) return false;
    switch (status) {
      case 1:
        return (range & 1) !== 0;
      case 2:
        return (range & 2) !== 0;
      case 3:
        return (range & 4) !== 0;
      case 4:
        return (range & 8) !== 0;
      case 5:
        return (range & 16) !== 0;
      case 98:
        return (range & 32) !== 0;
      case 99:
        return (range & 64) !== 0;
      default:
        return false;
    }
  }

  function checkStatusInRange(status: number | null): boolean {
    return checkStatusRange(status, statusFilter);
  }

  function formatTermBehind(
    term: string,
    rom: string,
    trans: string,
    hasRom: boolean,
    hasTrans: boolean
  ): string {
    let output = ' <span class="annterm">';
    output += escapeHtml(term);
    output += '</span> ';

    if (hasRom && !hasTrans) {
      output += `<span class="annrom">${escapeHtml(rom)}</span>`;
    }
    if (hasRom && hasTrans) {
      output += `<span class="annrom" dir="ltr">[${escapeHtml(rom)}]</span> `;
    }
    if (hasTrans) {
      output += `<span class="anntrans">${escapeHtml(trans)}</span>`;
    }
    output += ' ';

    return output;
  }

  function formatTermInFront(
    term: string,
    rom: string,
    trans: string,
    hasRom: boolean,
    hasTrans: boolean
  ): string {
    let output = ' ';

    if (hasTrans) {
      output += `<span class="anntrans">${escapeHtml(trans)}</span> `;
    }
    if (hasRom && !hasTrans) {
      output += `<span class="annrom">${escapeHtml(rom)}</span> `;
    }
    if (hasRom && hasTrans) {
      output += `<span class="annrom" dir="ltr">[${escapeHtml(rom)}]</span> `;
    }

    output += ' <span class="annterm">';
    output += escapeHtml(term);
    output += '</span> ';

    return output;
  }

  function formatTermRuby(
    term: string,
    rom: string,
    trans: string,
    hasRom: boolean,
    hasTrans: boolean
  ): string {
    let output = ' <ruby><rb><span class="anntermruby">';
    output += escapeHtml(term);
    output += '</span></rb><rt> ';

    if (hasTrans) {
      output += `<span class="anntransruby">${escapeHtml(trans)}</span> `;
    }
    if (hasRom && !hasTrans) {
      output += `<span class="annromrubysolo">${escapeHtml(rom)}</span> `;
    }
    if (hasRom && hasTrans) {
      output += `<span class="annromruby" dir="ltr">[${escapeHtml(rom)}]</span> `;
    }

    output += '</rt></ruby> ';
    return output;
  }

  /** Render one print item to HTML — the port of the Alpine `formatItem`. */
  function formatItem(item: PrintItem): string {
    // Paragraph markers split the running <p> into a new paragraph.
    if (item.isParagraph) {
      const textSize = config ? config.textSize : 100;
      return `</p><p style="font-size:${textSize}%;line-height: 1.3; margin-bottom: 10px;">`;
    }

    // Non-word items (punctuation) — escaped text only.
    if (!item.isWord) {
      return escapeHtml(item.text);
    }

    // Word items — annotate only when saved and in the selected status range.
    const showAnnotation = item.wordId !== null && checkStatusInRange(item.status);
    if (!showAnnotation) {
      return escapeHtml(item.text);
    }

    let translation = item.translation;
    const romanization = item.romanization;
    const tags = item.tags;

    // Fold tags into the translation when "show tags" is on.
    if (showTags) {
      if (translation === '' && tags !== '') {
        translation = '* ' + tags;
      } else if (tags !== '') {
        translation = (translation + ' ' + tags).trim();
      }
    }

    const hasRom = showRom && romanization !== '';
    const hasTrans = showTrans && translation !== '';

    if (!hasRom && !hasTrans) {
      return escapeHtml(item.text);
    }

    switch (placementMode) {
      case ANN_PLACEMENT_INFRONT:
        return formatTermInFront(item.text, romanization, translation, hasRom, hasTrans);
      case ANN_PLACEMENT_RUBY:
        return formatTermRuby(item.text, romanization, translation, hasRom, hasTrans);
      default:
        return formatTermBehind(item.text, romanization, translation, hasRom, hasTrans);
    }
  }

  // --- Data loading -----------------------------------------------------------
  async function loadPrintItems(): Promise<void> {
    const response = await TextsApi.getPrintItems(textId);
    if (response.data) {
      items = response.data.items;
      config = response.data.config;

      // Apply saved settings from config (server- or device-persisted).
      statusFilter = response.data.config.savedStatus;
      annotationFlags = response.data.config.savedAnn;
      placementMode = response.data.config.savedPlacement;
    }
  }

  // --- Settings persistence ---------------------------------------------------
  async function saveSettings(): Promise<void> {
    await apiPost('/settings', {
      key: 'currentprintannotation',
      value: String(annotationFlags)
    });
    await apiPost('/settings', {
      key: 'currentprintstatus',
      value: String(statusFilter)
    });
    await apiPost('/settings', {
      key: 'currentprintannotationplacement',
      value: String(placementMode)
    });
  }

  // --- Filter handlers --------------------------------------------------------
  function handleStatusChange(event: Event): void {
    statusFilter = parseInt((event.target as HTMLSelectElement).value, 10);
    void saveSettings();
  }

  function handleAnnotationChange(event: Event): void {
    annotationFlags = parseInt((event.target as HTMLSelectElement).value, 10);
    void saveSettings();
  }

  function handlePlacementChange(event: Event): void {
    placementMode = parseInt((event.target as HTMLSelectElement).value, 10);
    void saveSettings();
  }

  // --- Actions ----------------------------------------------------------------
  function handlePrint(): void {
    window.print();
  }

  // Re-hydrate lucide icons after the chrome / print content renders, and after
  // a re-render (matching the Alpine `setTimeout(initIcons)` calls).
  $effect(() => {
    void loading;
    void items;
    void configTitle;
    void tick().then(() => initIcons());
  });

  onMount(async () => {
    if (textId === 0) {
      loading = false;
      return;
    }
    await loadPrintItems();
    loading = false;
  });
</script>

<section class="section pt-4 noprint">
  <!-- Per-text actions (link router rewrites these to bundled pages on click). -->
  <div class="buttons are-small mb-3">
    <a class="button is-light" href="/text/{textId}/read">
      <span class="icon"><i data-lucide="book-open"></i></span><span>Read</span>
    </a>
    <a class="button is-light" href="/review?text={textId}">
      <span class="icon"><i data-lucide="circle-help"></i></span><span>Review</span>
    </a>
    <a class="button is-light" href="/texts/{textId}/edit">
      <span class="icon"><i data-lucide="file-pen"></i></span><span>Edit text</span>
    </a>
  </div>

  <h1 class="title is-4">
    PRINT &#9654; <span>{configTitle}</span>
  </h1>

  <!-- Loading state -->
  {#if loading}
    <div class="has-text-centered py-6">
      <span class="icon is-large"><i data-lucide="loader-2" class="icon-spin"></i></span>
      <p class="mt-2">Loading…</p>
    </div>
  {/if}

  <!-- Plain print options -->
  {#if !loading}
    <div class="card mb-4" id="printoptions">
      <div class="card-content">
        <p class="mb-3">
          Terms with <strong>status(es)</strong>
          <span class="select is-small">
            <select value={String(statusFilter)} onchange={handleStatusChange} aria-label="Term status range">
              <option value="1">Learning [1]</option>
              <option value="2">Learning [2]</option>
              <option value="3">Learning [3]</option>
              <option value="4">Learning [4]</option>
              <option value="5">Learned [5]</option>
              <option disabled>--------</option>
              <option value="12">Learning [1..2]</option>
              <option value="13">Learning [1..3]</option>
              <option value="14">Learning [1..4]</option>
              <option value="15">Learning/-ed [1..5]</option>
              <option disabled>--------</option>
              <option value="23">Learning [2..3]</option>
              <option value="24">Learning [2..4]</option>
              <option value="25">Learning/-ed [2..5]</option>
              <option disabled>--------</option>
              <option value="34">Learning [3..4]</option>
              <option value="35">Learning/-ed [3..5]</option>
              <option disabled>--------</option>
              <option value="45">Learning/-ed [4..5]</option>
              <option disabled>--------</option>
              <option value="599">All known [5+Well Known]</option>
            </select>
          </span>
          …
        </p>
        <p class="mb-3">
          will be <strong>annotated</strong> with
          <span class="select is-small">
            <select value={String(annotationFlags)} onchange={handleAnnotationChange} aria-label="Annotation content">
              <option value="0">Nothing</option>
              <option value="1">Translation</option>
              <option value="5">Translation &amp; Tags</option>
              <option value="2">Romanization</option>
              <option value="3">Romanization &amp; Translation</option>
              <option value="7">Romanization, Translation &amp; Tags</option>
            </select>
          </span>
          <span class="select is-small">
            <select value={String(placementMode)} onchange={handlePlacementChange} aria-label="Annotation placement">
              <option value="0">behind</option>
              <option value="1">in front of</option>
              <option value="2">above (ruby)</option>
            </select>
          </span>
          the term.
        </p>
        <div class="buttons">
          <button type="button" class="button is-primary" onclick={handlePrint}>
            <span class="icon"><i data-lucide="printer"></i></span>
            <span class="ml-1">Print it!</span>
          </button>
          <span class="is-size-7 ml-2">(only the text below the line)</span>
        </div>
        <p class="is-size-7 has-text-grey mt-3">
          The Improved Annotated Text (hand-edited annotations) is a server-only
          feature — connect a server to create or print one.
        </p>
      </div>
    </div>
  {/if}
</section>

<!-- Print content (the only part that prints) -->
{#if !loading}
  <div id="print" class="section pt-0" dir={configRtl ? 'rtl' : 'ltr'}>
    <h2 class="title is-5">{configTitle}</h2>
    <p style="font-size:{configTextSize}%; line-height: 1.35; margin-bottom: 10px;">
      {#each items as item (item.position)}
        <!-- Renderer output (escaped tokens + annotation markup), not user
             eval — CSP-safe, mirroring the Alpine `setItemHtml`. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span>{@html formatItem(item)}</span>
      {/each}
    </p>
  </div>
{/if}
