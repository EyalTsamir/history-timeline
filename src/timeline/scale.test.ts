import { describe, expect, it } from 'vitest';
import {
  clampWindow,
  deriveViewportDefaults,
  extendRectTowardLater,
  panOffsetPx,
  panWindowByPx,
  pxPerYear,
  rectOf,
  spansIntersect,
  spanYears,
  tOf,
  xOf,
  yearsPer1000px,
  zoomWindowAtPx,
} from './scale';
import type { Scale, TimeWindow, WindowLimits } from './scale';

const WINDOW: TimeWindow = { start: 1930, end: 2000 }; // span 70
const RTL: Scale = { window: WINDOW, widthPx: 700, dir: 'rtl' }; // 10 px/year
const LTR: Scale = { window: WINDOW, widthPx: 700, dir: 'ltr' };

describe('scale basics', () => {
  it('computes span, px/year and years-per-1000px', () => {
    expect(spanYears(WINDOW)).toBe(70);
    expect(pxPerYear(RTL)).toBe(10);
    expect(yearsPer1000px(WINDOW, 700)).toBeCloseTo(100);
  });

  it('RTL: past on the right — window.end at x=0, window.start at x=width', () => {
    expect(xOf(RTL, 2000)).toBe(0);
    expect(xOf(RTL, 1930)).toBe(700);
    expect(xOf(RTL, 1990)).toBe(100);
  });

  it('LTR: window.start at x=0', () => {
    expect(xOf(LTR, 1930)).toBe(0);
    expect(xOf(LTR, 2000)).toBe(700);
    expect(xOf(LTR, 1990)).toBe(600);
  });

  it('xOf and tOf round-trip in both directions', () => {
    for (const scale of [RTL, LTR]) {
      for (const t of [1930, 1948.37, 1967, 2000]) {
        expect(tOf(scale, xOf(scale, t))).toBeCloseTo(t, 9);
      }
      for (const x of [0, 123.4, 700]) {
        expect(xOf(scale, tOf(scale, x))).toBeCloseTo(x, 9);
      }
    }
  });

  it('rectOf: left edge is the later end under RTL, the earlier under LTR', () => {
    expect(rectOf(RTL, 1940, 1950)).toEqual({ x: 500, width: 100 });
    expect(rectOf(LTR, 1940, 1950)).toEqual({ x: 100, width: 100 });
  });

  it('extendRectTowardLater grows left under RTL, right under LTR', () => {
    const rect = { x: 500, width: 100 };
    expect(extendRectTowardLater(RTL, rect, 160)).toEqual({ x: 440, width: 160 });
    expect(extendRectTowardLater(LTR, rect, 160)).toEqual({ x: 500, width: 160 });
    expect(extendRectTowardLater(RTL, rect, 80)).toEqual(rect); // never shrinks
  });
});

describe('panWindowByPx — grab semantics', () => {
  it('keeps the time under the pointer under the pointer (RTL and LTR)', () => {
    for (const scale of [RTL, LTR]) {
      const x0 = 300;
      const t0 = tOf(scale, x0);
      const dx = 84;
      const panned = panWindowByPx(scale.window, scale.widthPx, scale.dir, dx);
      const after: Scale = { ...scale, window: panned };
      expect(tOf(after, x0 + dx)).toBeCloseTo(t0, 9);
      expect(spanYears(panned)).toBeCloseTo(70, 9);
    }
  });

  it('RTL: dragging rightward moves the window forward in time', () => {
    const panned = panWindowByPx(WINDOW, 700, 'rtl', 70);
    expect(panned.start).toBeCloseTo(1937);
    expect(panned.end).toBeCloseTo(2007);
  });

  it('LTR: dragging rightward moves the window backward in time', () => {
    const panned = panWindowByPx(WINDOW, 700, 'ltr', 70);
    expect(panned.start).toBeCloseTo(1923);
  });
});

describe('zoomWindowAtPx — focal point preservation', () => {
  it('halving the span keeps the anchor time fixed at the anchor pixel', () => {
    for (const scale of [RTL, LTR]) {
      const anchorPx = 490;
      const anchorT = tOf(scale, anchorPx);
      const zoomed = zoomWindowAtPx(scale.window, scale.widthPx, scale.dir, 0.5, anchorPx);
      expect(spanYears(zoomed)).toBeCloseTo(35, 9);
      expect(tOf({ ...scale, window: zoomed }, anchorPx)).toBeCloseTo(anchorT, 9);
    }
  });

  it('zooming out at the left edge keeps that edge time fixed', () => {
    const zoomed = zoomWindowAtPx(WINDOW, 700, 'rtl', 2, 0);
    expect(tOf({ window: zoomed, widthPx: 700, dir: 'rtl' }, 0)).toBeCloseTo(2000, 9);
    expect(spanYears(zoomed)).toBeCloseTo(140, 9);
  });
});

describe('clampWindow', () => {
  const limits: WindowLimits = { minTime: 1920, maxTime: 2010, minSpan: 1, maxSpan: 80 };

  it('passes through an in-bounds window untouched', () => {
    expect(clampWindow({ start: 1940, end: 1960 }, limits)).toEqual({ start: 1940, end: 1960 });
  });

  it('clamps span to minSpan around the center', () => {
    const c = clampWindow({ start: 1950.4, end: 1950.6 }, limits);
    expect(spanYears(c)).toBeCloseTo(1);
    expect((c.start + c.end) / 2).toBeCloseTo(1950.5);
  });

  it('clamps span to maxSpan and to the bounds extent', () => {
    const c = clampWindow({ start: 1800, end: 2100 }, limits);
    expect(spanYears(c)).toBeCloseTo(80);
    expect(c.start).toBeGreaterThanOrEqual(limits.minTime);
    expect(c.end).toBeLessThanOrEqual(limits.maxTime);
  });

  it('shifts (not shrinks) a window that slid past the bounds', () => {
    expect(clampWindow({ start: 1900, end: 1950 }, limits)).toEqual({ start: 1920, end: 1970 });
    expect(clampWindow({ start: 1990, end: 2040 }, limits)).toEqual({ start: 1960, end: 2010 });
  });
});

describe('panOffsetPx — transform-only pan', () => {
  it('translates a laid-out layer so the live window lines up (both dirs)', () => {
    const layout: TimeWindow = { start: 1930, end: 2000 };
    const live: TimeWindow = { start: 1935, end: 2005 };
    // RTL: moving forward in time shifts content rightward (+x).
    expect(panOffsetPx(layout, live, 700, 'rtl')).toBeCloseTo(50);
    expect(panOffsetPx(layout, live, 700, 'ltr')).toBeCloseTo(-50);
    // The offset must equal the x-shift of any concrete item.
    for (const dir of ['rtl', 'ltr'] as const) {
      const t = 1967;
      const xLayout = xOf({ window: layout, widthPx: 700, dir }, t);
      const xLive = xOf({ window: live, widthPx: 700, dir }, t);
      expect(xLayout + panOffsetPx(layout, live, 700, dir)).toBeCloseTo(xLive, 9);
    }
  });
});

describe('spansIntersect', () => {
  it('detects overlap and rejects mere adjacency', () => {
    expect(spansIntersect(1, 3, 2, 4)).toBe(true);
    expect(spansIntersect(1, 2, 2, 3)).toBe(false);
    expect(spansIntersect(5, 6, 1, 2)).toBe(false);
  });
});

describe('deriveViewportDefaults', () => {
  const options = { minSpan: 1 / 12, boundsPaddingFraction: 0.02, resetPaddingFraction: 0.05 };
  const contentRange = { startYear: 1930, endYear: 2000 };

  it('bounds cover data extent (incl. open ends) with padding; reset covers the content range', () => {
    const d = deriveViewportDefaults(
      [
        { start: 1886.5, end: 1973.9 },
        { start: 1954, end: null }, // alive → extends to openEndYear
      ],
      contentRange,
      2026.5,
      options,
    );
    expect(d.limits.minTime).toBeLessThan(1886.5);
    expect(d.limits.maxTime).toBeGreaterThan(2026.5);
    expect(d.limits.maxSpan).toBeCloseTo(d.limits.maxTime - d.limits.minTime);
    expect(d.defaultWindow.start).toBeCloseTo(1930 - 70 * 0.05);
    expect(d.defaultWindow.end).toBeCloseTo(2000 + 70 * 0.05);
    expect(d.window).toEqual(d.defaultWindow);
  });

  it('works with no items — config range alone', () => {
    const d = deriveViewportDefaults([], contentRange, 2026.5, options);
    expect(d.limits.minTime).toBeCloseTo(1930 - 70 * 0.02);
    expect(d.limits.maxTime).toBeCloseTo(2000 + 70 * 0.02);
  });
});
