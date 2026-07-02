<!--
  Reset password — Svelte 5 port of the server-rendered `reset_password.php`
  session form (+ its Alpine `resetPasswordForm` validator). The guest
  "set a new password with an emailed token" screen: it reads `?token=` (threaded
  in as a prop by `reset-password.ts`), validates the new password client-side,
  and posts to `POST /api/v1/auth/password/reset`. On success it shows a success
  notice and links back to `/login`.

  CSRF: same-origin cookie POST with no bearer, so NOT exempt from
  CsrfMiddleware — `apiPost` sends the injected `<meta name=csrf-token>`.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiPost, type ApiResponse } from '@shared/api/client';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import GuestLangSwitcher from './GuestLangSwitcher.svelte';

  interface ResetResponse {
    success?: boolean;
    error?: string;
  }

  let {
    token = '',
    uiLocale = '',
    uiLocales = []
  }: { token?: string; uiLocale?: string; uiLocales?: string[] } = $props();

  let password = $state('');
  let passwordConfirm = $state('');
  let loading = $state(false);
  let error = $state('');
  let success = $state(false);

  let errors = $state({ password: '', passwordConfirm: '' });
  const hasErrors = $derived(errors.password !== '' || errors.passwordConfirm !== '');

  function validatePassword(): void {
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (password.length > 128) {
      errors.password = 'Password must not exceed 128 characters';
    } else if (!/[a-zA-Z]/.test(password)) {
      errors.password = 'Password must contain at least one letter';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one number';
    } else {
      errors.password = '';
    }
    validatePasswordConfirm();
  }

  function validatePasswordConfirm(): void {
    if (passwordConfirm && password !== passwordConfirm) {
      errors.passwordConfirm = 'Passwords do not match';
    } else {
      errors.passwordConfirm = '';
    }
  }

  async function submitReset(): Promise<void> {
    validatePassword();
    validatePasswordConfirm();
    if (hasErrors || !password) {
      return;
    }

    loading = true;
    error = '';

    const res: ApiResponse<ResetResponse> = await apiPost<ResetResponse>('/auth/password/reset', {
      token,
      password,
      password_confirm: passwordConfirm
    });
    loading = false;

    if (res.error) {
      error = res.error;
      return;
    }
    const data = res.data;
    if (!data || data.success !== true) {
      error = data && data.error ? data.error : 'This reset link has expired. Please request a new one.';
      return;
    }
    password = '';
    passwordConfirm = '';
    success = true;
  }

  $effect(() => {
    void error;
    void loading;
    void success;
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
        <span class="icon has-text-primary"><i data-lucide="lock"></i></span>
        <span>{t('user.reset.page_title')}</span>
      </span>
    </h1>
    <p class="subtitle is-6 has-text-grey">{t('user.reset.subtitle')}</p>
  </div>

  {#if success}
    <div class="notification is-success is-light">
      <span>{t('user.flash.reset_success')}</span>
    </div>
    <div class="field">
      <div class="control">
        <a href="/login" class="button is-primary is-fullwidth">
          <span class="icon"><i data-lucide="log-in"></i></span>
          <span>{t('user.reset.back_to_login')}</span>
        </a>
      </div>
    </div>
  {:else if token === ''}
    <!-- No token in the URL: the link is malformed or was truncated. -->
    <div class="notification is-danger is-light">
      <span>This password reset link is invalid or has expired.</span>
    </div>
    <p class="has-text-centered">
      <a href="/password/forgot">
        <span class="icon-text">
          <span class="icon"><i data-lucide="arrow-left"></i></span>
          <span>{t('user.recovery.from_forgot_link')}</span>
        </span>
      </a>
    </p>
  {:else}
    {#if error}
      <div class="notification is-danger is-light">
        <span>{error}</span>
      </div>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submitReset();
      }}
    >
      <div class="field">
        <label class="label" for="reset-password">{t('user.reset.password_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="reset-password"
            class="input"
            class:is-danger={errors.password}
            placeholder={t('user.reset.password_placeholder')}
            bind:value={password}
            oninput={validatePassword}
            autocomplete="new-password"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="lock"></i></span>
        </div>
        {#if errors.password}
          <p class="help is-danger">{errors.password}</p>
        {:else}
          <p class="help">{t('user.reset.password_help')}</p>
        {/if}
      </div>

      <div class="field">
        <label class="label" for="reset-password-confirm">{t('user.reset.password_confirm_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="reset-password-confirm"
            class="input"
            class:is-danger={errors.passwordConfirm}
            placeholder={t('user.reset.password_confirm_placeholder')}
            bind:value={passwordConfirm}
            oninput={validatePasswordConfirm}
            autocomplete="new-password"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="lock"></i></span>
        </div>
        {#if errors.passwordConfirm}
          <p class="help is-danger">{errors.passwordConfirm}</p>
        {/if}
      </div>

      <div class="field">
        <div class="control">
          <button
            type="submit"
            class="button is-primary is-fullwidth"
            class:is-loading={loading}
            disabled={loading || hasErrors}
          >
            <span class="icon"><i data-lucide="check"></i></span>
            <span>{t('user.reset.submit')}</span>
          </button>
        </div>
      </div>
    </form>

    <hr />

    <p class="has-text-centered">
      <a href="/login">
        <span class="icon-text">
          <span class="icon"><i data-lucide="arrow-left"></i></span>
          <span>{t('user.reset.back_to_login')}</span>
        </span>
      </a>
    </p>
  {/if}
</div>
