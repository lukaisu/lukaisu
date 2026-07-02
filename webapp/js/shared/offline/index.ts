/**
 * Offline Module - Exports for PWA offline support.
 *
 * @author  HugoFara <Hugo.Farajallah@protonmail.com>
 * @license Unlicense <http://unlicense.org/>
 */

// Database
export {
  offlineDb,
  isIndexedDBAvailable,
  getOfflineStorageSize,
  getOfflineTextCount,
  clearOfflineData,
  getMetadata,
  setMetadata,
  type OfflineText,
  type OfflineTextWords,
  type OfflineLanguage,
  type SyncMetadata,
  type PendingOperation,
} from './db';

// Text Service
export {
  isOfflineStorageAvailable,
  isTextAvailableOffline,
  getOfflineTextIds,
  downloadTextForOffline,
  removeTextFromOffline,
  getOfflineTextData,
  getOfflineTextMeta,
  getOfflineTextsByLanguage,
  getOfflineSummary,
  ensureLanguageCached,
  getOfflineLanguage,
  isCurrentlyOffline,
  getLastSyncTime,
  type OfflineAvailability,
  type DownloadProgressCallback,
  type OfflineSummary,
} from './text-service';

// Offline Text Reader
export {
  getTextWordsOfflineFirst,
  canReadText,
  getReadableOfflineTextIds,
  type TextDataResult,
} from './offline-text-reader';
