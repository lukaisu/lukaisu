<!--
  One-time recovery-code display — Svelte 5 port of the server-rendered
  `recovery_code.php` view. Shown once after an email-less registration
  (context 'register') or after a recovery-code password reset (context
  'reset'). The code is the account's only password-recovery channel, so this
  screen is the one place the user ever sees it.

  Shared by RegisterPage and RecoverPasswordPage: the retired PHP flow rendered
  it on a dedicated `GET /register/recovery-code` page (session-stashed code);
  the token API now returns the code inline in the register / recover response,
  so it is shown in-place without a session round-trip.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';

  let {
    code = '',
    context = 'register',
    onContinue
  }: { code?: string; context?: 'register' | 'reset'; onContinue: () => void } = $props();

  const intro = $derived(
    context === 'reset' ? t('user.recovery.intro_reset') : t('user.recovery.intro_register')
  );

  $effect(() => {
    void code;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

<div class="has-text-centered mb-5">
  <h1 class="title is-3">
    <span class="icon-text">
      <span class="icon has-text-primary"><i data-lucide="key"></i></span>
      <span>{t('user.recovery.page_title')}</span>
    </span>
  </h1>
  <p class="subtitle is-6 has-text-grey">{intro}</p>
</div>

<div class="notification is-warning is-light">
  <span class="icon-text">
    <span class="icon"><i data-lucide="triangle-alert"></i></span>
    <span>{t('user.recovery.warning')}</span>
  </span>
</div>

<div class="field">
  <label class="label" for="recovery-code-display">{t('user.recovery.code_label')}</label>
  <div class="control">
    <input
      type="text"
      id="recovery-code-display"
      class="input is-medium has-text-centered has-text-weight-semibold"
      style="font-family: monospace; letter-spacing: 0.1em;"
      value={code}
      readonly
    />
  </div>
  <p class="help">{t('user.recovery.code_help')}</p>
</div>

<div class="field">
  <div class="control">
    <button type="button" class="button is-primary is-fullwidth" onclick={onContinue}>
      <span class="icon"><i data-lucide="check"></i></span>
      <span>{t('user.recovery.saved_continue')}</span>
    </button>
  </div>
</div>
