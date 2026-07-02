/**
 * Navbar repository — the chrome data `GET /api/v1/navbar` returns, served from
 * the local DB so the global navbar (and its language switcher) renders with no
 * server.
 *
 * Server-only menu entries (admin settings, backup, users, server-data) are
 * gated off via `showAdminItems: false`; `isMultiUser` is false (single-user
 * on-device). The theme block carries a neutral light/auto default — the theme
 * toggle persists its own choice client-side, so no server round-trip is needed.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { listLanguages } from './languages';
import { LUKAISU_LOGO_DATA_URI } from '../logo';
import type { NavbarData } from '@shared/components/navbar_renderer';

/** Build the navbar chrome from the local languages + current-language setting. */
export async function getNavbarData(): Promise<NavbarData> {
  const { languages, currentLanguageId } = await listLanguages();
  return {
    basePath: '',
    // Inline data URI: the app build ships no image files, so a URL would 404.
    logoUrl: LUKAISU_LOGO_DATA_URI,
    languages: languages.map((l) => ({ id: l.id, name: l.name })),
    currentLanguageId,
    isMultiUser: false,
    showAdminItems: false,
    theme: {
      mode: 'light',
      counterpart: 'dist/themes/Dark/',
      current: '',
      auto: true,
    },
  };
}
