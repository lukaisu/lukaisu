<!--
  Book Detail — Svelte 5 port of the server `Book/Views/show.php` view.

  Shows one server book entity: its metadata, reading progress, a
  "continue reading" shortcut, the chapter list (each chapter is a text), and a
  delete action. The GET page (`/book/{id}`) 302s into the bundled client, which
  fetches the book from GET /api/v1/books/{id} and mounts this island; delete now
  calls DELETE /api/v1/books/{id} (bearer-authed) instead of the native form POST
  to /book/{id}/delete, and the entry's `onDeleted` navigates to the book list.

  Server-gated: the book entity is server-only (no local-first router entry), so
  this island is only mounted when a server is connected (gate in app/book.ts).
  Chapter read/edit links are plain anchors handled by the app link-router.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { BooksApi, type Book, type BookChapter } from '@modules/book/api/books_api';

  const {
    book,
    chapters,
    onDeleted
  }: { book: Book; chapters: BookChapter[]; onDeleted: () => void } = $props();

  let deleting = $state(false);
  let error = $state('');

  const progressPct = $derived(Math.round(book.progress * 10) / 10);
  const firstChapterId = $derived(chapters.length > 0 ? chapters[0].id : null);

  async function handleDelete(): Promise<void> {
    if (deleting) {
      return;
    }
    if (!confirm(t('book.confirm_delete_book'))) {
      return;
    }
    deleting = true;
    error = '';
    const res = await BooksApi.remove(book.id);
    if (res.error) {
      error = res.error;
      deleting = false;
      return;
    }
    onDeleted();
  }

  onMount(() => {
    initIcons();
  });
</script>

<h2 class="title is-4">{book.title}</h2>

<!-- Action card (mirrors PageLayoutHelper::buildActionCard). -->
<div class="card action-card mb-4">
  <div class="card-content">
    <div class="buttons is-centered">
      <a href="/books" class="button is-light">
        <span class="icon"><i data-lucide="library"></i></span>
        <span>{t('book.all_books')}</span>
      </a>
      <a href="/texts/new" class="button is-light">
        <span class="icon"><i data-lucide="file-up"></i></span>
        <span>{t('book.import_epub')}</span>
      </a>
    </div>
  </div>
</div>

{#if error}
  <div class="notification is-danger is-light">
    <button class="delete" aria-label="close" onclick={() => (error = '')}></button>
    <span>{error}</span>
  </div>
{/if}

<div class="box">
  <div class="columns">
    <div class="column is-8">
      <div class="content">
        {#if book.author}
          <p><strong>{t('common.author')}:</strong> {book.author}</p>
        {/if}
        {#if book.description}
          <p><strong>{t('common.description')}:</strong> {book.description}</p>
        {/if}
        <p>
          <strong>{t('book.source')}:</strong>
          <span class="tag is-info">{book.sourceType.toUpperCase()}</span>
        </p>
        <p>
          <strong>{t('book.col_progress')}:</strong>
          {t('book.chapter_x_of_y', { current: book.currentChapter, total: book.totalChapters })}
          ({progressPct}%)
        </p>
        <progress class="progress is-primary" value={book.progress} max="100">{progressPct}%</progress>
      </div>

      {#if firstChapterId !== null}
        <a href={`/text/${firstChapterId}/read`} class="button is-primary is-medium">
          <span class="icon"><i data-lucide="book-open"></i></span>
          <span class="ml-2">{t('book.continue_reading')}</span>
        </a>
      {/if}
    </div>

    <div class="column is-4">
      <div class="buttons">
        <button
          type="button"
          class="button is-danger is-outlined"
          class:is-loading={deleting}
          disabled={deleting}
          onclick={handleDelete}
        >
          <span class="icon"><i data-lucide="trash-2"></i></span>
          <span class="ml-2">{t('book.delete_book')}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Chapters -->
<div class="box">
  <h3 class="title is-5">{t('book.chapters')}</h3>

  {#if chapters.length === 0}
    <p class="has-text-grey">{t('book.no_chapters_found')}</p>
  {:else}
    <table class="table is-fullwidth is-hoverable">
      <thead>
        <tr>
          <th style="width: 60px;">#</th>
          <th>{t('common.title')}</th>
          <th style="width: 100px;">{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each chapters as chapter (chapter.id)}
          <tr class={chapter.num === book.currentChapter ? 'is-selected' : ''}>
            <td>{chapter.num}</td>
            <td>
              <a href={`/text/${chapter.id}/read`}>{chapter.title}</a>
              {#if chapter.num === book.currentChapter}
                <span class="tag is-small is-info ml-2">{t('common.current')}</span>
              {/if}
            </td>
            <td>
              <a href={`/text/${chapter.id}/read`} class="button is-small is-primary" title={t('common.read')}>
                <span class="icon is-small"><i data-lucide="book-open"></i></span>
              </a>
              <a href={`/texts/${chapter.id}/edit`} class="button is-small is-light" title={t('common.edit')}>
                <span class="icon is-small"><i data-lucide="edit"></i></span>
              </a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
