/**
 * Local-first data layer (public surface).
 *
 * Brings together the on-device database, the tokenizer, review scheduling, the
 * starter content, and the repositories that the offline app uses instead of
 * the remote API.
 *
 * @license Unlicense <http://unlicense.org/>
 */

export * from './schema';
export * from './parser';
export * from './fsrs';
export * from './review-scoring';
export * from './text-assembly';
export { toClassName, toHex } from './class-name';
export { LANGUAGE_PRESETS, type LanguagePreset } from './language-presets';
export { SAMPLE_TEXTS, type SampleText } from './sample-texts';
export * as repositories from './repositories';
