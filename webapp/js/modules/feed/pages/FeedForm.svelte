<!--
  Feed Form — Svelte 5 port of the Alpine `feedForm` component.

  The shared create/edit form. It two-way binds the shared `FeedManagerStore`'s
  `editingFeed` draft (seeded by `showCreateForm` / `showEditForm`) and, on
  submit, calls `createFeed` (create mode) or `updateFeed` with the current
  feed's id (edit mode) — both reload the list and return to it, in the store.
  Behaviour matches the Alpine version; only the rendering is Svelte.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { t } from '@shared/i18n/translator';
  import type { FeedManagerStore } from '@modules/feed/stores/feed_manager_store.svelte';

  let { store }: { store: FeedManagerStore } = $props();

  const isCreate = $derived(store.viewMode === 'create');

  function setLang(value: string): void {
    if (!store.editingFeed) return;
    store.editingFeed.langId = value === '' ? 0 : parseInt(value, 10);
  }

  async function submit(): Promise<void> {
    const feed = store.editingFeed;
    if (!feed) return;

    const data = {
      langId: feed.langId || 0,
      name: feed.name || '',
      sourceUri: feed.sourceUri || '',
      articleSectionTags: feed.articleSectionTags || '',
      filterTags: feed.filterTags || '',
      options: feed.options || ''
    };

    if (isCreate) {
      await store.createFeed(data);
    } else if (store.currentFeed) {
      await store.updateFeed(store.currentFeed.id, data);
    }
  }
</script>

<div>
  <!-- Header -->
  <div class="level mb-4">
    <div class="level-left">
      <div class="level-item">
        <button class="button" onclick={() => store.showList()}>
          <i data-lucide="arrow-left" class="icon icon-sm" style="width:16px;height:16px"></i>
          <span>{t('feed.spa_back')}</span>
        </button>
      </div>
      <div class="level-item">
        <h2 class="title is-4">
          {isCreate ? t('feed.spa_create_new_feed') : t('feed.spa_edit_feed')}
        </h2>
      </div>
    </div>
  </div>

  {#if store.editingFeed}
    <!-- Form -->
    <div class="box">
      <form
        onsubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <!-- Language -->
        <div class="field">
          <label class="label" for="feed-form-language">{t('feed.spa_form_language')}</label>
          <div class="control">
            <div class="select">
              <select
                id="feed-form-language"
                value={store.editingFeed.langId}
                onchange={(e) => setLang(e.currentTarget.value)}
                required
              >
                <option value="">{t('feed.spa_form_select_language')}</option>
                {#each store.languages as lang (lang.id)}
                  <option value={lang.id}>{lang.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>

        <!-- Name -->
        <div class="field">
          <label class="label" for="feed-form-name">{t('feed.spa_form_feed_name')}</label>
          <div class="control">
            <input
              id="feed-form-name"
              class="input"
              type="text"
              bind:value={store.editingFeed.name}
              required
              placeholder={t('feed.spa_form_feed_name_placeholder')}
              maxlength="40"
            />
          </div>
          <p class="help">{t('feed.spa_form_feed_name_help')}</p>
        </div>

        <!-- Source URI -->
        <div class="field">
          <label class="label" for="feed-form-url">{t('feed.spa_form_feed_url')}</label>
          <div class="control">
            <input
              id="feed-form-url"
              class="input"
              type="url"
              bind:value={store.editingFeed.sourceUri}
              required
              placeholder="https://example.com/feed.xml"
            />
          </div>
          <p class="help">{t('feed.spa_form_feed_url_help')}</p>
        </div>

        <!-- Article Section Tags -->
        <div class="field">
          <label class="label" for="feed-form-section">{t('feed.spa_form_article_section_tags')}</label>
          <div class="control">
            <input
              id="feed-form-section"
              class="input"
              type="text"
              bind:value={store.editingFeed.articleSectionTags}
              placeholder="//article | //div[@class='content']"
            />
          </div>
          <p class="help">{t('feed.spa_form_article_section_help')}</p>
        </div>

        <!-- Filter Tags -->
        <div class="field">
          <label class="label" for="feed-form-filter">{t('feed.spa_form_filter_tags')}</label>
          <div class="control">
            <input
              id="feed-form-filter"
              class="input"
              type="text"
              bind:value={store.editingFeed.filterTags}
              placeholder="//nav | //aside | //footer"
            />
          </div>
          <p class="help">{t('feed.spa_form_filter_tags_help')}</p>
        </div>

        <!-- Options -->
        <div class="field">
          <label class="label" for="feed-form-options">{t('feed.spa_form_options')}</label>
          <div class="control">
            <input
              id="feed-form-options"
              class="input"
              type="text"
              bind:value={store.editingFeed.options}
              placeholder="edit_text=1,autoupdate=2h,max_links=50"
            />
          </div>
          <p class="help">{t('feed.spa_form_options_help')}</p>
        </div>

        <!-- Submit -->
        <div class="field">
          <div class="control">
            <div class="buttons">
              <button type="submit" class="button is-primary" disabled={store.isSubmitting}>
                <!-- Always rendered (icon hydrates with the form), shown only while
                     submitting — the Alpine `x-show="isSubmitting"` semantics. -->
                <span class="icon" style:display={store.isSubmitting ? '' : 'none'}>
                  <i data-lucide="loader-2" class="icon animate-spin icon-sm" style="width:16px;height:16px"></i>
                </span>
                <span>{isCreate ? t('feed.spa_form_create_feed') : t('feed.spa_form_update_feed')}</span>
              </button>
              <button type="button" class="button" onclick={() => store.showList()}>
                {t('feed.spa_form_cancel')}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  {/if}

  <!-- Tip for advanced setup -->
  <div class="notification is-info is-light mt-4">
    <p>
      <strong>{t('feed.spa_tip')}</strong>
      {t('feed.spa_tip_body')}
      <a href="/feeds/new">{t('feed.spa_tip_link')}</a>.
    </p>
  </div>
</div>
