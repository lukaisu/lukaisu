/**
 * Lukaisu Server State Management - Core data structures and state modules
 *
 * This module re-exports the focused state modules:
 *
 * - reading_state.ts - Reading position state
 * - language_config.ts - Language configuration
 * - text_config.ts - Text configuration
 * - settings_config.ts - Application settings
 * - review_state.ts - Review mode state
 *
 * @license unlicense
 * @author  andreask7 <andreasks7@users.noreply.github.com>
 */

// Import types from globals.d.ts to ensure consistency
import type { LukaisuLanguage, LukaisuText, LukaisuWord, LukaisuReview, LukaisuSettings } from '@/types/globals.d';

// Re-export new state modules for easier migration
export * from '@modules/text/stores/reading_state';
export * from '@modules/language/stores/language_config';
export * from '@modules/text/stores/text_config';
export * from '../utils/settings_config';
export * from '@modules/review/stores/review_state';

// Re-export types for backward compatibility
export type { LukaisuLanguage, LukaisuText, LukaisuWord, LukaisuReview, LukaisuSettings };

