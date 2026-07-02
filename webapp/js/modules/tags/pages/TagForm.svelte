<!--
  Tag Form — Svelte 5 port of the Alpine tag form (`Modules/Tags/Views/tag_form.php`,
  whose inline `x-data` held `tagText` / `tagComment` / `charCount`).

  The new/edit form for a single term tag (`kind: 'term'`) or text tag
  (`kind: 'text'`); `mode: 'edit'` prefills from the tag fetched by the entry.
  Faithful port of the Bulma markup and i18n labels; only the submit path changed:
  instead of a native POST to the server form, it creates/edits via the tags API
  (`POST /tags/{kind}`, `PUT /tags/{kind}/{id}`) and, on success, navigates to the
  tag list (`listUrl`, threaded in by the entry so this island stays URL-agnostic).

  Server-only: the page that mounts this island (`tag-form.ts`) is gated to a
  connected server, since those tag endpoints have no local-first router arm.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { TagsApi } from '@modules/tags/api/tags_api';
  import type { ApiResponse } from '@shared/api/client';

  interface Props {
    kind: 'term' | 'text';
    mode: 'new' | 'edit';
    /** Tag id in edit mode (0 for new). */
    tagId: number;
    initialText: string;
    initialComment: string;
    /** Bundle URL of the tag list — cancel + save-success both land here. */
    listUrl: string;
  }

  const { kind, mode, tagId, initialText, initialComment, listUrl }: Props = $props();

  // `mode` is a static mount-time prop; deriving keeps svelte-check happy about
  // reading a prop at the top level.
  const isEdit = $derived(mode === 'edit');
  const pageTitle = $derived(t(isEdit ? 'tags.form_edit_title' : 'tags.form_new_title'));
  const submitLabel = $derived(t(isEdit ? 'tags.form_change' : 'tags.form_save'));

  // Mutable copies seeded once from the (static) prefill props.
  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  // svelte-ignore state_referenced_locally
  let comment = $state(initialComment);
  let submitting = $state(false);
  let errorMessage = $state('');

  const charCount = $derived(comment.length);
  const trimmedName = $derived(text.trim());
  // Matches tag_form.php's `notempty noblanksnocomma` + maxlength=20 constraints.
  const nameInvalid = $derived(trimmedName === '' || /[\s,]/.test(text) || text.length > 20);
  const canSubmit = $derived(!nameInvalid && !submitting);

  function normalize<T extends { success?: boolean; error?: string }>(
    res: ApiResponse<T>
  ): { ok: boolean; error: string } {
    if (res.error || !res.data || res.data.error || !res.data.success) {
      return { ok: false, error: res.data?.error || res.error || t('tags.flash.unknown_error') };
    }
    return { ok: true, error: '' };
  }

  async function persist(name: string): Promise<{ ok: boolean; error: string }> {
    if (isEdit) {
      return normalize(
        kind === 'term'
          ? await TagsApi.updateTerm(tagId, name, comment)
          : await TagsApi.updateText(tagId, name, comment)
      );
    }
    return normalize(
      kind === 'term'
        ? await TagsApi.createTerm(name, comment)
        : await TagsApi.createText(name, comment)
    );
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    submitting = true;
    errorMessage = '';
    const result = await persist(trimmedName);
    if (result.ok) {
      window.location.assign(listUrl);
      return;
    }
    errorMessage = result.error;
    submitting = false;
  }

  // Re-hydrate the lucide icons (asterisk / save) once the markup is in the DOM.
  $effect(() => {
    void tick().then(() => initIcons());
  });
</script>

<div class="container" style="max-width: 640px;">
  <h2 class="title is-4">{pageTitle}</h2>

  {#if errorMessage}
    <div class="notification is-danger is-light">{errorMessage}</div>
  {/if}

  <form class="validate" onsubmit={handleSubmit}>
    <div class="box">
      <!-- Tag Name -->
      <div class="field is-horizontal">
        <div class="field-label is-normal">
          <label class="label" for="tag-text">{t('tags.form_label_tag')}</label>
        </div>
        <div class="field-body">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input
                type="text"
                class="input"
                id="tag-text"
                bind:value={text}
                maxlength="20"
                placeholder={t('tags.form_placeholder_tag')}
                required
              />
            </div>
            <div class="control">
              <span class="icon has-text-danger" title={t('tags.form_field_required')}>
                <i data-lucide="asterisk"></i>
              </span>
            </div>
          </div>
          <p class="help">{t('tags.form_help_tag')}</p>
        </div>
      </div>

      <!-- Comment -->
      <div class="field is-horizontal">
        <div class="field-label is-normal">
          <label class="label" for="tag-comment">{t('tags.form_label_comment')}</label>
        </div>
        <div class="field-body">
          <div class="field">
            <div class="control">
              <textarea
                class="textarea"
                id="tag-comment"
                bind:value={comment}
                maxlength="200"
                rows="3"
                placeholder={t('tags.form_placeholder_comment')}
              ></textarea>
            </div>
            <p class="help">
              <span class:has-text-danger={charCount > 200} class:has-text-grey={charCount <= 200}>
                {t('tags.form_help_comment_count', { count: charCount })}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Form Actions -->
    <div class="field is-grouped is-grouped-right">
      <div class="control">
        <a class="button is-light" href={listUrl}>{t('tags.form_cancel')}</a>
      </div>
      <div class="control">
        <button type="submit" class="button is-primary" class:is-loading={submitting} disabled={!canSubmit}>
          <span class="icon is-small"><i data-lucide="save"></i></span>
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  </form>
</div>
