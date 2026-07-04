import { describe, expect, it } from 'vitest';
import { toDecimalYear } from '../domain/dates';
import { formatWindowRange, generateTicks } from './ticks';

describe('generateTicks', () => {
  it('century-wide view → decade ticks with 50-year majors', () => {
    const ticks = generateTicks({ start: 1900, end: 2000 }, 1000);
    expect(ticks.map((t) => t.t)).toEqual([1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000]);
    expect(ticks.find((t) => t.t === 1950)?.major).toBe(true);
    expect(ticks.find((t) => t.t === 1940)?.major).toBe(false);
    expect(ticks.find((t) => t.t === 1940)?.label).toBe('1940');
  });

  it('decade-wide view → year ticks with decade majors', () => {
    const ticks = generateTicks({ start: 1945, end: 1955 }, 1000);
    expect(ticks).toHaveLength(11);
    expect(ticks[0]).toMatchObject({ t: 1945, label: '1945', major: false });
    expect(ticks.find((t) => t.t === 1950)?.major).toBe(true);
  });

  it('two-year view → quarter ticks with Hebrew month labels, January major', () => {
    const ticks = generateTicks({ start: 1947, end: 1949 }, 1000);
    const jan48 = ticks.find((t) => t.label === 'ינואר 1948');
    const apr48 = ticks.find((t) => t.label === 'אפריל 1948');
    expect(jan48).toBeDefined();
    expect(jan48!.major).toBe(true);
    expect(apr48).toBeDefined();
    expect(apr48!.major).toBe(false);
    expect(apr48!.t).toBeCloseTo(toDecimalYear('1948-04', 'start'), 9);
  });

  it('narrow month-level view → single-month ticks', () => {
    const ticks = generateTicks({ start: 1948.2, end: 1948.7 }, 1200);
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.every((t) => /^[א-ת]+ 1948$/.test(t.label))).toBe(true);
  });

  it('covers a wider range than the window when `cover` is passed (pan buffer)', () => {
    const window = { start: 1940, end: 1950 };
    const ticks = generateTicks(window, 1000, { start: 1930, end: 1960 });
    expect(ticks[0]!.t).toBeLessThanOrEqual(1931);
    expect(ticks[ticks.length - 1]!.t).toBeGreaterThanOrEqual(1959);
  });

  it('never returns an empty list for a sane window', () => {
    expect(generateTicks({ start: 0, end: 5000 }, 320).length).toBeGreaterThan(0);
  });
});

describe('formatWindowRange', () => {
  it('year precision on wide windows', () => {
    expect(formatWindowRange({ start: 1947.2, end: 1952.9 })).toBe('1947–1952');
  });

  it('month precision under 3 years', () => {
    expect(formatWindowRange({ start: toDecimalYear('1948-03', 'start'), end: toDecimalYear('1948-07', 'start') })).toBe(
      'מרץ 1948 – יולי 1948',
    );
  });

  it('collapses a same-month window to a single label', () => {
    const t = toDecimalYear('1948-05-10', 'start');
    expect(formatWindowRange({ start: t, end: t + 0.02 })).toBe('מאי 1948');
  });
});
