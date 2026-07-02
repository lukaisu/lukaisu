/**
 * Settings repository — key/value app settings on the local DB (single-user,
 * so no per-user scoping). Holds the current language, theme, locale, etc.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb } from '../schema';

/** Well-known setting keys. */
export const SettingKeys = {
  CURRENT_LANGUAGE: 'currentLanguageId',
  SEEDED: 'localSeeded',
} as const;

/** Read a setting, returning `fallback` if unset. */
export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await localDb.settings.get(key);
  return row?.value ?? fallback;
}

/** Write a setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await localDb.settings.put({ key, value });
}

/** The current/default language id (0 if none chosen yet). */
export async function getCurrentLanguageId(): Promise<number> {
  const value = await getSetting(SettingKeys.CURRENT_LANGUAGE, '');
  return value ? parseInt(value, 10) : 0;
}

/** Set the current/default language. */
export async function setCurrentLanguageId(id: number): Promise<void> {
  await setSetting(SettingKeys.CURRENT_LANGUAGE, String(id));
}
