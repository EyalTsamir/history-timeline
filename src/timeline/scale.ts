/**
 * The viewport/scale model — the ONLY place the time axis direction exists
 * (decision D5, docs/06-timeline-rendering.md#rtl-time-axis).
 *
 * Coordinate systems:
 * - Historical time: decimal years (domain/dates.ts).
 * - TimeWindow: the visible date range { start < end } in decimal years.
 * - Pixels: physical CSS px measured from the LEFT edge of the viewport
 *   (CSS absolute positioning is physical; direction lives here, nowhere else).
 *
 * With dir 'rtl' the past is on the RIGHT: x=0 shows window.end (latest),
 * x=width shows window.start (earliest). With 'ltr' the mapping reverses.
 * Every function is pure; gesture handlers compose them.
 */

export type TimeDirection = 'rtl' | 'ltr';

/** The visible date range in decimal years. Invariant: start < end. */
export interface TimeWindow {
  readonly start: number;
  readonly end: number;
}

/** A time window projected onto a concrete pixel width and direction. */
export interface Scale {
  readonly window: TimeWindow;
  readonly widthPx: number;
  readonly dir: TimeDirection;
}

/** Pan/zoom limits, derived from data + config at init (state/viewportStore). */
export interface WindowLimits {
  /** The window may never leave [minTime, maxTime]. */
  readonly minTime: number;
  readonly maxTime: number;
  /** Narrowest allowed span (max zoom-in), e.g. 1/12 ≈ one month per screen. */
  readonly minSpan: number;
  /** Widest allowed span (max zoom-out). */
  readonly maxSpan: number;
}

export function spanYears(window: TimeWindow): number {
  return window.end - window.start;
}

export function pxPerYear(scale: Scale): number {
  return scale.widthPx / spanYears(scale.window);
}

/** The semantic-zoom scale unit (docs/05): years per 1000 CSS pixels. */
export function yearsPer1000px(window: TimeWindow, widthPx: number): number {
  return (spanYears(window) / widthPx) * 1000;
}

/** Time → physical x (px from the left viewport edge). */
export function xOf(scale: Scale, t: number): number {
  return scale.dir === 'rtl'
    ? (scale.window.end - t) * pxPerYear(scale)
    : (t - scale.window.start) * pxPerYear(scale);
}

/** Physical x → time. Inverse of xOf. */
export function tOf(scale: Scale, x: number): number {
  return scale.dir === 'rtl'
    ? scale.window.end - x / pxPerYear(scale)
    : scale.window.start + x / pxPerYear(scale);
}

/** A horizontal pixel rectangle: `x` is the LEFT edge, whatever the direction. */
export interface PxRect {
  x: number;
  width: number;
}

/**
 * Project a time span onto pixels. The rect's left edge is the span's later
 * end under 'rtl' and its earlier end under 'ltr' — callers never branch.
 */
export function rectOf(scale: Scale, start: number, end: number): PxRect {
  const width = (end - start) * pxPerYear(scale);
  const x = scale.dir === 'rtl' ? xOf(scale, end) : xOf(scale, start);
  return { x, width };
}

/**
 * Widen a span's rect to `allocWidth` px, growing toward the LATER-time side
 * (physical left under 'rtl', right under 'ltr') — where start-anchored
 * labels naturally overflow. The original edge at the span's start stays put.
 */
export function extendRectTowardLater(scale: Scale, rect: PxRect, allocWidth: number): PxRect {
  if (allocWidth <= rect.width) return rect;
  return scale.dir === 'rtl'
    ? { x: rect.x - (allocWidth - rect.width), width: allocWidth }
    : { x: rect.x, width: allocWidth };
}

/**
 * Pan by a pointer movement of dxPx (positive = rightward): the time under
 * the pointer stays under it ("grab" semantics, docs/08).
 */
export function panWindowByPx(window: TimeWindow, widthPx: number, dir: TimeDirection, dxPx: number): TimeWindow {
  const dt = (dxPx / widthPx) * spanYears(window);
  const shift = dir === 'rtl' ? dt : -dt;
  return { start: window.start + shift, end: window.end + shift };
}

/**
 * Zoom by `factor` (newSpan = span × factor; <1 zooms in) keeping the time
 * under `anchorPx` exactly at `anchorPx` — the focal-point rule (docs/08).
 */
export function zoomWindowAtPx(
  window: TimeWindow,
  widthPx: number,
  dir: TimeDirection,
  factor: number,
  anchorPx: number,
): TimeWindow {
  const anchorT = tOf({ window, widthPx, dir }, anchorPx);
  const newSpan = spanYears(window) * factor;
  if (dir === 'rtl') {
    const end = anchorT + (anchorPx / widthPx) * newSpan;
    return { start: end - newSpan, end };
  }
  const start = anchorT - (anchorPx / widthPx) * newSpan;
  return { start, end: start + newSpan };
}

/**
 * Enforce limits: span clamped to [minSpan, maxSpan∩bounds], then the window
 * is shifted (not shrunk) back inside [minTime, maxTime]. Zoom clamping
 * preserves the window center so a blocked zoom doesn't jump.
 */
export function clampWindow(window: TimeWindow, limits: WindowLimits): TimeWindow {
  const boundsSpan = limits.maxTime - limits.minTime;
  const maxSpan = Math.min(limits.maxSpan, boundsSpan);
  const span = Math.min(Math.max(spanYears(window), limits.minSpan), maxSpan);

  let start = window.start;
  if (span !== spanYears(window)) {
    const center = (window.start + window.end) / 2;
    start = center - span / 2;
  }
  if (start < limits.minTime) start = limits.minTime;
  else if (start + span > limits.maxTime) start = limits.maxTime - span;
  return { start, end: start + span };
}

/**
 * translateX (px) that displays `live` on a layer laid out for `layout`.
 * Exact for pure pans (equal spans) — the transform-only gesture path
 * (docs/06 pipeline, docs/10). Zoom changes relayout instead.
 */
export function panOffsetPx(layout: TimeWindow, live: TimeWindow, widthPx: number, dir: TimeDirection): number {
  const ppy = widthPx / spanYears(live);
  return dir === 'rtl' ? (live.end - layout.end) * ppy : (layout.start - live.start) * ppy;
}

/** Do [aStart,aEnd) and [bStart,bEnd) overlap? Shared by culling and layout. */
export function spansIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Everything the viewport store needs at init, derived from data + config. */
export interface ViewportDefaults {
  window: TimeWindow;
  defaultWindow: TimeWindow;
  limits: WindowLimits;
}

/**
 * Derive initial window and pan/zoom limits from the actual data extent and
 * the configured content range — nothing hardcodes a period or geography.
 * Open-ended items extend the bounds to `openEndYear` (≈ today).
 */
export function deriveViewportDefaults(
  itemSpans: readonly { start: number; end: number | null }[],
  contentRange: { startYear: number; endYear: number },
  openEndYear: number,
  options: { minSpan: number; boundsPaddingFraction: number; resetPaddingFraction: number },
): ViewportDefaults {
  let dataMin = contentRange.startYear;
  let dataMax = contentRange.endYear;
  for (const s of itemSpans) {
    dataMin = Math.min(dataMin, s.start);
    dataMax = Math.max(dataMax, s.end ?? Math.max(s.start, openEndYear));
  }
  const boundsPad = (dataMax - dataMin) * options.boundsPaddingFraction;
  const minTime = dataMin - boundsPad;
  const maxTime = dataMax + boundsPad;

  const resetPad = (contentRange.endYear - contentRange.startYear) * options.resetPaddingFraction;
  const defaultWindow = clampWindow(
    { start: contentRange.startYear - resetPad, end: contentRange.endYear + resetPad },
    { minTime, maxTime, minSpan: options.minSpan, maxSpan: maxTime - minTime },
  );

  return {
    window: defaultWindow,
    defaultWindow,
    limits: { minTime, maxTime, minSpan: options.minSpan, maxSpan: maxTime - minTime },
  };
}
