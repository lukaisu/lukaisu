<!--
  Guest UI-language switcher — shared by the pre-auth token-API islands
  (register / forgot / reset / recover). Parity with the server's
  PageLayoutHelper::languageSwitcher(): renders nothing when fewer than two
  locales are installed, and on change navigates with `?lang=`, which the
  server's TranslatorServiceProvider validates and persists to the
  `lukaisu_lang` cookie so the bundle and any PHP-rendered pages stay in sync.

  Factored out of LoginPage.svelte so the four password/register islands don't
  each duplicate the switcher markup + native locale-name map. The installed
  locale codes + the active one are injected guest-safely by BundleController
  (see uiLocaleConfig / injectRuntime) and threaded through each page's entry.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';

  let { uiLocale = '', uiLocales = [] }: { uiLocale?: string; uiLocales?: string[] } = $props();

  // Native display names, mirroring SelectOptionsBuilder::forAppLanguages().
  // Unknown codes fall back to the code itself.
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

  // Match PageLayoutHelper::languageSwitcher(): render nothing with < 2 locales.
  const showLanguageSwitcher = $derived(uiLocales.length >= 2);

  function localeName(code: string): string {
    return LOCALE_NAMES[code] ?? code;
  }

  /**
   * Switch the guest UI language: set the client-side locale (so the bundle's
   * i18n loads it) and navigate with `?lang=`, which the server validates and
   * persists to the `lukaisu_lang` cookie.
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

  $effect(() => {
    void uiLocales;
    void tick().then(() => initIcons());
  });

  onMount(() => {
    initIcons();
  });
</script>

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
