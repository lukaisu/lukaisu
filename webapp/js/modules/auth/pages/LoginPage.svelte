<!--
  Login — Svelte 5 port of the server-rendered `login.php` session form.

  The same-origin PWA login screen. Where `ConnectPage.svelte` is the packaged
  client's "choose a server, then log in" flow (cross-origin, token-only), this
  island is the login for the app when it IS the server's own web UI: there is no
  server-address field — the server is this origin — so it just authenticates
  against `POST /api/v1/auth/login` and enters the app.

  Why this is safe for the rest of the still-PHP-rendered app: the login endpoint
  (`UserFacade::login()` behind `formatLogin()`) both (a) regenerates a PHP
  session (`session_regenerate_id(true)` + `$_SESSION['LUKAISU_USER_ID']`) AND
  (b) returns a bearer token. So a successful same-origin login leaves the browser
  with a session cookie (used by the PHP pages) and a token (persisted in
  localStorage for the bundle client) — no session bridge needed.

  CSRF: this is a same-origin, cookie-authenticated POST with no bearer token yet,
  so it is NOT exempt from `CsrfMiddleware`. The token travels automatically:
  `apiPost` → `withCsrf` → `getCsrfToken()` reads `<meta name="csrf-token">`
  (injected into the shell by `BundleController`) and sends it as `X-CSRF-TOKEN`.

  Rendering is Svelte, which compiles to plain JS, so the island runs under the
  bundle's strict `script-src 'self'` CSP with no inline handlers.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiPost, setAuthToken, type ApiResponse } from '@shared/api/client';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';

  interface AuthResponse {
    success?: boolean;
    token?: string;
    expires_at?: string | null;
    error?: string;
  }

  // Config injected by the host page (`login.ts`): where to go after a successful
  // login (the sanitized `?redirect=` intended URL, or '/'), and the guest
  // UI-language switcher data (installed locale codes + the active one).
  let {
    redirectTo = '/',
    uiLocale = '',
    uiLocales = []
  }: { redirectTo?: string; uiLocale?: string; uiLocales?: string[] } = $props();

  // --- Reactive state (runes) -------------------------------------------------
  let username = $state('');
  let password = $state('');
  // Parity with login.php's "remember me". Wired honestly to token persistence
  // (see finishAuth): the token API has no `remember` flag, so we do NOT send one.
  let remember = $state(true);
  let loading = $state(false);
  let error = $state('');

  // Native display names for the UI-language switcher, mirroring the server's
  // SelectOptionsBuilder::forAppLanguages() map. `login.ts` injects only the
  // installed locale *codes*; unknown codes fall back to the code itself.
  const LOCALE_NAMES: Record<string, string> = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    ru: 'Русский',
    ar: 'العربية'
  };

  // Match PageLayoutHelper::languageSwitcher(): render nothing when fewer than
  // two locales are installed.
  const showLanguageSwitcher = $derived(uiLocales.length >= 2);

  function localeName(code: string): string {
    return LOCALE_NAMES[code] ?? code;
  }

  // --- Login ------------------------------------------------------------------
  async function submitLogin(): Promise<void> {
    const name = username.trim();
    if (name === '' || password === '') {
      error = t('user.flash.login_missing_credentials');
      return;
    }

    loading = true;
    error = '';

    // Mirrors ConnectPage.submitLogin: `apiPost` attaches the CSRF header from
    // the injected meta tag; the server sets the session cookie and returns a
    // token. `remember` is deliberately omitted — the API has no such param.
    const res = await apiPost<AuthResponse>('/auth/login', {
      username: name,
      password
    });
    loading = false;
    finishAuth(res);
  }

  /**
   * Apply the login API result. The handler returns HTTP 200 with
   * `success: false` for bad credentials, so both the transport error and the
   * body are checked. On success store the token and enter the app.
   */
  function finishAuth(res: ApiResponse<AuthResponse>): void {
    if (res.error) {
      error = res.error;
      return;
    }
    const data = res.data;
    if (!data || data.success !== true || !data.token) {
      error = data && data.error ? data.error : t('user.flash.login_missing_credentials');
      return;
    }

    // Persist the bearer token (with its expiry). "Remember me" gates whether the
    // token outlives this browser session: checked → persisted in localStorage
    // (survives relaunch); unchecked → kept in-memory only for this session, so
    // the next launch requires a fresh login. This is the token-client analogue
    // of the old server-side remember cookie (see report notes).
    setAuthToken(data.token, data.expires_at ?? null);
    if (!remember) {
      try {
        localStorage.removeItem('lukaisu.apiToken');
        localStorage.removeItem('lukaisu.apiTokenExpires');
      } catch {
        // localStorage unavailable: token is already in-memory only.
      }
    }
    password = '';
    window.location.assign(redirectTo);
  }

  // --- Language switcher ------------------------------------------------------
  /**
   * Switch the guest UI language. Sets the client-side locale (so the bundle's
   * i18n loads it) and navigates with `?lang=`, which the server's
   * TranslatorServiceProvider validates and persists to the `lukaisu_lang`
   * cookie — keeping the bundle and any PHP-rendered pages in the same language.
   */
  function onLocaleChange(event: Event): void {
    const locale = (event.currentTarget as HTMLSelectElement).value;
    if (locale === '' || locale === uiLocale) {
      return;
    }
    try {
      localStorage.setItem('lukaisu.locale', locale);
    } catch {
      // localStorage unavailable: the ?lang cookie below still applies.
    }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', locale);
    window.location.assign(url.pathname + url.search);
  }

  // Re-render Lucide icons after reactive changes add/remove `<i data-lucide>`
  // placeholders (the error notification, the loading button state). `tick()`
  // lets the DOM settle before lucide swaps them for SVGs.
  $effect(() => {
    void error;
    void loading;
    void uiLocales;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

<div class="box">
  <!-- Guest UI-language switcher (parity with PageLayoutHelper::languageSwitcher). -->
  {#if showLanguageSwitcher}
    <form class="field has-addons mb-4" style="justify-content: flex-end;" onsubmit={(e) => e.preventDefault()}>
      <div class="control">
        <div class="select is-small">
          <select aria-label="Change language" value={uiLocale} onchange={onLocaleChange}>
            {#each uiLocales as code (code)}
              <option value={code}>{localeName(code)}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="control">
        <span class="button is-small" aria-hidden="true">
          <span class="icon"><i data-lucide="globe"></i></span>
        </span>
      </div>
    </form>
  {/if}

  <!-- Logo/Title -->
  <div class="has-text-centered mb-5">
    <h1 class="title is-3">
      <span class="icon-text">
        <span class="icon has-text-primary">
          <i data-lucide="book-open"></i>
        </span>
        <span>Lukaisu Server</span>
      </span>
    </h1>
    <p class="subtitle is-6 has-text-grey">{t('user.app_subtitle')}</p>
  </div>

  <!-- Error message (inline, no reload). -->
  {#if error}
    <div class="notification is-danger is-light">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Login form -->
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void submitLogin();
    }}
  >
    <div class="field">
      <label class="label" for="login-username">{t('user.login.username_label')}</label>
      <div class="control has-icons-left">
        <input
          type="text"
          id="login-username"
          class="input"
          placeholder={t('user.login.username_placeholder')}
          bind:value={username}
          autocomplete="username"
          required
        />
        <span class="icon is-small is-left">
          <i data-lucide="user"></i>
        </span>
      </div>
    </div>

    <div class="field">
      <label class="label" for="login-password">{t('user.login.password_label')}</label>
      <div class="control has-icons-left">
        <input
          type="password"
          id="login-password"
          class="input"
          placeholder={t('user.login.password_placeholder')}
          bind:value={password}
          autocomplete="current-password"
          required
        />
        <span class="icon is-small is-left">
          <i data-lucide="lock"></i>
        </span>
      </div>
    </div>

    <div class="field">
      <div class="level is-mobile">
        <div class="level-left">
          <label class="checkbox">
            <input type="checkbox" bind:checked={remember} />
            {t('user.login.remember_me')}
          </label>
        </div>
        <div class="level-right">
          <a href="/password/forgot" class="is-size-7">{t('user.login.forgot_password')}</a>
        </div>
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
          <span class="icon"><i data-lucide="log-in"></i></span>
          <span>{t('user.login.submit')}</span>
        </button>
      </div>
    </div>
  </form>

  <!-- Registration link -->
  <hr />
  <p class="has-text-centered">
    {t('user.login.no_account')}
    <a href="/register">{t('user.login.create_one')}</a>
  </p>
</div>
