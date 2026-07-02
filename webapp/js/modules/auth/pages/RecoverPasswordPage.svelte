<!--
  Recover with a one-time code — Svelte 5 port of the server-rendered
  `recover_password.php` session form. For accounts created without an email:
  the user supplies their username + one-time recovery code + a new password,
  posted to `POST /api/v1/auth/password/recover`. On success the server rotates
  the recovery code and returns the new one, which is shown once inline
  (RecoveryCodeDisplay, context 'reset') before heading to `/login` — replacing
  the retired `GET /register/recovery-code` page.

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
  import RecoveryCodeDisplay from './RecoveryCodeDisplay.svelte';

  interface RecoverResponse {
    success?: boolean;
    error?: string;
    /** The freshly rotated one-time recovery code, shown once on success. */
    recovery_code?: string;
  }

  let { uiLocale = '', uiLocales = [] }: { uiLocale?: string; uiLocales?: string[] } = $props();

  let username = $state('');
  let recoveryCodeInput = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let loading = $state(false);
  let error = $state('');
  /** The new recovery code returned on success — shown once before /login. */
  let newRecoveryCode = $state('');

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

  async function submitRecover(): Promise<void> {
    validatePassword();
    validatePasswordConfirm();
    if (username.trim() === '' || recoveryCodeInput.trim() === '' || !password) {
      error = t('user.flash.recover_missing_fields');
      return;
    }
    if (hasErrors) {
      return;
    }

    loading = true;
    error = '';

    const res: ApiResponse<RecoverResponse> = await apiPost<RecoverResponse>('/auth/password/recover', {
      username: username.trim(),
      recovery_code: recoveryCodeInput.trim(),
      password,
      password_confirm: passwordConfirm
    });
    loading = false;

    if (res.error) {
      error = res.error;
      return;
    }
    const data = res.data;
    if (!data || data.success !== true || !data.recovery_code) {
      error = data && data.error ? data.error : 'Could not reset your password. Check your username and recovery code.';
      return;
    }
    password = '';
    passwordConfirm = '';
    newRecoveryCode = data.recovery_code;
  }

  /** Leave the rotated-code screen and head to login. */
  function continueToLogin(): void {
    newRecoveryCode = '';
    window.location.assign('/login');
  }

  $effect(() => {
    void error;
    void loading;
    void newRecoveryCode;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

<div class="box">
  {#if newRecoveryCode}
    <RecoveryCodeDisplay code={newRecoveryCode} context="reset" onContinue={continueToLogin} />
  {:else}
    <GuestLangSwitcher {uiLocale} {uiLocales} />

    <div class="has-text-centered mb-5">
      <h1 class="title is-3">
        <span class="icon-text">
          <span class="icon has-text-primary"><i data-lucide="key"></i></span>
          <span>{t('user.recovery.reset_page_title')}</span>
        </span>
      </h1>
      <p class="subtitle is-6 has-text-grey">{t('user.recovery.reset_subtitle')}</p>
    </div>

    {#if error}
      <div class="notification is-danger is-light">
        <span>{error}</span>
      </div>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submitRecover();
      }}
    >
      <div class="field">
        <label class="label" for="recover-username">{t('user.recovery.username_label')}</label>
        <div class="control has-icons-left">
          <input
            type="text"
            id="recover-username"
            class="input"
            bind:value={username}
            autocapitalize="off"
            autocomplete="username"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="user"></i></span>
        </div>
      </div>

      <div class="field">
        <label class="label" for="recover-code">{t('user.recovery.code_input_label')}</label>
        <div class="control has-icons-left">
          <input
            type="text"
            id="recover-code"
            class="input"
            style="font-family: monospace; letter-spacing: 0.05em;"
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            bind:value={recoveryCodeInput}
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="key"></i></span>
        </div>
      </div>

      <div class="field">
        <label class="label" for="recover-password">{t('user.reset.password_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="recover-password"
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
        <label class="label" for="recover-password-confirm">{t('user.reset.password_confirm_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="recover-password-confirm"
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
            <span>{t('user.recovery.reset_submit')}</span>
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
