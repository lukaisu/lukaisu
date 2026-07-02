<!--
  Connect / auth — Svelte 5 port of the Alpine `clientAuth` component.

  The entry flow for the bundled client: choose a server, then log in or
  register against its REST API. A two-step flow in a single island (the
  Alpine→Svelte rendering-framework direction in BRIEFING.md /
  docs-src/server/local-first.md):

    1. `server`   — enter a server address, validated by probing the public
       `/api/v1/version` endpoint; on success the choice is stored via
       `setApiServer` (persisted to localStorage). A single-user self-host that
       needs no login enters the app directly.
    2. `login`    — username + password posted to `/api/v1/auth/login`, or an
       account created via `/api/v1/auth/register`; the returned bearer token is
       stored via `setAuthToken`, after which every API call carries
       `Authorization: Bearer …`.
    3. `recovery` — an email-less registration returns a one-time recovery code,
       shown once before entering the app.

  This backs the bundled app's `index.html` (mounted by `connect.ts`) and is now
  the sole renderer of the connect/login flow: the Alpine `client_auth.ts` + its
  `client_auth.php` view were retired, and the server's GET /connect route 302s
  here. Behaviour (strings, validation, token storage, redirect) matches the old
  Alpine component; only the rendering is Svelte, which compiles to plain JS so
  the island runs under the bundle's strict `script-src 'self'` CSP.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    apiGet,
    apiPost,
    setApiServer,
    getApiServer,
    setAuthToken,
    getAuthToken,
    setAuthOptional,
    isAuthOptional,
    probeAuthRequirement,
    type ApiResponse
  } from '@shared/api/client';
  import { solveAltcha } from '@shared/altcha/solve_altcha';
  import { initIcons } from '@shared/icons/lucide_icons';

  interface VersionResponse {
    version?: string;
  }

  interface AuthResponse {
    success?: boolean;
    token?: string;
    expires_at?: string | null;
    error?: string;
    /** One-time recovery code, returned when registering without an email. */
    recovery_code?: string;
  }

  // Config injected by the host page (`connect.ts`): the default server to
  // prefill and the page to navigate to after login. Mirrors the Alpine
  // component's `readConfig()` of `<script id="client-auth-config">`.
  let { defaultServer = '', homeUrl = '/' }: { defaultServer?: string; homeUrl?: string } =
    $props();

  // --- Reactive state (runes) -------------------------------------------------
  let step = $state<'server' | 'login' | 'recovery'>('server');
  let authMode = $state<'login' | 'register'>('login');
  let serverUrl = $state('');
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  /** Honeypot field — bound to a hidden input; bots fill it, humans don't. */
  let homepage = $state('');
  /** One-time recovery code to show once after an email-less registration. */
  let recoveryCode = $state('');
  let loading = $state(false);
  let error = $state('');

  // A failed connect on the server step is usually one of two things: the
  // address is unreachable, or the server hasn't allow-listed this app's origin
  // (CORS). Show the actionable help only once that has happened.
  const showServerHelp = $derived(step === 'server' && error !== '');

  // --- Server step ------------------------------------------------------------
  /**
   * Trim, drop a trailing slash, and default the scheme to https so a user can
   * type just a hostname.
   */
  function normalizeServerUrl(input: string): string {
    let value = input.trim().replace(/\/+$/, '');
    if (value !== '' && !/^https?:\/\//i.test(value)) {
      value = 'https://' + value;
    }
    return value;
  }

  async function connect(): Promise<void> {
    const server = normalizeServerUrl(serverUrl);
    if (server === '') {
      error = 'Please enter a server address.';
      return;
    }

    loading = true;
    error = '';
    serverUrl = server;

    // Point the client at the candidate server and probe the public version
    // endpoint to confirm it is a reachable Lukaisu Server server (and that CORS
    // allows this origin).
    setApiServer(server);
    const res = await apiGet<VersionResponse>('/version');

    if (res.error || !res.data || !res.data.version) {
      loading = false;
      setApiServer(null); // roll back the bad choice
      error =
        "Couldn't reach a Lukaisu Server at that address. Check the URL and that "
        + 'the server is running — and, if it’s your own server, that it allows '
        + 'this app (see below).';
      return;
    }

    // Reachable. Does this server require a login? A single-user self-host
    // treats every endpoint as public, so there is nothing to log in to — enter
    // the app directly. Multi-user servers (401) show the login step.
    const mode = await probeAuthRequirement();
    loading = false;

    if (mode === 'optional') {
      setAuthOptional(true);
      onAuthenticated();
      return;
    }

    step = 'login';
  }

  function back(): void {
    setApiServer(null);
    step = 'server';
    error = '';
  }

  // --- Login / register -------------------------------------------------------
  function showRegister(): void {
    authMode = 'register';
    error = '';
  }

  function showLogin(): void {
    authMode = 'login';
    error = '';
  }

  async function submitLogin(): Promise<void> {
    const name = username.trim();
    if (name === '' || password === '') {
      error = 'Enter your username and password.';
      return;
    }

    loading = true;
    error = '';

    const res = await apiPost<AuthResponse>('/auth/login', {
      username: name,
      password
    });
    loading = false;
    finishAuth(res, 'Login failed.');
  }

  async function submitRegister(): Promise<void> {
    const name = username.trim();
    const mail = email.trim();
    // Email is optional — the username is the unique identity.
    if (name === '' || password === '') {
      error = 'Enter a username and password.';
      return;
    }
    if (password !== passwordConfirm) {
      error = 'Passwords do not match.';
      return;
    }

    loading = true;
    error = '';

    // Solve the proof-of-work captcha before submitting.
    const altcha = await solveAltcha();

    const res = await apiPost<AuthResponse>('/auth/register', {
      username: name,
      email: mail,
      password,
      password_confirm: passwordConfirm,
      // Honeypot — always empty for a real user; the server rejects if filled.
      homepage,
      altcha
    });
    loading = false;

    // Email-less account: the server returns a one-time recovery code. Store the
    // token, then show the code once before entering the app.
    const data = res.data;
    if (!res.error && data && data.success === true && data.token && data.recovery_code) {
      setAuthToken(data.token, data.expires_at ?? null);
      password = '';
      passwordConfirm = '';
      recoveryCode = data.recovery_code;
      step = 'recovery';
      return;
    }

    finishAuth(res, 'Registration failed.');
  }

  /** Leave the one-time recovery-code screen and enter the app. */
  function continueAfterRecovery(): void {
    recoveryCode = '';
    onAuthenticated();
  }

  /**
   * Apply a login/register API result: on success store the token (with its
   * expiry) and enter the app; otherwise surface the error. The handlers return
   * HTTP 200 with `success: false` for validation/credential errors, so both the
   * transport error and the body are checked.
   */
  function finishAuth(res: ApiResponse<AuthResponse>, fallbackError: string): void {
    if (res.error) {
      error = res.error;
      return;
    }
    const data = res.data;
    if (!data || data.success !== true || !data.token) {
      error = data && data.error ? data.error : fallbackError;
      return;
    }

    setAuthToken(data.token, data.expires_at ?? null);
    password = '';
    passwordConfirm = '';
    onAuthenticated();
  }

  /** Navigate into the app after a successful login. */
  function onAuthenticated(): void {
    window.location.assign(homeUrl);
  }

  // Re-render Lucide icons whenever the visible step/mode changes — the {#if}
  // blocks add/remove the `<i data-lucide>` placeholders. `tick()` lets the DOM
  // settle before lucide swaps them for SVGs.
  $effect(() => {
    void step;
    void authMode;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    // Already signed in (token persisted from a previous launch): skip the whole
    // flow.
    if (getAuthToken()) {
      onAuthenticated();
      return;
    }

    // Server already chosen previously.
    const knownServer = getApiServer();
    if (knownServer) {
      // Known to need no login (single-user self-host): go straight in.
      if (isAuthOptional()) {
        onAuthenticated();
        return;
      }
      // Otherwise jump straight to the login step.
      serverUrl = knownServer;
      step = 'login';
      return;
    }

    serverUrl = defaultServer;
  });
</script>

<div class="box">
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
    <p class="subtitle is-6 has-text-grey">Connect to your server</p>
  </div>

  <!-- Error message -->
  {#if error}
    <div class="notification is-danger is-light">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Connection help: shown after a failed connect. The packaged app loads from
       https://localhost, so a remote server must allow-list that origin (CORS)
       for the cross-origin API calls to work. A failed fetch can't tell CORS
       from unreachable, so this covers both. -->
  {#if showServerHelp}
    <div class="notification is-warning is-light">
      <p class="mb-2">
        <strong>Connecting to your own Lukaisu Server?</strong>
        It has to allow this app. Add this to the server’s environment and restart
        it:
      </p>
      <pre class="mb-2" style="white-space:pre-wrap;word-break:break-all"><code
          >CORS_ALLOWED_ORIGINS=https://localhost</code
        ></pre>
      <p class="is-size-7 mb-0">
        Also check the address is reachable from this device — on a home network
        use the server’s IP, e.g.
        <code>http://192.168.1.20:8010</code>.
      </p>
    </div>
  {/if}

  <!-- Step 1: choose server -->
  {#if step === 'server'}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <div class="field">
        <label class="label" for="server-url">Server address</label>
        <div class="control has-icons-left">
          <input
            type="text"
            id="server-url"
            class="input"
            placeholder="https://my-lukaisu-server.org"
            bind:value={serverUrl}
            inputmode="url"
            autocomplete="url"
            required
          />
          <span class="icon is-small is-left">
            <i data-lucide="server"></i>
          </span>
        </div>
        <p class="help">The address of the Lukaisu Server server you want to read from.</p>
      </div>

      <div class="field">
        <div class="control">
          <button
            type="submit"
            class="button is-primary is-fullwidth"
            class:is-loading={loading}
            disabled={loading}
          >
            <span class="icon"><i data-lucide="plug"></i></span>
            <span>Connect</span>
          </button>
        </div>
      </div>
    </form>
  {/if}

  <!-- Step 2: log in or create an account -->
  {#if step === 'login'}
    <!-- Log in -->
    {#if authMode === 'login'}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void submitLogin();
        }}
      >
        <div class="field">
          <label class="label" for="client-username">Username or email</label>
          <div class="control has-icons-left">
            <input
              type="text"
              id="client-username"
              class="input"
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
          <label class="label" for="client-password">Password</label>
          <div class="control has-icons-left">
            <input
              type="password"
              id="client-password"
              class="input"
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
          <div class="control">
            <button
              type="submit"
              class="button is-primary is-fullwidth"
              class:is-loading={loading}
              disabled={loading}
            >
              <span class="icon"><i data-lucide="log-in"></i></span>
              <span>Log in</span>
            </button>
          </div>
        </div>

        <p class="has-text-centered">
          <button type="button" class="button is-text is-size-7" onclick={showRegister}
            >Create an account</button
          >
        </p>
      </form>
    {/if}

    <!-- Create an account -->
    {#if authMode === 'register'}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void submitRegister();
        }}
      >
        <!-- Honeypot: hidden from people; bots that fill it are rejected
             server-side. -->
        <div class="lukaisu-hp" aria-hidden="true">
          <label for="reg-homepage">Leave this field empty</label>
          <input
            type="text"
            id="reg-homepage"
            bind:value={homepage}
            tabindex="-1"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label class="label" for="reg-username">Username</label>
          <div class="control has-icons-left">
            <input
              type="text"
              id="reg-username"
              class="input"
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
          <label class="label" for="reg-email"
            >Email
            <span class="has-text-grey is-size-7">(optional)</span></label
          >
          <div class="control has-icons-left">
            <input
              type="email"
              id="reg-email"
              class="input"
              bind:value={email}
              autocomplete="email"
            />
            <span class="icon is-small is-left">
              <i data-lucide="mail"></i>
            </span>
          </div>
          <p class="help">Only used to recover a forgotten password. Leave blank to skip.</p>
        </div>

        <div class="field">
          <label class="label" for="reg-password">Password</label>
          <div class="control has-icons-left">
            <input
              type="password"
              id="reg-password"
              class="input"
              bind:value={password}
              autocomplete="new-password"
              required
            />
            <span class="icon is-small is-left">
              <i data-lucide="lock"></i>
            </span>
          </div>
        </div>

        <div class="field">
          <label class="label" for="reg-password-confirm">Confirm password</label>
          <div class="control has-icons-left">
            <input
              type="password"
              id="reg-password-confirm"
              class="input"
              bind:value={passwordConfirm}
              autocomplete="new-password"
              required
            />
            <span class="icon is-small is-left">
              <i data-lucide="lock"></i>
            </span>
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
              <span class="icon"><i data-lucide="user-plus"></i></span>
              <span>Create account</span>
            </button>
          </div>
        </div>

        <p class="has-text-centered">
          <button type="button" class="button is-text is-size-7" onclick={showLogin}
            >Already have an account? Log in</button
          >
        </p>
      </form>
    {/if}

    <hr />
    <p class="has-text-centered">
      <button type="button" class="button is-text is-size-7" onclick={back}
        >Use a different server</button
      >
    </p>
  {/if}

  <!-- Step 3: one-time recovery code (after an email-less sign-up) -->
  {#if step === 'recovery'}
    <div class="has-text-centered mb-4">
      <span class="icon has-text-primary is-large"><i data-lucide="key"></i></span>
      <h2 class="title is-5 mt-2">Your recovery code</h2>
    </div>
    <div class="notification is-warning is-light">
      Save this code somewhere safe. It is the only way to recover your account if
      you forget your password, and it will not be shown again.
    </div>
    <div class="field">
      <div class="control">
        <input
          type="text"
          class="input is-medium has-text-centered has-text-weight-semibold"
          style="font-family: monospace; letter-spacing: 0.1em;"
          value={recoveryCode}
          readonly
        />
      </div>
    </div>
    <div class="field">
      <div class="control">
        <button type="button" class="button is-primary is-fullwidth" onclick={continueAfterRecovery}>
          <span class="icon"><i data-lucide="check"></i></span>
          <span>I've saved it — continue</span>
        </button>
      </div>
    </div>
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

  /* Link-styled toggle actions (mode switch / "use a different server"). A real
     <button> keeps it keyboard-accessible and warning-free, while Bulma's
     is-text gives the small-link appearance the Alpine version used for its
     <a class="is-size-7"> elements. */
  .button.is-text {
    text-decoration: none;
  }
  .button.is-text:hover {
    text-decoration: underline;
  }
</style>
