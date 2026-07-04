import { describe, expect, it } from 'vitest';
import {
  formatDateRange,
  formatHistDate,
  isValidHistDate,
  isValidRangeOrder,
  parseHistDate,
  rangeKind,
  spanOf,
  toDecimalYear,
} from './dates';

describe('parseHistDate', () => {
  it('parses year precision', () => {
    expect(parseHistDate('1948')).toEqual({ year: 1948, precision: 'year' });
  });

  it('parses month precision', () => {
    expect(parseHistDate('1948-05')).toEqual({ year: 1948, month: 5, precision: 'month' });
  });

  it('parses day precision', () => {
    expect(parseHistDate('1948-05-14')).toEqual({ year: 1948, month: 5, day: 14, precision: 'day' });
  });

  it.each(['1948-13', '1948-02-30', '48', '1948-5', '', 'garbage'])('rejects %j', (bad) => {
    expect(() => parseHistDate(bad)).toThrow(/Invalid HistDate/);
  });
});

describe('isValidHistDate leap-year rules', () => {
  it('accepts Feb 29 in a leap year (1948)', () => {
    expect(isValidHistDate('1948-02-29')).toBe(true);
  });

  it('rejects Feb 29 in a common year (1947)', () => {
    expect(isValidHistDate('1947-02-29')).toBe(false);
  });

  it('rejects Feb 29 in a century non-leap year (1900)', () => {
    expect(isValidHistDate('1900-02-29')).toBe(false);
  });

  it('accepts Feb 29 in a 400-divisible year (2000)', () => {
    expect(isValidHistDate('2000-02-29')).toBe(true);
  });
});

describe('toDecimalYear', () => {
  it('year: start is the year, end is the next year', () => {
    expect(toDecimalYear('1948', 'start')).toBe(1948);
    expect(toDecimalYear('1948', 'end')).toBe(1949);
  });

  it('month: start/end use day-of-year over the leap-aware year length', () => {
    // 1948 is a leap year (366 days); May 1 is day 122, June 1 is day 153.
    expect(toDecimalYear('1948-05', 'start')).toBe(1948 + 121 / 366);
    expect(toDecimalYear('1948-05', 'end')).toBe(1948 + 152 / 366);
  });

  it('December end rolls over to the next year exactly', () => {
    expect(toDecimalYear('1948-12', 'end')).toBe(1949);
  });

  it('day: start inclusive, end exclusive, one day apart', () => {
    // day-of-year of 1948-05-14 is 135 (leap year).
    expect(toDecimalYear('1948-05-14', 'start')).toBe(1948 + 134 / 366);
    expect(toDecimalYear('1948-05-14', 'end')).toBe(1948 + 135 / 366);
  });

  it('Dec 31 end is exactly the next year', () => {
    expect(toDecimalYear('1948-12-31', 'end')).toBe(1949);
    expect(toDecimalYear('1947-12-31', 'end')).toBe(1948);
  });

  it('uses 366 as denominator in leap years and 365 otherwise', () => {
    // March 1: day 61 in a leap year, day 60 in a common year.
    expect(toDecimalYear('1948-03-01', 'start')).toBe(1948 + 60 / 366);
    expect(toDecimalYear('1947-03-01', 'start')).toBe(1947 + 59 / 365);
  });
});

describe('rangeKind', () => {
  it('classifies point / closed / open', () => {
    expect(rangeKind({ start: '1948' })).toBe('point');
    expect(rangeKind({ start: '1936', end: '1939' })).toBe('closed');
    expect(rangeKind({ start: '1954', end: null })).toBe('open');
  });
});

describe('spanOf', () => {
  it('point range spans the full period the date denotes', () => {
    expect(spanOf({ start: '1948-05-14' })).toEqual({ start: 1948 + 134 / 366, end: 1948 + 135 / 366 });
    expect(spanOf({ start: '1948' })).toEqual({ start: 1948, end: 1949 });
  });

  it('closed range spans start-edge to end-edge', () => {
    // 1947-11-30 is day 334 of 365; 1949-07-20 is day 201 of 365.
    expect(spanOf({ start: '1947-11-30', end: '1949-07-20' })).toEqual({
      start: 1947 + 333 / 365,
      end: 1949 + 201 / 365,
    });
  });

  it('open range has end null', () => {
    expect(spanOf({ start: '1954', end: null })).toEqual({ start: 1954, end: null });
  });
});

describe('isValidRangeOrder', () => {
  it('rejects a closed range whose end precedes its start', () => {
    expect(isValidRangeOrder({ start: '1949', end: '1948' })).toBe(false);
    expect(isValidRangeOrder({ start: '1948-05-15', end: '1948-05-14' })).toBe(false);
  });

  it('accepts a coarser start containing a finer end', () => {
    expect(isValidRangeOrder({ start: '1948', end: '1948-05' })).toBe(true);
  });

  it('accepts equal start and end', () => {
    expect(isValidRangeOrder({ start: '1948', end: '1948' })).toBe(true);
    expect(isValidRangeOrder({ start: '1948-05-14', end: '1948-05-14' })).toBe(true);
  });

  it('point and open ranges are always well-ordered', () => {
    expect(isValidRangeOrder({ start: '1949' })).toBe(true);
    expect(isValidRangeOrder({ start: '1949', end: null })).toBe(true);
  });
});

describe('formatHistDate', () => {
  it('year precision renders the bare year', () => {
    expect(formatHistDate('1948')).toBe('1948');
  });

  it('month precision renders the Hebrew month name', () => {
    expect(formatHistDate('1948-05')).toBe('מאי 1948');
  });

  it('day precision renders the "N ב<month> YYYY" form', () => {
    expect(formatHistDate('1948-05-14')).toBe('14 במאי 1948');
  });
});

describe('formatDateRange', () => {
  it('point range renders like a single date', () => {
    expect(formatDateRange({ start: '1948' })).toBe('1948');
  });

  it('closed year range uses an unspaced en dash', () => {
    expect(formatDateRange({ start: '1936', end: '1939' })).toBe('1936–1939');
  });

  it('closed range with month names uses a spaced en dash', () => {
    expect(formatDateRange({ start: '1948-05', end: '1949-07' })).toBe('מאי 1948 – יולי 1949');
  });

  it('open range renders a trailing dash', () => {
    expect(formatDateRange({ start: '1954', end: null })).toBe('1954–');
  });

  it('approx prefixes ≈', () => {
    expect(formatDateRange({ start: '1942', approx: true })).toBe('≈1942');
    expect(formatDateRange({ start: '1936', end: '1939', approx: true })).toBe('≈1936–1939');
  });

  it('collapses identical start/end text to a single date', () => {
    expect(formatDateRange({ start: '1948', end: '1948' })).toBe('1948');
  });
});
