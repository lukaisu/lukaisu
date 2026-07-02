/**
 * Global navigation bar — shared types.
 *
 * The navbar chrome is rendered by the Svelte `NavBar.svelte` island, mounted by
 * `mountNavbar()` (frontend_shell.ts) from GET /api/v1/navbar. These interfaces
 * describe that API payload and are consumed by NavBar.svelte, the shared
 * bootstrap, and the offline navbar repository.
 *
 * This module used to ALSO build the navbar as an HTML string with Alpine
 * directives (`renderNavbar()` + helpers), hydrated via Alpine.initTree. That
 * renderer was deleted under the headless cut (R6e): once NavBar.svelte became
 * the sole renderer and the server stopped booting Alpine, nothing called it.
 * The filename is kept (it is still imported for these types) but it no longer
 * renders anything.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** A language option for the navbar's language switcher. */
export interface NavbarLanguage {
  id: number;
  name: string;
}

/** Theme-toggle state mirrored from the server's active theme. */
export interface NavbarTheme {
  mode: string;
  counterpart: string;
  current: string;
  auto: boolean;
}

/** Payload shape of GET /api/v1/navbar (see PageLayoutHelper::getNavbarData). */
export interface NavbarData {
  basePath: string;
  logoUrl: string;
  languages: NavbarLanguage[];
  currentLanguageId: number;
  isMultiUser: boolean;
  showAdminItems: boolean;
  theme: NavbarTheme;
}
