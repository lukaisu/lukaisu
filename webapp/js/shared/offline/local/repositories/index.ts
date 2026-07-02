/**
 * Local repositories — the on-device data layer the offline app reads/writes
 * instead of (or in addition to) the remote `/api/v1`.
 *
 * @license Unlicense <http://unlicense.org/>
 */

export * as languages from './languages';
export * as texts from './texts';
export * as terms from './terms';
export * as review from './review';
export * as words from './words';
export * as tags from './tags';
export * as activity from './activity';
export { getNavbarData } from './navbar';
export { getSentencesWithTerm } from './sentences';
export {
  getSetting,
  setSetting,
  getCurrentLanguageId,
  setCurrentLanguageId,
  SettingKeys,
} from './settings';
export { seedIfNeeded } from './seed';
