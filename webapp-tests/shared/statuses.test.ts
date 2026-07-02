/**
 * The single frontend status store (issue #238, Phase 1). Locks the canonical
 * table and the predicate/lookup helpers, and guards that it stays consistent
 * with the server `TermStatus` value object.
 */

import { describe, it, expect } from 'vitest';
import {
  STATUS_DEFINITIONS,
  STATUS_ORDER,
  STORED_STATUSES,
  statusDef,
  statusLabel,
  statusAbbr,
  statusColour,
  statusCssClass,
  statusButtonClass,
  isValidStatus,
  isKnownStatus,
  isLearningStatus,
  isIgnoredStatus,
  orderedStatuses,
} from '@shared/stores/statuses';

describe('status store — canonical table', () => {
  it('defines all eight statuses in display order', () => {
    expect(STATUS_ORDER).toEqual([0, 1, 2, 3, 4, 5, 99, 98]);
    expect(STATUS_DEFINITIONS).toHaveLength(8);
  });

  it('stored statuses exclude the display-only 0', () => {
    expect(STORED_STATUSES).toEqual([1, 2, 3, 4, 5, 99, 98]);
    expect(STORED_STATUSES).not.toContain(0);
  });

  it('every entry is self-describing and selector-safe', () => {
    for (const d of STATUS_DEFINITIONS) {
      expect(d.label).toBeTruthy();
      expect(d.cssClass).toBe(`status${d.value}`);
      expect(d.colourHex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('status store — lookups', () => {
  it('resolves label/abbr/colour/class per status', () => {
    expect(statusLabel(1)).toBe('Learning (1)');
    expect(statusLabel(5)).toBe('Learned (5)');
    expect(statusLabel(99)).toBe('Well Known');
    expect(statusLabel(98)).toBe('Ignored');
    expect(statusLabel(0)).toBe('Unknown');
    expect(statusAbbr(3)).toBe('3');
    expect(statusAbbr(99)).toBe('Known');
    expect(statusColour(1)).toBe('#f24e4e');
    expect(statusCssClass(99)).toBe('status99');
    expect(statusButtonClass(1)).toBe('is-danger');
  });

  it('falls back to Unknown for out-of-range values', () => {
    expect(statusDef(42).value).toBe(0);
    expect(statusLabel(42)).toBe('Unknown');
  });
});

describe('status store — predicates', () => {
  it('validates stored statuses (1-5, 98, 99) and rejects 0', () => {
    for (const v of [1, 2, 3, 4, 5, 98, 99]) {
      expect(isValidStatus(v)).toBe(true);
    }
    expect(isValidStatus(0)).toBe(false);
    expect(isValidStatus(6)).toBe(false);
  });

  it('partitions learning (1-4), known (5, 99), ignored (98)', () => {
    expect([1, 2, 3, 4].every(isLearningStatus)).toBe(true);
    expect(isLearningStatus(5)).toBe(false);
    expect(isKnownStatus(5)).toBe(true);
    expect(isKnownStatus(99)).toBe(true);
    expect(isIgnoredStatus(98)).toBe(true);
    expect(isIgnoredStatus(99)).toBe(false);
  });
});

describe('status store — orderedStatuses', () => {
  it('returns the requested values in canonical order', () => {
    const popover = orderedStatuses([1, 2, 3, 4, 5, 99, 98]).map((d) => d.value);
    expect(popover).toEqual([1, 2, 3, 4, 5, 99, 98]);
  });

  it('returns the full table (incl. 0) with no argument', () => {
    expect(orderedStatuses().map((d) => d.value)).toEqual([0, 1, 2, 3, 4, 5, 99, 98]);
  });
});
