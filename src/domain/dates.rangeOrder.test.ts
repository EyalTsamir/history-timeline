/**
 * Regression (review finding): isValidRangeOrder must accept mixed-precision
 * closed ranges in BOTH directions — the old implementation rejected a finer
 * start inside a coarser end ({start:"1948-05-14", end:"1948"}).
 * Invariant: a closed range is valid iff its projected span has positive width.
 */
import { describe, expect, it } from 'vitest';
import { isValidRangeOrder, spanOf } from './dates';

describe('isValidRangeOrder mixed precision', () => {
  it('accepts a day-precision start inside a year-precision end', () => {
    expect(isValidRangeOrder({ start: '1948-05-14', end: '1948' })).toBe(true);
  });

  it('accepts a month-precision start inside a year-precision end', () => {
    expect(isValidRangeOrder({ start: '1948-04', end: '1948' })).toBe(true);
  });

  it('still accepts a coarse start with a finer end', () => {
    expect(isValidRangeOrder({ start: '1948', end: '1948-05' })).toBe(true);
  });

  it('still rejects true reversals across periods', () => {
    expect(isValidRangeOrder({ start: '1949-01-01', end: '1948' })).toBe(false);
    expect(isValidRangeOrder({ start: '1948-05-15', end: '1948-05-14' })).toBe(false);
    expect(isValidRangeOrder({ start: '1949', end: '1948' })).toBe(false);
  });

  it('accepts equal start and end (the period itself)', () => {
    expect(isValidRangeOrder({ start: '1948-05-14', end: '1948-05-14' })).toBe(true);
    expect(isValidRangeOrder({ start: '1948', end: '1948' })).toBe(true);
  });

  it('valid closed ranges always project to a positive-width span', () => {
    for (const range of [
      { start: '1948-05-14', end: '1948' },
      { start: '1948-04', end: '1948' },
      { start: '1948', end: '1948-05' },
      { start: '1948-05-14', end: '1948-05-14' },
    ]) {
      expect(isValidRangeOrder(range)).toBe(true);
      const span = spanOf(range);
      expect(span.end).not.toBeNull();
      expect(span.end! - span.start).toBeGreaterThan(0);
    }
  });
});
