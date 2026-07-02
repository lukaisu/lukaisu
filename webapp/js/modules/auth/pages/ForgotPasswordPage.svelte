<!--
  Forgot password — Svelte 5 port of the server-rendered `forgot_password.php`
  session form. The guest "email me a reset link" screen: it posts an email to
  `POST /api/v1/auth/password/forgot` and always shows the same neutral success
  message (anti-enumeration — the server silently succeeds whether or not the
  address exists).

  CSRF: same-origin cookie POST with no bearer, so NOT exempt from
  CsrfMiddleware — `apiPost` sends the injected `<meta name=csrf-token>`.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiPost } from '@shared/api/client';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import GuestLangSwitcher from './GuestLangSwitcher.svelte';

  let { uiLocale = '', uiLocales = [] }: { uiLocale?: string; uiLocales?: string[] } = $props();

  let email = $state('');
  let loading = $state(false);
  let error = $state('');
  /** Set once the request has been sent — shows the neutral success notice. */
  let submitted = $state(false);

  async function submitForgot(): Promise<void> {
    if (email.trim() === '') {
      error = 'Please enter your email address.';
      return;
    }

    loading = true;
    error = '';

    // The response is always success (anti-enumeration); we surface the neutral
    // message regardless of transport errors so nothing leaks about the address.
    await apiPost('/auth/password/forgot', { email: email.trim() });
    loading = false;
    submitted = true;
  }

  $effect(() => {
    void error;
    void loading;
    void submitted;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

<div class="box">
  <GuestLangSwitcher {uiLocale} {uiLocales} />

  <!-- Title -->
  <div class="has-text-centered mb-5">
    <h1 class="title is-3">
      <span class="icon-text">
        <span class="icon has-text-primary"><i data-lucide="key"></i></span>
        <span>{t('user.forgot.page_title')}</span>
      </span>
    </h1>
    <p class="subtitle is-6 has-text-grey">{t('user.forgot.subtitle')}</p>
  </div>

  {#if submitted}
    <!-- Neutral success message (shown whether or not the email exists). -->
    <div class="notification is-success is-light">
      <span>{t('user.flash.forgot_sent')}</span>
    </div>
  {:else}
    {#if error}
      <div class="notification is-danger is-light">
        <span>{error}</span>
      </div>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submitForgot();
      }}
    >
      <div class="field">
        <label class="label" for="forgot-email">{t('user.forgot.email_label')}</label>
        <div class="control has-icons-left">
          <input
            type="email"
            id="forgot-email"
            class="input"
            placeholder={t('user.forgot.email_placeholder')}
            bind:value={email}
            autocomplete="email"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="mail"></i></span>
        </div>
      </div>

      <div class="field">
        <div class="control">
          <button
            type="submit"
            class="button is-primary is-fullwidth"
            class:is-loading={loading}
            disabled={loading}
          >
            <span class="icon"><i data-lucide="send"></i></span>
            <span>{t('user.forgot.submit')}</span>
          </button>
        </div>
      </div>
    </form>
  {/if}

  <hr />

  <!-- Recover with a one-time code (accounts created without an email). -->
  <p class="has-text-centered mb-2">
    <a href="/password/recover">
      <span class="icon-text">
        <span class="icon"><i data-lucide="key"></i></span>
        <span>{t('user.recovery.from_forgot_link')}</span>
      </span>
    </a>
  </p>

  <!-- Back to login link -->
  <p class="has-text-centered">
    <a href="/login">
      <span class="icon-text">
        <span class="icon"><i data-lucide="arrow-left"></i></span>
        <span>{t('user.forgot.back_to_login')}</span>
      </span>
    </a>
  </p>
</div>
