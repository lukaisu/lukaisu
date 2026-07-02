/**
 * Shared helpers + types for the home page's catalog-suggestion widgets.
 *
 * The Gutenberg and GDL suggestion rows (`GutenbergSuggestions.svelte` /
 * `GdlSuggestions.svelte`) are structurally near-identical but diverge enough
 * (different book shapes, import/preview endpoints, GDL's reader-level ordering
 * and local-first-only EPUB preview) that they stay as two components. This
 * module holds only the pure formatters they share verbatim, ported from the
 * Alpine `gutenberg_suggestions.ts` / `gdl_suggestions.ts` components.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { t } from '@shared/i18n/translator';

/** On-device coverage-preview result (the server's `library-preview` shape). */
export interface PreviewData {
  total_unique_words: number;
  known_words: number;
  unknown_words: number;
  coverage_percent: number;
  difficulty_label: string;
  sample_unknown_words: string[];
}

/** Catalog page envelope (`{ results, count, next }`), shared with the server. */
export interface CatalogResponse<T> {
  results: T[];
  count: number;
  next: boolean;
}

/** Bulma tag classes for a difficulty tier (book tag). */
export function tierClass(tier: string | undefined): string {
  if (tier === 'easy') return 'is-success is-light';
  if (tier === 'hard') return 'is-danger is-light';
  return 'is-warning is-light';
}

/** Bulma progress colour class for a coverage difficulty label. */
export function coverageClass(label: string): string {
  if (label === 'easy') return 'is-success';
  if (label === 'hard') return 'is-danger';
  return 'is-warning';
}

/** Translated "you know X% of unique words" coverage caption. */
export function coverageLabel(data: PreviewData): string {
  return t('home.you_know_x_of_unique_words', { percent: data.coverage_percent });
}
