<!--
  Admin Settings — Svelte 5 port of the server `Admin/Views/settings_form.php`.

  Edits the server-wide admin settings: newsfeed limits (max articles with/without
  cached text, max texts per feed) and multi-user flags (allow registration, check
  for updates). Reads current values from GET /api/v1/settings/admin and saves each
  via POST /api/v1/settings — both admin-scoped (AdminApiHandler returns 403 for a
  non-admin in multi-user mode), replacing the native admin form.

  Server-only: these settings configure the server, so the page is gated (offline
  it shows a "connect a server" notice; the gate lives in app/admin-settings.ts).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { SettingsApi } from '@modules/admin/api/settings_api';

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  // Field state (strings/bools mirroring the server form).
  let maxWithText = $state('100');
  let maxWithoutText = $state('100');
  let maxTexts = $state('30');
  let allowRegistration = $state(true);
  let checkForUpdates = $state(true);

  onMount(async () => {
    const res = await SettingsApi.getAdminSettings();
    if (res.error || !res.data) {
      error = res.error || 'Could not load admin settings.';
      loading = false;
      return;
    }
    const s = res.data;
    maxWithText = s['set-max-articles-with-text'] ?? maxWithText;
    maxWithoutText = s['set-max-articles-without-text'] ?? maxWithoutText;
    maxTexts = s['set-max-texts-per-feed'] ?? maxTexts;
    allowRegistration = (s['set-allow-registration'] ?? '1') !== '0';
    checkForUpdates = (s['set-check-for-updates'] ?? '1') !== '0';
    loading = false;
    initIcons();
  });

  async function save(): Promise<void> {
    if (saving) {
      return;
    }
    saving = true;
    error = '';
    saved = false;

    const updates: Array<[string, string]> = [
      ['set-max-articles-with-text', String(parseInt(maxWithText, 10) || 0)],
      ['set-max-articles-without-text', String(parseInt(maxWithoutText, 10) || 0)],
      ['set-max-texts-per-feed', String(parseInt(maxTexts, 10) || 0)],
      ['set-allow-registration', allowRegistration ? '1' : '0'],
      ['set-check-for-updates', checkForUpdates ? '1' : '0']
    ];

    for (const [key, value] of updates) {
      const res = await SettingsApi.save(key, value);
      if (res.error || res.data?.error) {
        error = res.error || res.data?.error || 'Could not save settings.';
        saving = false;
        return;
      }
    }
    saving = false;
    saved = true;
  }
</script>

<h1 class="title is-4">{t('navbar.admin_settings')}</h1>

{#if error}
  <div class="notification is-danger is-light">
    <button class="delete" aria-label="close" onclick={() => (error = '')}></button>
    <span>{error}</span>
  </div>
{/if}

{#if saved}
  <div class="notification is-success is-light">
    <button class="delete" aria-label="close" onclick={() => (saved = false)}></button>
    <span>Settings saved.</span>
  </div>
{/if}

{#if loading}
  <progress class="progress is-small is-primary" max="100"></progress>
{:else}
  <!-- Newsfeeds -->
  <div class="box">
    <h2 class="title is-5">
      <span class="icon-text">
        <span class="icon"><i data-lucide="rss"></i></span>
        <span>{t('admin.settings_section_newsfeeds')}</span>
      </span>
    </h2>

    <div class="field">
      <label class="label" for="set-max-articles-with-text">{t('admin.settings_max_articles_with_text')}</label>
      <div class="control">
        <input
          id="set-max-articles-with-text"
          class="input"
          type="number"
          min="1"
          max="9999"
          bind:value={maxWithText}
        />
      </div>
      <p class="help">{t('admin.settings_max_articles_with_text_help')}</p>
    </div>

    <div class="field">
      <label class="label" for="set-max-articles-without-text">{t('admin.settings_max_articles_with_text')}</label>
      <div class="control">
        <input
          id="set-max-articles-without-text"
          class="input"
          type="number"
          min="1"
          max="9999"
          bind:value={maxWithoutText}
        />
      </div>
      <p class="help">{t('admin.settings_max_articles_without_text_help')}</p>
    </div>

    <div class="field">
      <label class="label" for="set-max-texts-per-feed">{t('admin.settings_max_texts_per_feed')}</label>
      <div class="control">
        <input
          id="set-max-texts-per-feed"
          class="input"
          type="number"
          min="1"
          max="9999"
          bind:value={maxTexts}
        />
      </div>
      <p class="help">{t('admin.settings_max_texts_per_feed_help')}</p>
    </div>
  </div>

  <!-- Multi-user -->
  <div class="box">
    <h2 class="title is-5">
      <span class="icon-text">
        <span class="icon"><i data-lucide="users"></i></span>
        <span>{t('admin.settings_section_multi_user')}</span>
      </span>
    </h2>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" bind:checked={allowRegistration} />
        {t('admin.settings_allow_registration')}
      </label>
      <p class="help">{t('admin.settings_allow_registration_help')}</p>
    </div>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" bind:checked={checkForUpdates} />
        {t('admin.settings_check_for_updates')}
      </label>
      <p class="help">{t('admin.settings_check_for_updates_help')}</p>
    </div>
  </div>

  <div class="field">
    <div class="control">
      <button
        type="button"
        class="button is-primary"
        class:is-loading={saving}
        disabled={saving}
        onclick={save}
      >
        <span class="icon"><i data-lucide="save"></i></span>
        <span>{t('common.save')}</span>
      </button>
    </div>
  </div>
{/if}
