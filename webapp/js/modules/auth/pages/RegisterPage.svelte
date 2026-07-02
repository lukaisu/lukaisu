<!--
  Register — Svelte 5 port of the server-rendered `register.php` session form
  (+ its Alpine `registerForm` validator). The same-origin PWA sign-up screen,
  the register counterpart to LoginPage.svelte: it creates an account against
  `POST /api/v1/auth/register` (token API) and enters the app.

  Why this is safe for the still-PHP-rendered app: the register endpoint now
  both (a) establishes a PHP session (the same `Login` use case path login
  takes) AND (b) returns a bearer token — so a successful same-origin sign-up
  leaves the browser with a session cookie (used by the PHP pages) and a token
  (persisted for the bundle client), no session bridge needed.

  Email-less accounts get a one-time recovery code back in the response; it is
  shown once inline (RecoveryCodeDisplay) before entering the app — replacing
  the retired `GET /register/recovery-code` page.

  CSRF: same-origin, cookie-authenticated POST with no bearer yet, so NOT exempt
  from CsrfMiddleware — `apiPost` → `withCsrf` sends the `<meta name=csrf-token>`
  token as `X-CSRF-TOKEN`. Bot defenses mirror the old form: an ALTCHA
  proof-of-work solution (the API's real gate) plus the `homepage` honeypot.

  Svelte compiles to plain JS, so the island runs under the bundle's strict
  `script-src 'self'` CSP with no inline handlers.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiPost, setAuthToken, type ApiResponse } from '@shared/api/client';
  import { solveAltcha } from '@shared/altcha/solve_altcha';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import GuestLangSwitcher from './GuestLangSwitcher.svelte';
  import RecoveryCodeDisplay from './RecoveryCodeDisplay.svelte';

  interface AuthResponse {
    success?: boolean;
    token?: string;
    expires_at?: string | null;
    error?: string;
    /** One-time recovery code, returned when registering without an email. */
    recovery_code?: string;
  }

  // Injected by the host page (`register.ts`): where to go after sign-up (the
  // sanitized `?redirect=`, or '/'), plus the guest UI-language switcher data.
  let {
    redirectTo = '/',
    uiLocale = '',
    uiLocales = []
  }: { redirectTo?: string; uiLocale?: string; uiLocales?: string[] } = $props();

  // --- Reactive state (runes) -------------------------------------------------
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  /** Honeypot — hidden from people; bots that fill it are rejected server-side. */
  let homepage = $state('');
  /** One-time recovery code to show once after an email-less registration. */
  let recoveryCode = $state('');
  let loading = $state(false);
  let error = $state('');

  // Per-field validation errors (mirrors the old Alpine `registerForm`). Field
  // rules have no i18n keys (the PHP form hard-coded English too); the labels /
  // help text below use the existing `user.register.*` bundle keys.
  let errors = $state({ username: '', email: '', password: '', passwordConfirm: '' });

  const hasErrors = $derived(
    errors.username !== '' ||
      errors.email !== '' ||
      errors.password !== '' ||
      errors.passwordConfirm !== ''
  );

  // --- Validation -------------------------------------------------------------
  function validateUsername(): void {
    const value = username.trim();
    if (!value) {
      errors.username = 'Username is required';
    } else if (value.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (value.length > 100) {
      errors.username = 'Username cannot exceed 100 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      errors.username = 'Username can only contain letters, numbers, underscores, and hyphens';
    } else {
      errors.username = '';
    }
  }

  function validateEmail(): void {
    // Email is optional (the username is the unique identity). Only validate the
    // format when the user actually typed something.
    const value = email.trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.email = 'Please enter a valid email address';
    } else {
      errors.email = '';
    }
  }

  function validatePassword(): void {
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (password.length > 128) {
      errors.password = 'Password cannot exceed 128 characters';
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

  // --- Register ---------------------------------------------------------------
  async function submitRegister(): Promise<void> {
    validateUsername();
    validateEmail();
    validatePassword();
    validatePasswordConfirm();
    if (hasErrors) {
      return;
    }

    loading = true;
    error = '';

    // Solve the proof-of-work captcha before submitting (the API's real gate).
    const altcha = await solveAltcha();

    const res = await apiPost<AuthResponse>('/auth/register', {
      username: username.trim(),
      email: email.trim(),
      password,
      password_confirm: passwordConfirm,
      // Honeypot — always empty for a real user; the server rejects if filled.
      homepage,
      altcha
    });
    loading = false;
    finishAuth(res);
  }

  /**
   * Apply the register API result. The handler returns HTTP 200 with
   * `success: false` for validation errors, so both the transport error and the
   * body are checked. On success store the token; if the account is email-less
   * the response carries a one-time recovery code — show it once before entering
   * the app; otherwise enter the app straight away.
   */
  function finishAuth(res: ApiResponse<AuthResponse>): void {
    if (res.error) {
      error = res.error;
      return;
    }
    const data = res.data;
    if (!data || data.success !== true || !data.token) {
      error = data && data.error ? data.error : t('user.flash.register_failed');
      return;
    }

    setAuthToken(data.token, data.expires_at ?? null);
    password = '';
    passwordConfirm = '';

    if (data.recovery_code) {
      recoveryCode = data.recovery_code;
      return;
    }
    enterApp();
  }

  /** Enter the app after a successful sign-up (also from the recovery screen). */
  function enterApp(): void {
    recoveryCode = '';
    window.location.assign(redirectTo);
  }

  // Re-render Lucide icons after reactive changes swap `<i data-lucide>` nodes.
  $effect(() => {
    void error;
    void loading;
    void recoveryCode;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

<div class="box">
  {#if recoveryCode}
    <RecoveryCodeDisplay code={recoveryCode} context="register" onContinue={enterApp} />
  {:else}
    <GuestLangSwitcher {uiLocale} {uiLocales} />

    <!-- Logo/Title -->
    <div class="has-text-centered mb-5">
      <h1 class="title is-3">
        <span class="icon-text">
          <span class="icon has-text-primary"><i data-lucide="book-open"></i></span>
          <span>Lukaisu</span>
        </span>
      </h1>
      <p class="subtitle is-6 has-text-grey">{t('user.register.subtitle')}</p>
    </div>

    <!-- Error message (inline, no reload). -->
    {#if error}
      <div class="notification is-danger is-light">
        <span>{error}</span>
      </div>
    {/if}

    <!-- Registration form -->
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submitRegister();
      }}
    >
      <!-- Honeypot: visually removed but still submitted, so bots that fill
           every field trip it. -->
      <div class="lukaisu-hp" aria-hidden="true">
        <label for="reg-homepage">Leave this field empty</label>
        <input type="text" id="reg-homepage" bind:value={homepage} tabindex="-1" autocomplete="off" />
      </div>

      <div class="field">
        <label class="label" for="reg-username">{t('user.register.username_label')}</label>
        <div class="control has-icons-left">
          <input
            type="text"
            id="reg-username"
            class="input"
            class:is-danger={errors.username}
            placeholder={t('user.register.username_placeholder')}
            bind:value={username}
            onblur={validateUsername}
            autocomplete="username"
            required
          />
          <span class="icon is-small is-left"><i data-lucide="user"></i></span>
        </div>
        {#if errors.username}
          <p class="help is-danger">{errors.username}</p>
        {:else}
          <p class="help">{t('user.register.username_help')}</p>
        {/if}
      </div>

      <div class="field">
        <label class="label" for="reg-email">{t('user.register.email_label_optional')}</label>
        <div class="control has-icons-left">
          <input
            type="email"
            id="reg-email"
            class="input"
            class:is-danger={errors.email}
            placeholder={t('user.register.email_placeholder')}
            bind:value={email}
            onblur={validateEmail}
            autocomplete="email"
          />
          <span class="icon is-small is-left"><i data-lucide="mail"></i></span>
        </div>
        {#if errors.email}
          <p class="help is-danger">{errors.email}</p>
        {:else}
          <p class="help">{t('user.register.email_help_optional')}</p>
        {/if}
      </div>

      <div class="field">
        <label class="label" for="reg-password">{t('user.register.password_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="reg-password"
            class="input"
            class:is-danger={errors.password}
            placeholder={t('user.register.password_placeholder')}
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
          <p class="help">{t('user.register.password_help')}</p>
        {/if}
      </div>

      <div class="field">
        <label class="label" for="reg-password-confirm">{t('user.register.password_confirm_label')}</label>
        <div class="control has-icons-left">
          <input
            type="password"
            id="reg-password-confirm"
            class="input"
            class:is-danger={errors.passwordConfirm}
            placeholder={t('user.register.password_confirm_placeholder')}
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
            <span class="icon"><i data-lucide="user-plus"></i></span>
            <span>{t('user.register.submit')}</span>
          </button>
        </div>
      </div>
    </form>

    <!-- Login link -->
    <hr />
    <p class="has-text-centered">
      {t('user.register.have_account')}
      <a href="/login">{t('user.register.login_link')}</a>
    </p>
  {/if}
</div>

<style>
  /* Honeypot: visually removed but still submitted, so bots that fill every
     field trip it. Scoped so the island is self-contained before the app CSS
     bundle (which also defines .lukaisu-hp globally) finishes loading. */
  .lukaisu-hp {
    position: absolute !important;
    left: -9999px !important;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
</style>
