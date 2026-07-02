<!--
  Home dashboard — Svelte 5 port of the Alpine `homeApp` component
  (`js/home/home_app.ts`).

  Root of the home page island. Parses the `#home-warnings-config` JSON (injected
  by `home.ts`), renders the continue-reading card (with its word-status stat
  bar), the new-text and browse-library cards, the system warnings (PHP version,
  cookies, update-available via the GitHub API), and the language-change
  notification. Hosts the "Discover books" disclosure (`DiscoverBooks.svelte`).

  Listens for the custom `lukaisu:languageChanged` event (dispatched by the
  navbar language switcher) and reloads `lastText` from the event's response
  payload; the suggestion widgets own their own listeners and re-fetch
  themselves, matching the original Alpine wiring the data layer ported from.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import type { LanguageChangedEvent, TextStats } from '@modules/language/stores/language_settings';
  import DiscoverBooks from './DiscoverBooks.svelte';

  interface LastTextInfo {
    id: number;
    title: string;
    language_id: number;
    language_name: string;
    annotated: boolean;
    stats?: TextStats;
  }

  interface HomeWarningsConfig {
    phpVersion: string;
    lukaisuVersion: string;
    lastText: LastTextInfo | null;
    basePath: string;
    textCount: number;
    currentLanguageId: number;
    checkForUpdates?: boolean;
  }

  // --- Reactive state (runes) -------------------------------------------------
  // Current language ID (passed to the suggestion widgets as their starting id).
  let currentLanguageId = $state(0);
  // Last text info (dynamically updated when language changes).
  let lastText = $state<LastTextInfo | null>(null);
  // Base path for URLs (e.g. '/lukaisu-server' for a subdirectory install).
  let basePath = $state('');

  let languageNotification = $state<{ message: string; visible: boolean }>({
    message: '',
    visible: false
  });

  let phpWarning = $state<{ message: string; visible: boolean }>({ message: '', visible: false });
  let cookiesWarning = $state<{ message: string; visible: boolean }>({ message: '', visible: false });
  let updateWarning = $state<{ message: string; visible: boolean; latestVersion: string }>({
    message: '',
    visible: false,
    latestVersion: ''
  });

  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Warnings ---------------------------------------------------------------
  function initWarnings(): void {
    const configElement = document.getElementById('home-warnings-config');
    if (!configElement) {
      return;
    }

    try {
      const config: HomeWarningsConfig = JSON.parse(configElement.textContent || '{}');

      lastText = config.lastText;
      basePath = config.basePath || '';
      currentLanguageId = config.currentLanguageId || 0;

      checkCookies();
      checkPHPVersion(config.phpVersion);
      if (config.checkForUpdates) {
        checkLukaisuUpdate(config.lukaisuVersion);
      }
    } catch (e) {
      console.error('Failed to parse home warnings config:', e);
    }
  }

  function checkCookies(): void {
    try {
      document.cookie = 'lukaisu_cookie_test=1; SameSite=Strict';
      const enabled = document.cookie.indexOf('lukaisu_cookie_test') !== -1;
      // Clean up test cookie.
      document.cookie = 'lukaisu_cookie_test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';

      if (!enabled) {
        cookiesWarning.message = t('home.warning_cookies_disabled');
        cookiesWarning.visible = true;
      }
    } catch {
      // If we can't even try, assume cookies are disabled.
      cookiesWarning.message =
        'Cookies are not enabled! Please enable them for Lukaisu Server to work properly.';
      cookiesWarning.visible = true;
    }
  }

  function checkPHPVersion(phpVersion: string): void {
    const phpMinVersion = '8.0.0';
    if (shouldUpdate(phpVersion, phpMinVersion)) {
      phpWarning.message = t('home.warning_php_outdated', {
        phpVersion,
        minVersion: phpMinVersion
      });
      phpWarning.visible = true;
    }
  }

  function checkLukaisuUpdate(lukaisuVersion: string): void {
    fetch('https://api.github.com/repos/lukaisu/lukaisu-server/releases/latest')
      .then((response) => response.json())
      .then((data: { tag_name: string }) => {
        const latestVersion = data.tag_name;
        if (!shouldUpdate(lukaisuVersion, latestVersion)) {
          return;
        }
        // Respect a previously dismissed version: only re-show the banner if a
        // newer release has appeared since the user closed it.
        try {
          const dismissed = localStorage.getItem('lukaisu_update_dismissed_version');
          if (dismissed && !shouldUpdate(dismissed, latestVersion)) {
            return;
          }
        } catch {
          // localStorage unavailable — fall through and show the banner.
        }
        updateWarning.latestVersion = latestVersion;
        updateWarning.message = t('home.warning_update_available', {
          latestVersion,
          currentVersion: lukaisuVersion
        });
        updateWarning.visible = true;
      })
      .catch(() => {
        // Silently fail if GitHub API is unreachable.
      });
  }

  function dismissUpdateWarning(): void {
    updateWarning.visible = false;
    try {
      if (updateWarning.latestVersion) {
        localStorage.setItem('lukaisu_update_dismissed_version', updateWarning.latestVersion);
      }
    } catch {
      // localStorage unavailable — dismissal is session-only.
    }
  }

  function shouldUpdate(fromVersion: string, toVersion: string): boolean | null {
    const regex = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?/;
    const match1 = fromVersion.match(regex);
    const match2 = toVersion.match(regex);

    if (!match1 || !match2) {
      return null;
    }

    for (let i = 1; i < 4; i++) {
      const level1 = parseInt(match1[i], 10);
      const level2 = parseInt(match2[i], 10);
      if (level1 < level2) {
        return true;
      } else if (level1 > level2) {
        return false;
      }
    }

    return null;
  }

  // --- Language change --------------------------------------------------------
  function handleLanguageChange(event: LanguageChangedEvent): void {
    const { languageName, response } = event.detail;

    // Update the last text info.
    if (response.last_text) {
      lastText = response.last_text;
    } else {
      lastText = null;
    }

    // Show notification.
    languageNotification.message = `Language changed to "${languageName}"`;
    languageNotification.visible = true;

    // Auto-hide notification after 3 seconds.
    if (notifyTimer) {
      clearTimeout(notifyTimer);
    }
    notifyTimer = setTimeout(() => {
      languageNotification.visible = false;
    }, 3000);
  }

  // --- Stat bar helpers -------------------------------------------------------
  /** Percentage for a stat key (CSP-safe). */
  function getStatPercent(key: string): number {
    if (!lastText || !lastText.stats) {
      return 0;
    }
    const stats = lastText.stats;
    const total = stats.total || 1;
    let value = 0;
    switch (key) {
      case 'unknown': value = stats.unknown || 0; break;
      case 's1': value = stats.s1 || 0; break;
      case 's2': value = stats.s2 || 0; break;
      case 's3': value = stats.s3 || 0; break;
      case 's4': value = stats.s4 || 0; break;
      case 's5': value = stats.s5 || 0; break;
      case 's98': value = stats.s98 || 0; break;
      case 's99': value = stats.s99 || 0; break;
    }
    return (value / total) * 100;
  }

  /** Title string for the stats tooltip (CSP-safe). */
  function getStatsTitle(): string {
    if (!lastText || !lastText.stats) {
      return '';
    }
    const stats = lastText.stats;
    const unknown = stats.unknown || 0;
    const s1 = stats.s1 || 0;
    const s2 = stats.s2 || 0;
    const s3 = stats.s3 || 0;
    const s4 = stats.s4 || 0;
    const s5 = stats.s5 || 0;
    const s98 = stats.s98 || 0;
    const s99 = stats.s99 || 0;
    const learning = s1 + s2 + s3 + s4;
    return 'Unknown: ' + unknown + ', Learning: ' + learning + ', Learned: ' + s5 +
      ', Well-known: ' + s99 + ', Ignored: ' + s98;
  }

  const showStatBar = $derived(!!(lastText && lastText.stats && lastText.stats.total > 0));

  // --- Effects ----------------------------------------------------------------
  // Re-run lucide whenever a state change swaps rendered icons (the
  // continue-reading card appearing/changing, a warning toggling).
  $effect(() => {
    void lastText;
    void phpWarning.visible;
    void cookiesWarning.visible;
    void updateWarning.visible;
    void languageNotification.visible;
    void tick().then(() => initIcons());
  });

  // Listen for the custom language-change event (Alpine's initLanguageChangeListener).
  $effect(() => {
    function onLangChange(e: Event): void {
      handleLanguageChange(e as LanguageChangedEvent);
    }
    document.addEventListener('lukaisu:languageChanged', onLangChange as EventListener);
    return () => document.removeEventListener('lukaisu:languageChanged', onLangChange as EventListener);
  });

  onMount(() => {
    initWarnings();
  });
</script>

<div>
  <!-- System notifications (offline these stay inert: no PHP, no update check;
       the cookie check is harmless and client-side). -->
  {#if phpWarning.visible}
    <div class="notification is-danger is-light">
      <p>{phpWarning.message}</p>
    </div>
  {/if}
  {#if cookiesWarning.visible}
    <div class="notification is-warning is-light">
      <p>{cookiesWarning.message}</p>
    </div>
  {/if}
  {#if updateWarning.visible}
    <div class="notification is-info is-light">
      <button class="delete" aria-label="Dismiss update notification" onclick={dismissUpdateWarning}></button>
      <p>{updateWarning.message}</p>
    </div>
  {/if}

  <!-- Language change notification -->
  {#if languageNotification.visible}
    <div class="notification is-success is-light">
      <button
        class="delete"
        aria-label="Dismiss notification"
        onclick={() => (languageNotification.visible = false)}
      ></button>
      <p>{languageNotification.message}</p>
    </div>
  {/if}

  <!-- Text cards (single row, horizontal scroll) -->
  <div style="display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.5rem;">

    <!-- Continue reading / current text -->
    <div style="flex-shrink: 0;">
      {#if lastText}
        <div class="box has-background-link-light" style="width: 280px; min-height: 180px;">
          <p class="title is-5 mb-3">{lastText.title}</p>
          <!-- Statistics bar — colours match the reader's word-status highlights. -->
          {#if showStatBar}
            <div class="mb-3" title={getStatsTitle()}>
              <div style="display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #ddd;">
                <div style={'background: #5ABAFF; width: ' + getStatPercent('unknown') + '%'}></div>
                <div style={'background: #E85A3C; width: ' + getStatPercent('s1') + '%'}></div>
                <div style={'background: #E8893C; width: ' + getStatPercent('s2') + '%'}></div>
                <div style={'background: #E8B83C; width: ' + getStatPercent('s3') + '%'}></div>
                <div style={'background: #E8E23C; width: ' + getStatPercent('s4') + '%'}></div>
                <div style={'background: #66CC66; width: ' + getStatPercent('s5') + '%'}></div>
                <div style={'background: #CCFFCC; width: ' + getStatPercent('s99') + '%'}></div>
                <div style={'background: #888888; width: ' + getStatPercent('s98') + '%'}></div>
              </div>
            </div>
          {/if}
          <div class="buttons">
            <a href={basePath + '/text/' + lastText.id + '/read'} class="button is-link is-medium">
              <span class="icon"><i data-lucide="book-open" aria-label="Read"></i></span>
              <span>Read</span>
            </a>
            <a href={basePath + '/review?text=' + lastText.id} class="button is-info is-light is-medium">
              <span class="icon"><i data-lucide="circle-help" aria-label="Review"></i></span>
              <span>Review</span>
            </a>
          </div>
        </div>
      {:else}
        <div
          class="box has-background-light"
          style="width: 280px; min-height: 180px; display: flex; flex-direction: column; justify-content: center; align-items: center;"
        >
          <span class="icon is-large has-text-grey-light mb-2">
            <i data-lucide="book-open" aria-label="No text" style="width: 36px; height: 36px;"></i>
          </span>
          <p class="has-text-grey is-size-7 has-text-centered">
            No text yet — add one to start reading.
          </p>
        </div>
      {/if}
    </div>

    <!-- New text -->
    <div style="flex-shrink: 0;">
      <a
        href="/texts/new"
        class="box has-background-primary-light has-text-centered"
        style="width: 180px; min-height: 180px; display: flex; flex-direction: column; justify-content: center; align-items: center;"
      >
        <span class="icon is-large has-text-primary">
          <i data-lucide="plus" aria-label="New text" style="width: 48px; height: 48px;"></i>
        </span>
        <p class="mt-3 has-text-weight-semibold">New text</p>
      </a>
    </div>

    <!-- Browse your library (offline replacement for the server's Gutenberg/GDL
         discovery search — that stays server-enhanced). -->
    <div style="flex-shrink: 0;">
      <a
        href="/texts"
        class="box has-background-warning-light has-text-centered"
        style="width: 180px; min-height: 180px; display: flex; flex-direction: column; justify-content: center; align-items: center;"
      >
        <span class="icon is-large has-text-warning-dark">
          <i data-lucide="book-marked" aria-label="Browse library" style="width: 48px; height: 48px;"></i>
        </span>
        <p class="mt-3 has-text-weight-semibold">Browse your library</p>
      </a>
    </div>
  </div>

  <!-- Discover books — on-device catalog browse (Gutendex + GDL) behind an
       explicit toggle so a passive home visit makes no outbound request. -->
  <DiscoverBooks languageId={currentLanguageId} {basePath} />
</div>
