<!--
  Books List — Svelte 5 port of the server `Book/Views/index.php` view.

  Lists the reader's server book entities (paginated, filterable by language),
  each linking to its detail page. The GET page (`/books`) 302s into the bundled
  client, which mounts this island; it reads from GET /api/v1/books and deletes
  via DELETE /api/v1/books/{id} (bearer-authed), replacing the native form POSTs.

  Server-gated: book entities are server-only (no local-first router entry), so
  this island is only mounted when a server is connected (gate in app/books.ts).
  Title links are plain anchors handled by the app link-router.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { BooksApi, type Book, type BooksPagination } from '@modules/book/api/books_api';
  import { LanguagesApi } from '@modules/language/api/languages_api';

  let books = $state<Book[]>([]);
  let pagination = $state<BooksPagination>({ total: 0, page: 1, per_page: 20, total_pages: 1 });
  let languages = $state<Array<{ id: number; name: string }>>([]);
  let languageFilter = $state<number | null>(null);
  let page = $state(1);
  let loading = $state(true);
  let error = $state('');
  let deletingId = $state<number | null>(null);

  async function loadBooks(): Promise<void> {
    loading = true;
    error = '';
    const res = await BooksApi.list(languageFilter ?? undefined, page);
    if (res.error || !res.data) {
      error = res.error || 'Could not load books.';
      books = [];
      loading = false;
      return;
    }
    books = res.data.books;
    pagination = res.data.pagination;
    loading = false;
    await tick();
    initIcons();
  }

  function onFilterChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    languageFilter = value === '' ? null : Number(value);
    page = 1;
    void loadBooks();
  }

  function goToPage(n: number): void {
    if (n < 1 || n > pagination.total_pages || n === page) {
      return;
    }
    page = n;
    void loadBooks();
  }

  async function handleDelete(book: Book): Promise<void> {
    if (deletingId !== null) {
      return;
    }
    if (!confirm(t('book.confirm_delete_book'))) {
      return;
    }
    deletingId = book.id;
    const res = await BooksApi.remove(book.id);
    deletingId = null;
    if (res.error) {
      error = res.error;
      return;
    }
    // Drop back a page if we just deleted the last row on the last page.
    if (books.length === 1 && page > 1) {
      page -= 1;
    }
    await loadBooks();
  }

  onMount(async () => {
    const langRes = await LanguagesApi.list();
    if (langRes.data?.languages) {
      languages = langRes.data.languages;
    }
    await loadBooks();
  });
</script>

<h2 class="title is-4">{t('book.my_books')}</h2>

<!-- Action card (mirrors PageLayoutHelper::buildActionCard). -->
<div class="card action-card mb-4">
  <div class="card-content">
    <div class="buttons is-centered">
      <a href="/texts/new" class="button is-primary">
        <span class="icon"><i data-lucide="file-up"></i></span>
        <span>{t('book.import_epub')}</span>
      </a>
      <a href="/texts/new" class="button is-light">
        <span class="icon"><i data-lucide="circle-plus"></i></span>
        <span>{t('book.new_text')}</span>
      </a>
      <a href="/texts" class="button is-light">
        <span class="icon"><i data-lucide="book-open"></i></span>
        <span>{t('book.all_texts')}</span>
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

<!-- Language filter -->
<div class="box">
  <div class="field">
    <label class="label is-small" for="book-lang-filter">{t('common.language')}</label>
    <div class="control">
      <div class="select is-small">
        <select id="book-lang-filter" onchange={onFilterChange}>
          <option value="" selected={languageFilter === null}>{t('book.all_languages_option')}</option>
          {#each languages as lang (lang.id)}
            <option value={lang.id} selected={languageFilter === lang.id}>{lang.name}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
</div>

{#if loading}
  <progress class="progress is-small is-primary" max="100"></progress>
{:else if books.length === 0}
  <div class="notification is-light">
    <p>{t('book.no_books_found')}</p>
  </div>
{:else}
  <div class="box">
    <table class="table is-fullwidth is-hoverable">
      <thead>
        <tr>
          <th>{t('common.title')}</th>
          <th>{t('common.author')}</th>
          <th>{t('book.col_chapters')}</th>
          <th>{t('book.col_progress')}</th>
          <th>{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each books as book (book.id)}
          <tr>
            <td>
              <a href={`/book/${book.id}`}><strong>{book.title}</strong></a>
              {#if book.sourceType === 'epub'}
                <span class="tag is-small is-info ml-2">EPUB</span>
              {/if}
            </td>
            <td>{book.author ?? ''}</td>
            <td>{book.totalChapters}</td>
            <td>
              <progress
                class="progress is-small is-primary"
                value={book.progress}
                max="100"
                title={`${Math.round(book.progress * 10) / 10}%`}
              >{Math.round(book.progress * 10) / 10}%</progress>
            </td>
            <td>
              {#if book.totalChapters > 0}
                <a href={`/book/${book.id}`} class="button is-small is-primary" title={t('book.continue_reading')}>
                  <span class="icon is-small"><i data-lucide="book-open"></i></span>
                </a>
              {/if}
              <button
                type="button"
                class="button is-small is-danger is-outlined"
                class:is-loading={deletingId === book.id}
                disabled={deletingId !== null}
                title={t('common.delete')}
                onclick={() => handleDelete(book)}
              >
                <span class="icon is-small"><i data-lucide="trash-2"></i></span>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if pagination.total_pages > 1}
    <nav class="pagination is-centered" aria-label="pagination">
      <button
        class="pagination-previous"
        disabled={pagination.page <= 1}
        onclick={() => goToPage(pagination.page - 1)}
      >{t('common.previous')}</button>
      <button
        class="pagination-next"
        disabled={pagination.page >= pagination.total_pages}
        onclick={() => goToPage(pagination.page + 1)}
      >{t('common.next')}</button>
      <ul class="pagination-list">
        {#each Array.from({ length: pagination.total_pages }, (_, i) => i + 1) as n (n)}
          <li>
            <button
              class="pagination-link {n === pagination.page ? 'is-current' : ''}"
              aria-current={n === pagination.page ? 'page' : undefined}
              onclick={() => goToPage(n)}
            >{n}</button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
{/if}
