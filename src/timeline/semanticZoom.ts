/**
 * Semantic zoom (docs/05-semantic-zoom.md): visibility is a pure function of
 * the viewport scale. threshold() interpolates the configured curve;
 * composition with the user's importance filter is max(), so the user can
 * only raise the bar and zoom keeps decluttering underneath (docs/07).
 */
import type { SemanticZoomConfig, ZoomCurvePoint } from './semanticZoom.config';

/**
 * Minimum importance visible at `yearsPer1000px`. Piecewise-linear in
 * log(yearsPer1000px) between control points, clamped outside the curve,
 * then shifted by thresholdBias and clamped to [0, 100].
 */
export function zoomThreshold(yearsPer1000px: number, config: SemanticZoomConfig): number {
  const curve = config.curve;
  const first = curve[0];
  if (first === undefined) return 0;
  const last = curve[curve.length - 1]!;

  let raw: number;
  if (yearsPer1000px >= first.yearsPer1000px) {
    raw = first.minImportance;
  } else if (yearsPer1000px <= last.yearsPer1000px) {
    raw = last.minImportance;
  } else {
    raw = last.minImportance;
    for (let i = 0; i < curve.length - 1; i++) {
      const hi = curve[i]!; // wider view (larger yearsPer1000px)
      const lo = curve[i + 1]!;
      if (yearsPer1000px <= hi.yearsPer1000px && yearsPer1000px >= lo.yearsPer1000px) {
        raw = interpolateLog(yearsPer1000px, hi, lo);
        break;
      }
    }
  }
  return Math.min(100, Math.max(0, raw + config.thresholdBias));
}

function interpolateLog(x: number, hi: ZoomCurvePoint, lo: ZoomCurvePoint): number {
  const logX = Math.log(x);
  const logHi = Math.log(hi.yearsPer1000px);
  const logLo = Math.log(lo.yearsPer1000px);
  const t = (logX - logHi) / (logLo - logHi); // 0 at hi → 1 at lo
  return hi.minImportance + t * (lo.minImportance - hi.minImportance);
}

/**
 * The effective visibility floor: the zoom threshold combined with the
 * user's explicit minimum-importance filter (docs/07 — max, not sum).
 */
export function effectiveMinImportance(threshold: number, filterMinImportance: number): number {
  return Math.max(threshold, filterMinImportance);
}

/**
 * Fade ramp (docs/05): 1 at/above the floor, falling linearly to 0 across
 * `fadeBand` points below it. Items at 0 are not rendered at all.
 */
export function importanceOpacity(importance: number, floor: number, fadeBand: number): number {
  if (importance >= floor) return 1;
  if (fadeBand <= 0) return 0;
  const depth = floor - importance;
  return Math.max(0, 1 - depth / fadeBand);
}
