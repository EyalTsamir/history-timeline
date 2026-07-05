/**
 * Regression (adversarial review, stage 4): decimalYearToYearMonth used a bare
 * `remaining < len` comparison, so an exact month-start produced by
 * toDecimalYear round-tripped to the PREVIOUS month for ~44% of boundaries
 * (float underflow: 30.9999… instead of 31). The ruler readout depends on this
 * inverse, and its own test happened to pick only boundaries that rounded high.
 */
import { describe, expect, it } from 'vitest';
import { decimalYearToYearMonth, toDecimalYear } from './dates';

describe('decimalYearToYearMonth ⇄ toDecimalYear month round-trip', () => {
  // leap, common, non-leap century, leap century — covers all daysInMonth paths.
  for (const year of [1948, 1949, 1900, 2000, 1936, 1973]) {
    it(`round-trips every month-start of ${year}`, () => {
      for (let month = 1; month <= 12; month++) {
        const mm = String(month).padStart(2, '0');
        const t = toDecimalYear(`${year}-${mm}`, 'start');
        expect(decimalYearToYearMonth(t)).toEqual({ year, month });
      }
    });
  }

  it('still buckets genuine mid-month instants correctly', () => {
    // mid-March 1949 (~day 74.5) must read as March, not the boundary-nudged April.
    const midMarch = toDecimalYear('1949-03-15', 'start');
    expect(decimalYearToYearMonth(midMarch)).toEqual({ year: 1949, month: 3 });
  });
});
