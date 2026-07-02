<!--
  Feed Form Page — Svelte 5 port of the Alpine feed new/edit form
  (`Modules/Feed/Views/new.php` + `edit.php`, whose `x-data="feedForm()"` held
  the option toggles + `serializeOptions`).

  The standalone create/edit form served at `/feeds/new` and `/feeds/{id}/edit`
  (both 302 into the bundle). One island covers both modes:
    - create (`feed === null`): empty form, `POST /api/v1/feeds`.
    - edit (`feed` prefilled): `PUT /api/v1/feeds/{id}`.
  On success it navigates to the feed manager (`listUrl`); server-side validation
  errors (`{success:false,error}`) surface inline.

  This is NOT the store-bound `FeedForm.svelte` used inside the FeedsPage SPA —
  that one is a plain options text input; this one ports the full toggle UI.
  The option (de)serialization lives in `utils/feed_form_options.ts` (unit-tested,
  round-trips against the server's `getNfOption` format).

  Server-only: the page that mounts this island (`feed-form.ts`) is gated to a
  connected server, since the `/api/v1/feeds` endpoints have no local-first arm.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { createFeed, updateFeed, type Feed, type Language } from '@modules/feed/api/feeds_api';
  import {
    type FeedFormOptionsState,
    defaultFeedFormOptionsState,
    parseFeedOptions,
    serializeFeedOptions
  } from '@modules/feed/utils/feed_form_options';

  interface Props {
    mode: 'new' | 'edit';
    /** Feed id in edit mode (0 for create). */
    feedId: number;
    languages: Language[];
    /** Pre-selected language for create mode (0 when none). */
    currentLang: number;
    /** Prefill in edit mode; null for create. */
    feed: Feed | null;
    /** Bundle URL of the feed manager — cancel + save-success both land here. */
    listUrl: string;
  }

  const { mode, feedId, languages, currentLang, feed, listUrl }: Props = $props();

  const isEdit = $derived(mode === 'edit');

  // Mutable form state, seeded once from the (static) prefill props.
  // svelte-ignore state_referenced_locally
  let name = $state(feed?.name ?? '');
  // svelte-ignore state_referenced_locally
  let sourceUri = $state(feed?.sourceUri ?? '');
  // svelte-ignore state_referenced_locally
  let articleSectionTags = $state(feed?.articleSectionTags ?? '');
  // svelte-ignore state_referenced_locally
  let filterTags = $state(feed?.filterTags ?? '');
  // svelte-ignore state_referenced_locally
  let langId = $state(feed?.langId ?? currentLang ?? 0);
  // svelte-ignore state_referenced_locally
  let opts = $state<FeedFormOptionsState>(
    feed ? parseFeedOptions(feed.optionsString ?? '') : defaultFeedFormOptionsState()
  );

  let submitting = $state(false);
  let errorMessage = $state('');

  const pageTitle = $derived(t(isEdit ? 'feed.edit_title' : 'feed.new_title'));
  const submitLabel = $derived(t(isEdit ? 'feed.edit_update' : 'feed.new_save'));

  function setLang(value: string): void {
    langId = value === '' ? 0 : parseInt(value, 10);
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    submitting = true;
    errorMessage = '';

    const data = {
      langId,
      name: name.trim(),
      sourceUri: sourceUri.trim(),
      articleSectionTags,
      filterTags,
      options: serializeFeedOptions(opts)
    };

    const res = isEdit ? await updateFeed(feedId, data) : await createFeed(data);
    if (res.error || !res.data || res.data.success === false || res.data.error) {
      errorMessage = res.data?.error || res.error || 'Unable to save the feed.';
      submitting = false;
      return;
    }

    window.location.assign(listUrl);
  }

  // Re-hydrate the lucide icons once the markup is in the DOM.
  $effect(() => {
    void tick().then(() => initIcons());
  });
</script>

<div class="container" style="max-width: 720px;">
  <h2 class="title is-4">{pageTitle}</h2>

  {#if errorMessage}
    <div class="notification is-danger is-light">{errorMessage}</div>
  {/if}

  <form class="validate" onsubmit={handleSubmit}>
    <div class="box">
      <!-- Language -->
      <div class="field">
        <label class="label" for="feed-form-language">{t('feed.new_label_language')}</label>
        <div class="control">
          <div class="select is-fullwidth">
            <select
              id="feed-form-language"
              value={langId}
              onchange={(e) => setLang(e.currentTarget.value)}
              required
            >
              {#if langId === 0}
                <option value="">{t('feed.spa_form_select_language')}</option>
              {/if}
              {#each languages as lang (lang.id)}
                <option value={lang.id}>{lang.name}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <!-- Name -->
      <div class="field">
        <label class="label" for="feed-form-name">
          {t('feed.new_label_name')}
          <span class="has-text-danger" title={t('feed.new_required')}>*</span>
        </label>
        <div class="control">
          <input
            id="feed-form-name"
            class="input"
            type="text"
            bind:value={name}
            placeholder={t('feed.new_placeholder_name')}
            required
          />
        </div>
      </div>

      <!-- Newsfeed URL -->
      <div class="field">
        <label class="label" for="feed-form-url">
          {t('feed.new_label_url')}
          <span class="has-text-danger" title={t('feed.new_required')}>*</span>
        </label>
        <div class="control">
          <input
            id="feed-form-url"
            class="input"
            type="url"
            bind:value={sourceUri}
            placeholder={t('feed.new_placeholder_url')}
            required
          />
        </div>
      </div>

      <!-- Article Section -->
      <div class="field">
        <label class="label" for="feed-form-section">
          {t('feed.new_label_article_section')}
          <span class="has-text-danger" title={t('feed.new_required')}>*</span>
        </label>
        <div class="control">
          <input
            id="feed-form-section"
            class="input"
            type="text"
            bind:value={articleSectionTags}
            placeholder={t('feed.new_placeholder_article_section')}
            required
          />
        </div>
      </div>

      <!-- Filter Tags -->
      <div class="field">
        <label class="label" for="feed-form-filter">{t('feed.new_label_filter_tags')}</label>
        <div class="control">
          <input
            id="feed-form-filter"
            class="input"
            type="text"
            bind:value={filterTags}
            placeholder={t('feed.new_placeholder_filter_tags')}
          />
        </div>
      </div>

      <!-- Options -->
      <div class="field">
        <p class="label">{t('feed.new_label_options')}</p>
        <div class="box" style="background-color: var(--bulma-scheme-main-bis);">
          <div class="columns is-multiline">
            <!-- Edit Text -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.editText} />
                <strong>{t('feed.new_opt_review_before_importing')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_review_help')}</p>
            </div>

            <!-- Auto Update -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.autoUpdate} />
                <strong>{t('feed.new_opt_auto_refresh')}</strong>
              </label>
              {#if opts.autoUpdate}
                <div class="field has-addons mt-2">
                  <div class="control">
                    <input
                      class="input is-small"
                      type="number"
                      min="1"
                      style="width: 80px;"
                      bind:value={opts.autoUpdateValue}
                    />
                  </div>
                  <div class="control">
                    <div class="select is-small">
                      <select bind:value={opts.autoUpdateUnit}>
                        <option value="h">{t('feed.new_opt_unit_hours')}</option>
                        <option value="d">{t('feed.new_opt_unit_days')}</option>
                        <option value="w">{t('feed.new_opt_unit_weeks')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Max Links -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.maxLinks} />
                <strong>{t('feed.new_opt_limit_articles')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_limit_articles_help')}</p>
              {#if opts.maxLinks}
                <div class="control mt-2">
                  <input
                    class="input is-small"
                    type="number"
                    min="1"
                    max="300"
                    style="width: 100px;"
                    bind:value={opts.maxLinksValue}
                  />
                </div>
              {/if}
            </div>

            <!-- Charset -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.charset} />
                <strong>{t('feed.new_opt_charset')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_charset_help')}</p>
              {#if opts.charset}
                <div class="control mt-2">
                  <input
                    class="input is-small"
                    type="text"
                    placeholder={t('feed.new_opt_charset_placeholder')}
                    bind:value={opts.charsetValue}
                  />
                </div>
              {/if}
            </div>

            <!-- Max Texts -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.maxTexts} />
                <strong>{t('feed.new_opt_limit_texts')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_limit_texts_help')}</p>
              {#if opts.maxTexts}
                <div class="control mt-2">
                  <input
                    class="input is-small"
                    type="number"
                    min="1"
                    max="30"
                    style="width: 100px;"
                    bind:value={opts.maxTextsValue}
                  />
                </div>
              {/if}
            </div>

            <!-- Tag -->
            <div class="column is-half">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.tag} />
                <strong>{t('feed.new_opt_auto_tag')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_auto_tag_help')}</p>
              {#if opts.tag}
                <div class="control mt-2">
                  <input
                    class="input is-small"
                    type="text"
                    placeholder={t('feed.new_opt_auto_tag_placeholder')}
                    bind:value={opts.tagValue}
                  />
                </div>
              {/if}
            </div>

            <!-- Article Source -->
            <div class="column is-full">
              <label class="checkbox">
                <input type="checkbox" bind:checked={opts.articleSource} />
                <strong>{t('feed.new_opt_source')}</strong>
              </label>
              <p class="help">{t('feed.new_opt_source_help')}</p>
              {#if opts.articleSource}
                <div class="control mt-2">
                  <input
                    class="input is-small"
                    type="text"
                    placeholder={t('feed.new_opt_source_placeholder')}
                    bind:value={opts.articleSourceValue}
                  />
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="field is-grouped is-grouped-right">
      <div class="control">
        <a class="button is-light" href={listUrl}>{t('feed.new_cancel')}</a>
      </div>
      <div class="control">
        <button
          type="submit"
          class="button is-primary"
          class:is-loading={submitting}
          disabled={submitting}
        >
          <span class="icon is-small"><i data-lucide="save"></i></span>
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  </form>
</div>
