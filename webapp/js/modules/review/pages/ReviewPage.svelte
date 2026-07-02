<!--
  Review — Svelte 5 port of the Alpine `reviewApp` + `tableReview` components.

  Unifies the two Alpine components from `review_view.ts` into one island: the
  word-review session (FSRS grading, reveal, manual status, skip, timer, sounds,
  read-aloud, the details modal) and the table-review mode (column toggles,
  click-to-reveal cells, context-annotation settings). It drives the same
  `ReviewApi` and a runes port of the review store (`review_store.svelte.ts`),
  so behaviour is unchanged; only the rendering is Svelte.

  This backs only the bundled app's `review.html`. The PHP server's PWA still
  renders the Alpine `review_view.ts` / `review_store.ts` (which keep their
  tests) — the two coexist, built from the same `src/frontend/` source, until
  the PWA retires.

  Server-generated term/sentence HTML is rendered with `{@html}` (CSP-safe: the
  bundle's CSP blocks `eval`/inline scripts, not `innerHTML`, and this HTML is
  server-generated, not user-eval input) — the same content the Alpine version
  set via `el.innerHTML`.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import { speechDispatcher } from '@shared/utils/user_interactions';
  import { saveSetting } from '@shared/utils/ajax_utilities';
  import { ReviewApi, type TableReviewWord } from '@modules/review/api/review_api';
  import {
    ReviewStore,
    type LangSettings,
    type ReviewProgress
  } from '@modules/review/stores/review_store.svelte';

  interface ReviewPageProps {
    reviewKey?: string;
    selection?: string;
    reviewType?: number;
    isTableMode?: boolean;
    wordMode?: boolean;
    langId?: number;
    wordRegex?: string;
    langSettings?: LangSettings;
    progress?: ReviewProgress;
    timer?: { startTime: number; serverTime: number };
    title?: string;
    property?: string;
    /** Set when the server config could not be loaded (renders a danger box). */
    error?: string;
  }

  let {
    reviewKey = '',
    selection = '',
    reviewType = 1,
    isTableMode = false,
    wordMode = false,
    langId = 0,
    wordRegex = '',
    langSettings = {
      name: '',
      dict1Uri: '',
      dict2Uri: '',
      translateUri: '',
      textSize: 100,
      rtl: false,
      langCode: ''
    },
    progress = { total: 0, remaining: 0, wrong: 0, correct: 0 },
    timer = { startTime: 0, serverTime: 0 },
    title = '',
    property = '',
    error = undefined
  }: ReviewPageProps = $props();

  // --- Session store (runes port of the Alpine store) -------------------------
  // Seed the store with the initial review type / table flag to avoid a flash of
  // the wrong toolbar state before `configure()` runs in onMount. `untrack`
  // snapshots the props (we want the initial value, not a live binding).
  const store = new ReviewStore(untrack(() => ({ reviewType, isTableMode })));

  // Review types — labels/titles resolved via i18n (i18n is booted before mount).
  const reviewTypes: { id: number; label: string; title: string }[] = [
    {
      id: 1,
      label: t('review.type.sentence_to_translation.label'),
      title: t('review.type.sentence_to_translation.title')
    },
    {
      id: 2,
      label: t('review.type.sentence_to_term.label'),
      title: t('review.type.sentence_to_term.title')
    },
    {
      id: 3,
      label: t('review.type.sentence_to_both.label'),
      title: t('review.type.sentence_to_both.title')
    },
    {
      id: 4,
      label: t('review.type.term_to_translation.label'),
      title: t('review.type.term_to_translation.title')
    },
    {
      id: 5,
      label: t('review.type.translation_to_term.label'),
      title: t('review.type.translation_to_term.title')
    }
  ];

  // --- Table-mode state (was the separate `tableReview` Alpine component) ------
  let tableWords = $state<TableReviewWord[]>([]);
  let columns = $state({ edit: true, status: true, term: true, trans: true, rom: false, sentence: true });
  let hideTermContent = $state(false);
  let hideTransContent = $state(false);
  let contextAnnotations = $state({ rom: false, trans: false });
  let revealedTerms = $state<Record<number, boolean>>({});
  let revealedTrans = $state<Record<number, boolean>>({});
  let tableLoading = $state(false);

  // --- Derived ----------------------------------------------------------------
  const progressPercent = $derived.by(() => {
    const total = store.progress.total || 1;
    return {
      remaining: (store.progress.remaining / total) * 100,
      wrong: (store.progress.wrong / total) * 100,
      correct: (store.progress.correct / total) * 100
    };
  });

  // --- Word-review actions (the Alpine `reviewApp` wrappers) ------------------
  function revealAnswer(): void {
    store.revealAnswer();
    if (store.readAloudEnabled && store.currentWord) {
      speakWord();
    }
  }

  async function gradeAnswer(grade: number): Promise<void> {
    await store.gradeAnswer(grade);
  }

  async function setStatus(status: number): Promise<void> {
    await store.updateStatus(status);
  }

  async function skipWord(): Promise<void> {
    await store.skipWord();
  }

  function switchReviewType(type: number): void {
    const url = new URL(window.location.href);
    url.searchParams.set('type', String(type));
    window.location.href = url.toString();
  }

  function switchToTable(): void {
    const url = new URL(window.location.href);
    if (store.isTableMode) {
      url.searchParams.delete('type');
    } else {
      url.searchParams.set('type', 'table');
    }
    window.location.href = url.toString();
  }

  function speakWord(): void {
    if (store.currentWord && store.langSettings.langCode) {
      void speechDispatcher(store.currentWord.text, store.langId);
    }
  }

  function toggleReadAloud(event: Event): void {
    const target = event.target as HTMLInputElement;
    store.setReadAloud(target.checked);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (store.isModalOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (store.isTableMode || store.isFinished) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!store.answerRevealed) revealAnswer();
        break;
      case 'Escape':
        e.preventDefault();
        if (store.currentWord) void skipWord();
        break;
      case 'i':
      case 'I':
        e.preventDefault();
        if (store.currentWord) void setStatus(98);
        break;
      case 'w':
      case 'W':
        e.preventDefault();
        if (store.currentWord) void setStatus(99);
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        if (store.currentWord) store.openModal();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        e.preventDefault();
        if (store.answerRevealed) void gradeAnswer(parseInt(e.key, 10));
        break;
    }
  }

  // --- Finished-state helpers (CSP-compatible, from the Alpine component) ------
  function getFinishedTitle(): string {
    if (store.progress.total > 0) {
      return t('review.finished.nothing_more');
    }
    return t('review.no_vocabulary_title');
  }

  function hasNoVocabulary(): boolean {
    return store.progress.total === 0;
  }

  function getNoVocabularyHint(): string {
    return t('review.no_vocabulary_hint');
  }

  function hasTomorrowWords(): boolean {
    return store.tomorrowCount > 0;
  }

  function getTomorrowMessage(): string {
    const count = store.tomorrowCount;
    return t(
      count === 1 ? 'review.finished.tomorrow_count_one' : 'review.finished.tomorrow_count_other',
      { count }
    );
  }

  // Safe accessors (avoid optional chaining in the template, as the Alpine port did).
  function getCurrentWordGroup(): string {
    return store.currentWord ? store.currentWord.group : '';
  }

  function getCurrentWordSolution(): string {
    return store.currentWord ? store.currentWord.solution : '';
  }

  // --- Table-mode actions (the Alpine `tableReview` methods) ------------------
  async function loadTableWords(): Promise<void> {
    tableLoading = true;
    try {
      const response = await ReviewApi.getTableWords(store.reviewKey, store.selection);
      if (response.data) {
        tableWords = response.data.words;
      }
    } catch (err) {
      console.error('Error loading words:', err);
    }
    tableLoading = false;
  }

  async function setWordStatus(wordId: number, status: number): Promise<void> {
    try {
      const response = await ReviewApi.updateStatus(wordId, status);
      if (response.data?.status !== undefined) {
        const word = tableWords.find((w) => w.id === wordId);
        if (word) word.status = response.data.status;
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  }

  function revealTerm(wordId: number): void {
    if (hideTermContent) revealedTerms = { ...revealedTerms, [wordId]: true };
  }

  function revealTrans(wordId: number): void {
    if (hideTransContent) revealedTrans = { ...revealedTrans, [wordId]: true };
  }

  function saveColumnSettings(): void {
    localStorage.setItem(
      'lukaisu-table-review-columns',
      JSON.stringify({ columns, hideTermContent, hideTransContent })
    );
  }

  function loadColumnSettings(): void {
    const saved = localStorage.getItem('lukaisu-table-review-columns');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.columns) columns = { ...columns, ...s.columns };
        if (typeof s.hideTermContent === 'boolean') hideTermContent = s.hideTermContent;
        if (typeof s.hideTransContent === 'boolean') hideTransContent = s.hideTransContent;
      } catch {
        /* ignore */
      }
    }
  }

  function saveContextAnnotationSettings(): void {
    // Persist to the server (sentence-mode context annotations) and locally.
    saveSetting('currenttabletestsetting7', contextAnnotations.rom ? '1' : '0');
    saveSetting('currenttabletestsetting8', contextAnnotations.trans ? '1' : '0');
    localStorage.setItem('lukaisu-context-annotations', JSON.stringify(contextAnnotations));
  }

  function loadContextAnnotationSettings(): void {
    const saved = localStorage.getItem('lukaisu-context-annotations');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (typeof s.rom === 'boolean') contextAnnotations.rom = s.rom;
        if (typeof s.trans === 'boolean') contextAnnotations.trans = s.trans;
      } catch {
        /* ignore */
      }
    }
  }

  // --- Lifecycle --------------------------------------------------------------
  // Global keyboard shortcuts (word-review only; the handler self-guards).
  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  // Elapsed-time ticker. Re-subscribes on init/finish; cleared on unmount and
  // whenever the session finishes (matching the Alpine store's stopTimer()).
  $effect(() => {
    if (!store.isInitialized || store.isFinished) return;
    store.recomputeElapsed();
    const id = window.setInterval(() => store.recomputeElapsed(), 1000);
    return () => window.clearInterval(id);
  });

  onMount(async () => {
    if (error) return; // Config load failed — the template shows the error box.

    store.configure({
      reviewKey,
      selection,
      reviewType,
      isTableMode,
      wordMode,
      langId,
      wordRegex,
      langSettings,
      progress,
      timer,
      title,
      property
    });

    if (store.isTableMode) {
      loadColumnSettings();
      loadContextAnnotationSettings();
      await loadTableWords();
    } else {
      await store.nextWord();
    }
  });
</script>

{#if error}
  <div class="notification is-danger m-4">{error}</div>
{:else}
  <div class="review-page">
    <!-- Toolbar -->
    <div class="box py-2 px-4 mb-0" style="border-radius: 0;">
      <div class="level is-mobile">
        <div class="level-left">
          <div class="level-item">
            <strong>{t('review.toolbar.review_label')} <span>{store.title}</span></strong>
          </div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <div class="field is-grouped is-grouped-multiline">
              <div class="control">
                <div class="buttons are-small">
                  {#each reviewTypes as rt (rt.id)}
                    <button
                      type="button"
                      class="button"
                      class:is-primary={store.reviewType === rt.id && !store.isTableMode}
                      onclick={() => switchReviewType(rt.id)}
                      title={rt.title}
                    >
                      {rt.label}
                    </button>
                  {/each}
                  <button
                    type="button"
                    class="button"
                    class:is-primary={store.isTableMode}
                    onclick={switchToTable}
                  >
                    {t('review.header.button_table')}
                  </button>
                </div>
              </div>
              <div class="control">
                <label class="checkbox">
                  <input type="checkbox" checked={store.readAloudEnabled} onchange={toggleReadAloud} />
                  {t('review.toolbar.read_aloud')}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="box py-2 px-4 mb-0 review-progress-section">
      <div class="level is-mobile">
        <div class="level-left">
          <div class="level-item">
            <span>{t('review.progress.time')} </span>
            <span>{store.timer.elapsed}</span>
          </div>
        </div>

        <div class="level-item is-flex-grow-1 mx-4">
          <div class="review-progress">
            <div class="review-progress-remaining" style="width: {progressPercent.remaining}%"></div>
            <div class="review-progress-wrong" style="width: {progressPercent.wrong}%"></div>
            <div class="review-progress-correct" style="width: {progressPercent.correct}%"></div>
          </div>
        </div>

        <div class="level-right">
          <div class="level-item">
            <span class="tag is-medium is-light" title={t('review.progress.remaining_total_title')}>
              <span class="has-text-weight-semibold" title={t('review.progress.remaining_title')}
                >{store.progress.remaining}</span
              >
              <span class="mx-1 has-text-grey">/</span>
              <span class="has-text-grey" title={t('review.progress.total_title')}
                >{store.progress.total}</span
              >
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    {#if store.isLoading && !store.isInitialized}
      <div class="has-text-centered py-6">
        <div class="loading-spinner"></div>
        <p class="mt-4 has-text-grey">{t('review.loading')}</p>
      </div>
    {/if}

    <!-- Error state (mid-session) -->
    {#if store.error}
      <div class="notification is-danger mx-4 mt-4">
        <button class="delete" aria-label="Close" onclick={() => (store.error = null)}></button>
        <p>{store.error}</p>
      </div>
    {/if}

    <!-- Word review content -->
    {#if !store.isTableMode && !store.error && store.isInitialized}
      <div class="review-content p-4">
        <!-- Finished message -->
        {#if store.isFinished}
          <div class="has-text-centered py-6">
            <div class="notification is-success is-light">
              <p class="is-size-5 has-text-weight-bold">{getFinishedTitle()}</p>
              {#if hasNoVocabulary()}
                <p class="mt-2 has-text-grey-dark">{getNoVocabularyHint()}</p>
              {/if}
              {#if hasTomorrowWords()}
                <p class="mt-3">{getTomorrowMessage()}</p>
              {/if}
              <div class="buttons is-centered mt-5">
                <a href="/texts" class="button is-primary">{t('review.back_to_texts')}</a>
              </div>
            </div>
          </div>
        {/if}

        <!-- Word review area -->
        {#if !store.isFinished && store.currentWord}
          <div class="review-word-area">
            {#if store.isLoading}
              <div class="has-text-centered py-4">
                <div class="loading-spinner"></div>
              </div>
            {:else}
              <div class="has-text-centered">
                <!-- Term display (server-generated HTML) -->
                <div
                  class="review-term-display mb-5"
                  style="font-size: {store.langSettings.textSize}%; direction: {store.langSettings
                    .rtl
                    ? 'rtl'
                    : 'ltr'}"
                >
                  <!-- Server-generated term HTML; CSP-safe (not user-eval input). -->
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html getCurrentWordGroup()}
                </div>

                <!-- Solution (hidden until revealed) -->
                {#if store.answerRevealed}
                  <div class="notification is-info is-light mb-5">
                    <p class="is-size-4">{getCurrentWordSolution()}</p>
                  </div>
                {/if}

                <!-- Show answer -->
                {#if !store.answerRevealed}
                  <div class="buttons is-centered mb-5">
                    <button type="button" class="button is-primary is-large" onclick={revealAnswer}>
                      {t('review.card.show_answer')}
                    </button>
                  </div>
                {/if}

                <!-- After reveal: FSRS grade + manual status + skip -->
                {#if store.answerRevealed}
                  <div class="mb-5">
                    <div class="buttons is-centered">
                      <button type="button" class="button is-danger" onclick={() => gradeAnswer(1)} title="Press 1"
                        >Again</button
                      >
                      <button type="button" class="button is-warning" onclick={() => gradeAnswer(2)} title="Press 2"
                        >Hard</button
                      >
                      <button type="button" class="button is-success" onclick={() => gradeAnswer(3)} title="Press 3"
                        >Good</button
                      >
                      <button type="button" class="button is-info" onclick={() => gradeAnswer(4)} title="Press 4"
                        >Easy</button
                      >
                    </div>
                    <div class="buttons is-centered are-small mt-2">
                      <button type="button" class="button" onclick={() => setStatus(98)} title="Press I">
                        {t('review.card.ignore')}
                      </button>
                      <button type="button" class="button" onclick={() => setStatus(99)} title="Press W">
                        {t('review.card.well_known')}
                      </button>
                      <button type="button" class="button" onclick={skipWord} title="Escape">
                        {t('review.card.skip')}
                      </button>
                    </div>
                  </div>

                  <!-- Details -->
                  <div>
                    <button type="button" class="button is-text is-small" onclick={() => store.openModal()} title="Press E">
                      {t('review.card.details_edit')}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Table review content -->
    {#if store.isTableMode && !store.error && store.isInitialized}
      <div class="table-review-content p-4">
        {#if tableLoading}
          <div class="has-text-centered py-6">
            <div class="loading-spinner"></div>
            <p class="mt-4 has-text-grey">{t('review.loading_words')}</p>
          </div>
        {/if}

        {#if !tableLoading && tableWords.length === 0}
          <div class="notification is-info is-light">
            <p>{t('review.table.no_words')}</p>
          </div>
        {/if}

        {#if !tableLoading && tableWords.length > 0}
          <!-- Column toggles -->
          <div class="field is-grouped is-grouped-multiline mb-4">
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.edit}
                  onchange={(e) => {
                    columns.edit = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_edit')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.status}
                  onchange={(e) => {
                    columns.status = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_status')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.term}
                  onchange={(e) => {
                    columns.term = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_term')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.trans}
                  onchange={(e) => {
                    columns.trans = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_translation')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.rom}
                  onchange={(e) => {
                    columns.rom = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_romanization')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={columns.sentence}
                  onchange={(e) => {
                    columns.sentence = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.col_sentence')}</label
              >
            </div>
            <div class="control ml-4">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={hideTermContent}
                  onchange={(e) => {
                    hideTermContent = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.hide_terms')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={hideTransContent}
                  onchange={(e) => {
                    hideTransContent = e.currentTarget.checked;
                    saveColumnSettings();
                  }}
                /> {t('review.table.hide_translations')}</label
              >
            </div>
          </div>

          <!-- Context annotation toggles (affect sentence-mode tests) -->
          <div class="field is-grouped is-grouped-multiline mb-4">
            <div class="control">
              <span class="has-text-grey-dark is-size-7 mr-2">{t('review.table.context_annotations')}</span>
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={contextAnnotations.rom}
                  onchange={(e) => {
                    contextAnnotations.rom = e.currentTarget.checked;
                    saveContextAnnotationSettings();
                  }}
                /> {t('review.table.col_romanization')}</label
              >
            </div>
            <div class="control">
              <label class="checkbox"
                ><input
                  type="checkbox"
                  checked={contextAnnotations.trans}
                  onchange={(e) => {
                    contextAnnotations.trans = e.currentTarget.checked;
                    saveContextAnnotationSettings();
                  }}
                /> {t('review.table.col_translation')}</label
              >
            </div>
          </div>

          <div class="table-container">
            <table class="table is-striped is-hoverable is-fullwidth">
              <thead>
                <tr>
                  {#if columns.edit}
                    <th class="has-text-centered" style="width: 50px;">{t('review.table.col_ed_short')}</th>
                  {/if}
                  {#if columns.status}
                    <th class="has-text-centered" style="width: 180px;">{t('review.table.col_status')}</th>
                  {/if}
                  {#if columns.term}
                    <th class="has-text-centered">{t('review.table.col_term')}</th>
                  {/if}
                  {#if columns.trans}
                    <th class="has-text-centered">{t('review.table.col_translation')}</th>
                  {/if}
                  {#if columns.rom}
                    <th class="has-text-centered">{t('review.table.col_rom_short')}</th>
                  {/if}
                  {#if columns.sentence}
                    <th>{t('review.table.col_sentence')}</th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each tableWords as word (word.id)}
                  <tr>
                    {#if columns.edit}
                      <td class="has-text-centered">
                        <a href={`/words/${word.id}/edit`} class="button is-small is-text">
                          {t('review.table.col_edit')}
                        </a>
                      </td>
                    {/if}
                    {#if columns.status}
                      <td class="has-text-centered">
                        <!-- Learning level 1-5 is derived from FSRS (read-only); only
                             Well-known / Ignored are settable (issue #238). -->
                        <div
                          class="is-flex is-align-items-center is-justify-content-center"
                          style="gap: 0.4rem;"
                        >
                          <span class="tag status-btn status-{word.status}">{word.status}</span>
                          <button
                            type="button"
                            class="button is-small is-success"
                            class:is-light={word.status !== 99}
                            class:is-outlined={word.status !== 99}
                            onclick={() => setWordStatus(word.id, 99)}
                            title={t('common.status_well_known')}>{t('common.status_well_known')}</button
                          >
                          <button
                            type="button"
                            class="button is-small is-warning"
                            class:is-light={word.status !== 98}
                            class:is-outlined={word.status !== 98}
                            onclick={() => setWordStatus(word.id, 98)}
                            title={t('common.status_ignored')}>{t('common.status_ignored')}</button
                          >
                        </div>
                      </td>
                    {/if}
                    {#if columns.term}
                      <td
                        class="has-text-centered"
                        class:cell-hidden={hideTermContent && !revealedTerms[word.id]}
                        role="button"
                        tabindex="0"
                        onclick={() => revealTerm(word.id)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            revealTerm(word.id);
                          }
                        }}
                      >
                        <span>{word.text}</span>
                      </td>
                    {/if}
                    {#if columns.trans}
                      <td
                        class="has-text-centered"
                        class:cell-hidden={hideTransContent && !revealedTrans[word.id]}
                        role="button"
                        tabindex="0"
                        onclick={() => revealTrans(word.id)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            revealTrans(word.id);
                          }
                        }}
                      >
                        <span>{word.translation}</span>
                      </td>
                    {/if}
                    {#if columns.rom}
                      <td class="has-text-centered">{word.romanization}</td>
                    {/if}
                    {#if columns.sentence}
                      <!-- Server-generated sentence HTML; CSP-safe (not user-eval input). -->
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      <td>{@html word.sentenceHtml}</td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Word details modal -->
    <div class="modal" class:is-active={store.isModalOpen}>
      <div
        class="modal-background"
        role="button"
        tabindex="-1"
        aria-label={t('review.modal.close')}
        onclick={() => store.closeModal()}
        onkeydown={(e) => {
          if (e.key === 'Escape') store.closeModal();
        }}
      ></div>
      <div class="modal-card" style="max-width: 500px;">
        <header class="modal-card-head py-3">
          <p class="modal-card-title is-size-5">{t('review.modal.word_details')}</p>
          <button class="delete" aria-label="close" onclick={() => store.closeModal()}></button>
        </header>
        <section class="modal-card-body">
          {#if store.currentWord}
            <div>
              <div class="is-flex is-justify-content-space-between is-align-items-center mb-4">
                <span
                  class="is-size-3 has-text-weight-bold"
                  style={store.langSettings.rtl ? 'direction: rtl' : ''}>{store.currentWord.text}</span
                >
                <button type="button" class="button is-small" onclick={speakWord}>
                  {t('review.modal.listen')}
                </button>
              </div>

              {#if store.currentWord.solution}
                <div class="mb-4">
                  <p class="has-text-grey-dark is-size-5">{store.currentWord.solution}</p>
                </div>
              {/if}

              {#if store.hasDictUrl('dict1') || store.hasDictUrl('dict2') || store.hasDictUrl('translator')}
                <div class="mb-4">
                  <p class="is-size-7 has-text-grey mb-2">{t('review.modal.lookup_in_dictionary')}</p>
                  <div class="buttons">
                    {#if store.hasDictUrl('dict1')}
                      <a href={store.getDictUrl('dict1')} target="_blank" class="button is-outlined" rel="noopener">
                        {t('review.modal.dictionary_1')}
                      </a>
                    {/if}
                    {#if store.hasDictUrl('dict2')}
                      <a href={store.getDictUrl('dict2')} target="_blank" class="button is-outlined" rel="noopener">
                        {t('review.modal.dictionary_2')}
                      </a>
                    {/if}
                    {#if store.hasDictUrl('translator')}
                      <a
                        href={store.getDictUrl('translator')}
                        target="_blank"
                        class="button is-outlined"
                        rel="noopener"
                      >
                        {t('review.modal.translate')}
                      </a>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </section>
        <footer class="modal-card-foot">
          <a href={store.getEditUrl()} class="button is-info">{t('review.modal.edit_term')}</a>
          <button type="button" class="button" onclick={() => store.closeModal()}>{t('review.modal.close')}</button>
        </footer>
      </div>
    </div>
  </div>
{/if}

<style>
  .review-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .review-progress-section {
    border-radius: 0;
  }

  .review-content,
  .table-review-content {
    max-width: 900px;
    margin: 0 auto;
    flex: 1;
    width: 100%;
  }

  .review-word-area {
    min-height: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .review-term-display {
    min-height: 100px;
    line-height: 1.6;
  }

  .review-progress {
    display: flex;
    height: 8px;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
    background: #e0e0e0;
  }

  .review-progress-remaining {
    background-color: #808080;
    transition: width 0.3s ease;
  }
  .review-progress-wrong {
    background-color: #ff6347;
    transition: width 0.3s ease;
  }
  .review-progress-correct {
    background-color: #32cd32;
    transition: width 0.3s ease;
  }

  .status-btn.status-1 {
    background-color: #ff6347 !important;
    color: white !important;
    border-color: #ff6347 !important;
  }
  .status-btn.status-2 {
    background-color: #ffa500 !important;
    color: white !important;
    border-color: #ffa500 !important;
  }
  .status-btn.status-3 {
    background-color: #ffff00 !important;
    color: black !important;
    border-color: #ffff00 !important;
  }
  .status-btn.status-4 {
    background-color: #90ee90 !important;
    color: black !important;
    border-color: #90ee90 !important;
  }
  .status-btn.status-5 {
    background-color: #32cd32 !important;
    color: white !important;
    border-color: #32cd32 !important;
  }

  /* Server-generated term/sentence HTML (rendered via {@html}); scoped styles do
     not reach injected content, so these target it globally. */
  :global(.word-test) {
    font-weight: bold;
    text-decoration: underline;
  }
  :global(.word-test-hidden) {
    background-color: #e0e0e0;
    padding: 0 0.5em;
    border-radius: 3px;
  }

  :global(.annotated-sentence) {
    line-height: 2.5;
  }
  :global(.annotated-sentence ruby) {
    ruby-position: over;
  }
  :global(.annotated-sentence ruby rt) {
    font-size: 0.65em;
    color: #666;
    font-weight: normal;
  }
  :global(.annotated-sentence ruby .context-trans) {
    color: #888;
    font-style: italic;
  }
  :global(.context-word) {
    display: inline-block;
    text-align: center;
  }

  .cell-hidden {
    color: transparent !important;
    background-color: #f0f0f0 !important;
    cursor: pointer;
    user-select: none;
  }
  .cell-hidden:hover {
    background-color: #e0e0e0 !important;
  }
  .cell-hidden :global(*) {
    color: transparent !important;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto;
    border: 3px solid #dbdbdb;
    border-top-color: #3273dc;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media screen and (max-width: 768px) {
    .review-progress-section :global(.level) {
      flex-wrap: wrap;
    }
    .review-progress-section :global(.level-item:not(:last-child)) {
      margin-bottom: 0.5rem;
    }
  }
</style>
