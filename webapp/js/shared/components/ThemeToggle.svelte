<!--
  Theme Toggle — Svelte 5 port of the Alpine `themeToggle` component
  (`theme_toggle.ts`). A dark/light-mode toggle button for the navbar.

  Behaviour mirrors the Alpine version:
    - Non-auto mode: the icon/title come from the server's active theme (`mode`),
      and clicking saves the `counterpart` theme dir.
    - Auto mode: the effective mode is read once from the OS color-scheme
      preference (`prefers-color-scheme`), which sets both the icon and the
      counterpart (currently-dark → go to forced light; currently-light → go to
      dark). The Alpine version did this in `init()` (a frame after first paint);
      computing it synchronously here just removes that one-frame flash — the
      final state is identical.

  Saving goes through `SettingsApi.save('set-theme-dir', counterpart)`, stashes
  the chosen dir under the same `sessionStorage` flash key, then reloads so the
  server re-renders with the new theme. After the reload, `showThemeFlash()`
  surfaces the confirmation toast (same keys/markup as the Alpine helper).

  Hosted by NavBar.svelte; the global navbar mounts on every page of both the
  bundled app and the PHP server PWA. The Alpine `theme_toggle.ts` stays on disk
  (unused) until the Alpine-retirement division.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { SettingsApi } from '@modules/admin/api/settings_api';
  import { t } from '@shared/i18n/translator';

  interface ThemeToggleProps {
    /** Server's active theme mode ('dark' | 'light'); seeds the non-auto icon. */
    mode?: string;
    /** Theme dir to switch to when clicked (overridden in auto mode). */
    counterpart?: string;
    /** True when the active theme is the OS-following "auto" theme. */
    auto?: boolean;
  }
  let { mode = 'light', counterpart = '', auto = false }: ThemeToggleProps = $props();

  const FLASH_KEY = 'lukaisu:theme-flash';
  const AUTO_THEME_VALUES = ['', 'themes/default/', 'dist/themes/Default/'];

  // Effective dark state, resolved from the OS preference in auto mode (else the
  // server mode). matchMedia is synchronous, so the first paint already shows the
  // right icon. Props never change after mount here, but `$derived` keeps Svelte
  // from warning about capturing only their initial value.
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = $derived(auto ? prefersDark : mode === 'dark');

  // In auto mode the counterpart is derived from the OS preference: go to forced
  // light when currently dark, else go to dark (mirrors theme_toggle.ts init()).
  const effectiveCounterpart = $derived(
    auto ? (isDark ? 'dist/themes/Default/' : 'dist/themes/Dark/') : counterpart
  );

  const iconName = $derived(isDark ? 'sun' : 'moon');
  const title = $derived(
    isDark ? t('navbar.switch_to_light_mode') : t('navbar.switch_to_dark_mode')
  );

  function themeDirIsAuto(themeDir: string): boolean {
    return AUTO_THEME_VALUES.includes(themeDir);
  }

  function themeDisplayName(themeDir: string): string {
    // 'dist/themes/Dark/' -> 'Dark'
    return themeDir.split('/').filter(Boolean).pop() ?? themeDir;
  }

  function showThemeFlash(): void {
    const themeDir = sessionStorage.getItem(FLASH_KEY);
    if (themeDir === null) return;
    sessionStorage.removeItem(FLASH_KEY);

    const name = themeDisplayName(themeDir);
    const message = themeDirIsAuto(themeDir)
      ? t('navbar.theme_saved_auto', { theme: name })
      : t('navbar.theme_saved', { theme: name });

    const notif = document.createElement('div');
    notif.className = 'notification is-info';
    notif.setAttribute('role', 'status');

    const close = document.createElement('button');
    close.className = 'delete';
    close.setAttribute('aria-label', 'close');
    close.addEventListener('click', () => notif.remove());
    notif.appendChild(close);
    notif.appendChild(document.createTextNode(message));

    const target = document.querySelector('main') ?? document.body;
    target.insertBefore(notif, target.firstChild);
    window.setTimeout(() => notif.remove(), 4000);
  }

  function switchTheme(event: Event): void {
    event.preventDefault();
    if (!effectiveCounterpart) return;
    void SettingsApi.save('set-theme-dir', effectiveCounterpart).then(() => {
      sessionStorage.setItem(FLASH_KEY, effectiveCounterpart);
      window.location.reload();
    });
  }

  onMount(() => {
    // Show a confirmation toast if the previous page set one before reloading.
    showThemeFlash();
  });
</script>

<!-- svelte-ignore a11y_invalid_attribute -->
<a class="navbar-item" href="#" {title} onclick={switchTheme}>
  <i data-lucide={iconName} class="icon" style="width:16px;height:16px"></i>
</a>
