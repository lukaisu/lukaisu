<!--
  NavBar — the global navigation bar (Svelte 5). Originally a port of the Alpine
  navbar; it is now the sole renderer — Alpine was retired under the headless cut
  (the old `navbar.ts` component and `navbar_renderer.ts` HTML builder are gone;
  `navbar_renderer.ts` survives only as the shared `NavbarData` types). Hosts the
  nested streak flame (`NavbarStreak.svelte`) and the theme toggle
  (`ThemeToggle.svelte`).

  `mountNavbar()` (frontend_shell.ts) fetches `GET /api/v1/navbar` and mounts
  this island into the `#navbar-root` placeholder. Behaviour:
    - active top-level highlight from `currentPage`,
    - the three primary button groups (texts / vocabulary / languages, each with
      a "+" sibling),
    - the language `<select>` switcher (setLangAsync → strip `filterlang` or
      reload; reloading re-mounts every island fresh),
    - the user dropdown (open/close, click-outside, ESC),
    - the mobile drawer (burger toggle, overlay click, ESC, Back/popstate close),
    - logout as a CSRF-protected POST.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { setLangAsync } from '@modules/language/stores/language_settings';
  import { getCsrfToken } from '@shared/api/client';
  import { t } from '@shared/i18n/translator';
  import { initIcons } from '@shared/icons/lucide_icons';
  import type { NavbarData as NavbarChromeData } from '@shared/components/navbar_renderer';
  import NavbarStreak from '@shared/components/NavbarStreak.svelte';
  import ThemeToggle from '@shared/components/ThemeToggle.svelte';

  let { data, currentPage = '' }: { data: NavbarChromeData; currentPage?: string } = $props();

  // Page identifiers that light up each top-level nav section (mirrors buildNavbar).
  const TEXTS_PAGES = ['texts', 'archived', 'text-tags', 'text-check', 'long-import', 'feeds'];
  const TERMS_PAGES = ['terms', 'term-tags', 'term-import'];
  const LANGUAGES_PAGES = ['languages', 'language-new', 'language-edit'];
  const ADMIN_PAGES = ['backup', 'settings', 'tts', 'users'];
  const USER_PAGES = ['preferences', 'profile'];

  let isOpen = $state(false);
  let activeDropdown = $state<string | null>(null);
  let navEl = $state<HTMLElement | null>(null);

  // Props never change after mount here, but `$derived` keeps Svelte from warning
  // about capturing only their initial value.
  const base = $derived(data.basePath);

  // The three primary nav buttons, each with a "+" sibling (mirrors primaryButtons).
  const primaryGroups = $derived([
    {
      href: `${base}/texts`,
      active: TEXTS_PAGES.includes(currentPage),
      icon: 'book-text',
      label: t('navbar.texts'),
      newHref: `${base}/texts/new`,
      newTitle: t('navbar.new_text_title')
    },
    {
      href: `${base}/words`,
      active: TERMS_PAGES.includes(currentPage),
      icon: 'spell-check',
      label: t('navbar.vocabulary'),
      newHref: `${base}/words/new`,
      newTitle: t('navbar.new_term_title')
    },
    {
      href: `${base}/languages`,
      active: LANGUAGES_PAGES.includes(currentPage),
      icon: 'languages',
      label: t('navbar.languages'),
      newHref: `${base}/languages/new`,
      newTitle: t('navbar.new_language_title')
    }
  ]);

  const userActive = $derived(
    USER_PAGES.includes(currentPage) || ADMIN_PAGES.includes(currentPage)
  );

  function open(): void {
    isOpen = true;
    // Push a history entry so Back closes the drawer (see the popstate handler).
    // Guard against stacking duplicates.
    if (!(history.state && history.state.lukaisuNavbar)) {
      history.pushState({ lukaisuNavbar: true }, '');
    }
  }

  function closeDropdowns(): void {
    activeDropdown = null;
  }

  function close(): void {
    if (isOpen) {
      isOpen = false;
      closeDropdowns();
      // Drop the history entry we pushed on open, if it's still current.
      if (history.state && history.state.lukaisuNavbar) {
        history.back();
      }
    } else {
      // Desktop dropdowns can be open without the mobile drawer.
      closeDropdowns();
    }
  }

  function toggle(): void {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  function toggleDropdown(name: string): void {
    if (activeDropdown === name) {
      activeDropdown = null;
    } else {
      activeDropdown = name;
    }
  }

  function switchLanguage(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const languageId = select.value;
    if (!languageId) return;

    setLangAsync(languageId)
      .then(() => {
        // Strip filterlang from the URL so the new DB setting takes effect.
        const u = new URL(window.location.href);
        if (u.searchParams.has('filterlang')) {
          u.searchParams.delete('filterlang');
          window.location.href = u.toString();
        } else {
          window.location.reload();
        }
      })
      .catch((error) => {
        console.error('Failed to change language:', error);
      });
  }

  function logout(): void {
    // POST so `<img src=/logout>`-style cross-site GETs cannot log the user out;
    // include the CSRF token so the server's CsrfMiddleware accepts it.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/logout';

    const tokenField = document.createElement('input');
    tokenField.type = 'hidden';
    tokenField.name = '_csrf_token';
    tokenField.value = getCsrfToken();
    form.appendChild(tokenField);

    document.body.appendChild(form);
    form.submit();
  }

  // Listeners (ported from navbar.ts init()): click-outside, ESC, and popstate
  // (Back) all close the drawer/dropdowns. Attached/cleaned in $effects.
  $effect(() => {
    function onDocClick(e: MouseEvent): void {
      if (navEl && !navEl.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  $effect(() => {
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  $effect(() => {
    // Make the hardware/browser Back button close the mobile drawer instead of
    // leaving the page. Opening the drawer pushes a history entry; Back pops it
    // (popstate) and we reflect that by closing. This stops Back from exiting the
    // Android app shell while the menu is open.
    function onPopState(): void {
      if (isOpen) {
        isOpen = false;
        closeDropdowns();
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  // Hydrate the lucide icons once the navbar (and its nested islands) are in the
  // DOM — the brand burger, primary-button icons, user icon, flame and theme icon.
  onMount(() => {
    void tick().then(() => initIcons());
  });
</script>

<nav class="navbar is-light" aria-label={t('navbar.main_navigation')} bind:this={navEl}>
  <div class="navbar-brand">
    <a class="navbar-item" href="{base}/">
      <img src={data.logoUrl} alt="Lukaisu" width="28" height="28" />
      <span class="ml-2 has-text-weight-semibold">Lukaisu</span>
    </a>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
    <a
      role="button"
      tabindex="0"
      class="navbar-burger"
      class:is-active={isOpen}
      aria-label={t('navbar.menu')}
      aria-expanded="false"
      onclick={toggle}
    >
      <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"
      ></span><span aria-hidden="true"></span>
    </a>
  </div>

  <div class="navbar-menu" class:is-active={isOpen}>
    <div class="navbar-start">
      {#each primaryGroups as group (group.href)}
        <div class="navbar-item">
          <div class="buttons has-addons mb-0">
            <a class="button is-small" class:is-active={group.active} href={group.href}>
              <span class="icon is-small"
                ><i data-lucide={group.icon} class="icon" style="width:16px;height:16px"></i></span
              ><span>{group.label}</span>
            </a>
            <a class="button is-small" href={group.newHref} title={group.newTitle}>
              <span class="icon is-small"
                ><i data-lucide="plus" class="icon" style="width:16px;height:16px"></i></span
              >
            </a>
          </div>
        </div>
      {/each}

      {#if data.languages.length > 0}
        <div class="navbar-item">
          <div class="field has-addons mb-0">
            <div class="control">
              <div class="select is-small">
                <select
                  value={data.currentLanguageId}
                  data-current-lang={data.currentLanguageId}
                  onchange={switchLanguage}
                >
                  {#each data.languages as lang (lang.id)}
                    <option value={lang.id}>{lang.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <NavbarStreak basePath={base} />
    </div>

    <div class="navbar-end">
      <ThemeToggle mode={data.theme.mode} counterpart={data.theme.counterpart} auto={data.theme.auto} />

      <div class="navbar-item has-dropdown" class:is-active={userActive || activeDropdown === 'user'}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute, a11y_no_static_element_interactions -->
        <a class="navbar-link" onclick={(e) => { e.preventDefault(); toggleDropdown('user'); }}>
          <i data-lucide="user" class="icon" style="width:16px;height:16px"></i><span class="ml-1"
            >{t('navbar.user')}</span
          >
        </a>
        <div class="navbar-dropdown is-right">
          <a class="navbar-item" href="{base}/profile/preferences">{t('navbar.preferences')}</a>
          {#if data.isMultiUser}
            <a class="navbar-item" href="{base}/profile">{t('navbar.profile')}</a>
          {/if}
          {#if data.showAdminItems}
            <hr class="navbar-divider" />
            <a class="navbar-item" href="{base}/admin/backup">{t('navbar.database_operations')}</a>
            <a class="navbar-item" href="{base}/admin/settings">{t('navbar.admin_settings')}</a>
            <a class="navbar-item" href="{base}/admin/users">{t('navbar.users')}</a>
            <a class="navbar-item" href="{base}/admin/server-data">{t('navbar.server_data')}</a>
          {/if}
          <hr class="navbar-divider" />
          <a class="navbar-item" href="{base}/docs/info.html" target="_blank" rel="noopener"
            >{t('navbar.help')}</a
          >
          {#if data.isMultiUser}
            <hr class="navbar-divider" />
            <!-- Logout POSTs with a CSRF token via logout(); the href is decorative. -->
            <a class="navbar-item" href="{base}/logout" onclick={(e) => { e.preventDefault(); logout(); }}
              >{t('navbar.logout')}</a
            >
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Dimmed overlay behind the mobile left drawer; tapping it closes the menu.
       Kept inside <nav> so the click-outside handler treats it as "inside". -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="navbar-overlay" class:is-active={isOpen} onclick={close}></div>
</nav>
