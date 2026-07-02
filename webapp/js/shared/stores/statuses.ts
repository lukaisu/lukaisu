/**
 * The single frontend source of truth for the word-status display model.
 *
 * Mirrors the server `TermStatus` value object
 * (`src/Modules/Vocabulary/Domain/ValueObject/TermStatus.php::definitions()`,
 * exposed at `GET /api/v1/statuses`). The table is static reference data, so it
 * is shipped built-in — the bundled offline app needs it with no server, and
 * `buttonClass` is a frontend-only concern the API doesn't carry.
 *
 * Replaces the per-file status tables that used to live in word_popover.ts,
 * term_edit_modal.ts, text_status_chart.ts, texts_grouped_app.ts, html_utils.ts
 * and statistics_charts.ts (issue #238, Phase 1).
 *
 * Status values: 0 (unknown — display only), 1-5 (learning), 98 (ignored),
 * 99 (well-known).
 *
 * @license Unlicense <http://unlicense.org/>
 */

export interface StatusDefinition {
  /** Numeric status value (0, 1-5, 98, 99). */
  value: number;
  /** Full English display label, e.g. "Learning (1)". */
  label: string;
  /** Language-neutral abbreviation ("1".."5", "Known", "Ignore", ""). */
  abbr: string;
  /** Reading-view CSS class, e.g. "status1". */
  cssClass: string;
  /** Canonical reading-view colour (hex). */
  colourHex: string;
  /** Display/sort order (learning ascending, then well-known, then ignored). */
  order: number;
  /** Bulma button modifier class used by the word popover. */
  buttonClass: string;
  /** Learned (5) or well-known (99). */
  isKnown: boolean;
  /** A learning stage in progress (1-4). */
  isLearning: boolean;
  /** Ignored (98). */
  isIgnored: boolean;
}

/**
 * Canonical status table, in display order. Keep byte-compatible with
 * `TermStatus::definitions()` (value/label/abbr/cssClass/colourHex/order/
 * predicates); `buttonClass` is frontend-only.
 */
export const STATUS_DEFINITIONS: StatusDefinition[] = [
  { value: 0, label: 'Unknown', abbr: '', cssClass: 'status0', colourHex: '#8bdadc', order: 0, buttonClass: 'is-light', isKnown: false, isLearning: false, isIgnored: false },
  { value: 1, label: 'Learning (1)', abbr: '1', cssClass: 'status1', colourHex: '#f24e4e', order: 1, buttonClass: 'is-danger', isKnown: false, isLearning: true, isIgnored: false },
  { value: 2, label: 'Learning (2)', abbr: '2', cssClass: 'status2', colourHex: '#ffac80', order: 2, buttonClass: 'is-warning', isKnown: false, isLearning: true, isIgnored: false },
  { value: 3, label: 'Learning (3)', abbr: '3', cssClass: 'status3', colourHex: '#ffe199', order: 3, buttonClass: 'is-info', isKnown: false, isLearning: true, isIgnored: false },
  { value: 4, label: 'Learning (4)', abbr: '4', cssClass: 'status4', colourHex: '#fffd77', order: 4, buttonClass: 'is-primary', isKnown: false, isLearning: true, isIgnored: false },
  { value: 5, label: 'Learned (5)', abbr: '5', cssClass: 'status5', colourHex: '#99ff99', order: 5, buttonClass: 'is-success', isKnown: true, isLearning: false, isIgnored: false },
  { value: 99, label: 'Well Known', abbr: 'Known', cssClass: 'status99', colourHex: '#999999', order: 6, buttonClass: 'is-success is-light', isKnown: true, isLearning: false, isIgnored: false },
  { value: 98, label: 'Ignored', abbr: 'Ignore', cssClass: 'status98', colourHex: '#aaaaaa', order: 7, buttonClass: 'is-light', isKnown: false, isLearning: false, isIgnored: true },
];

const BY_VALUE = new Map<number, StatusDefinition>(
  STATUS_DEFINITIONS.map((d) => [d.value, d])
);

const UNKNOWN = STATUS_DEFINITIONS[0];

/** Status values in canonical display order: [0, 1, 2, 3, 4, 5, 99, 98]. */
export const STATUS_ORDER: number[] = STATUS_DEFINITIONS.map((d) => d.value);

/** Valid stored status values (excludes the display-only 0). */
export const STORED_STATUSES: number[] = STATUS_DEFINITIONS
  .map((d) => d.value)
  .filter((v) => v !== 0);

/**
 * Statuses a user can set directly (issue #238, Phase 2). The learning level
 * 1-5 is no longer hand-set — it is derived from FSRS stability
 * (`statusFromStability`) and shown read-only. The only settable states are
 * start-Learning (1), Well-known (99), and Ignored (98), in display order.
 */
export const SETTABLE_STATUSES: number[] = [1, 99, 98];

/**
 * Button/label text for a settable status. The settable "1" means "start
 * learning", so it reads "Learning" rather than the display label "Learning (1)".
 */
export function settableLabel(value: number): string {
  return value === 1 ? 'Learning' : statusLabel(value);
}

/** Look up the full definition for a status value (falls back to Unknown). */
export function statusDef(value: number): StatusDefinition {
  return BY_VALUE.get(value) ?? UNKNOWN;
}

/** Display label for a status value, e.g. "Learning (1)". */
export function statusLabel(value: number): string {
  return statusDef(value).label;
}

/** Abbreviation for a status value ("1".."5", "Known", "Ignore", ""). */
export function statusAbbr(value: number): string {
  return statusDef(value).abbr;
}

/** Canonical reading-view colour (hex) for a status value. */
export function statusColour(value: number): string {
  return statusDef(value).colourHex;
}

/** Reading-view CSS class for a status value, e.g. "status1". */
export function statusCssClass(value: number): string {
  return statusDef(value).cssClass;
}

/** Bulma button modifier class for a status value (word popover). */
export function statusButtonClass(value: number): string {
  return statusDef(value).buttonClass;
}

/** Whether a value is a valid stored status (1-5, 98, 99). */
export function isValidStatus(value: number): boolean {
  return value !== 0 && BY_VALUE.has(value);
}

/** Whether a status is known (learned or well-known). */
export function isKnownStatus(value: number): boolean {
  return statusDef(value).isKnown;
}

/** Whether a status is a learning stage in progress (1-4). */
export function isLearningStatus(value: number): boolean {
  return statusDef(value).isLearning;
}

/** Whether a status is ignored (98). */
export function isIgnoredStatus(value: number): boolean {
  return statusDef(value).isIgnored;
}

/**
 * Derive the display learning status (1-5) from FSRS stability (in days).
 *
 * Phase 2 (issue #238): the learning status is no longer set by hand — it is a
 * read-only view of the FSRS memory strength. Buckets: `S<1⇒1, <7⇒2, <30⇒3,
 * <90⇒4, ≥90⇒5`. A never-reviewed card (stability 0) maps to 1. Ignored (98)
 * and well-known (99) are manual flags and are NOT derived from stability — do
 * not pass them here.
 *
 * Keep the buckets in sync with `STATUS_SEED_STABILITY` in
 * `shared/offline/local/fsrs.ts` and the SQL migration's seeding `CASE`.
 */
export function statusFromStability(stability: number): number {
  if (stability < 1) return 1;
  if (stability < 7) return 2;
  if (stability < 30) return 3;
  if (stability < 90) return 4;
  return 5;
}

/**
 * The definitions for the given status values, in canonical order. With no
 * argument, returns the full table (including the display-only Unknown/0).
 */
export function orderedStatuses(values?: number[]): StatusDefinition[] {
  if (!values) {
    return STATUS_DEFINITIONS;
  }
  const wanted = new Set(values);
  return STATUS_DEFINITIONS.filter((d) => wanted.has(d.value));
}
