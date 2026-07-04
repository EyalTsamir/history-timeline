/**
 * The semantic-zoom curve (docs/05-semantic-zoom.md) — the single, central
 * place where "how zoomed in" maps to "how important an item must be".
 *
 * Control points pair a viewport scale (years per 1000 CSS px — screen-size
 * independent by construction) with the minimum importance visible at that
 * scale. Between points the threshold interpolates linearly in
 * log(yearsPer1000px) space; outside the curve it clamps. There are no fixed
 * zoom states — tuning the experience is editing these numbers, not code.
 */

export interface ZoomCurvePoint {
  yearsPer1000px: number;
  minImportance: number;
}

export interface SemanticZoomConfig {
  /** Must be sorted by descending yearsPer1000px (widest view first). */
  curve: readonly ZoomCurvePoint[];
  /**
   * Additive threshold adjustment (docs/05 "mobileThresholdBias") — a taste
   * knob for denser/laxer screens. 0 = trust years-per-pixel normalization.
   */
  thresholdBias: number;
  /**
   * Items within this many importance points BELOW the threshold render
   * faded instead of popping in/out — a continuous ramp, so jittery pinch
   * gestures cannot strobe items (docs/05 behavior details).
   */
  fadeBand: number;
}

export const SEMANTIC_ZOOM: SemanticZoomConfig = {
  curve: [
    { yearsPer1000px: 80, minImportance: 85 }, // whole century in view → only the defining events
    { yearsPer1000px: 30, minImportance: 65 },
    { yearsPer1000px: 10, minImportance: 45 },
    { yearsPer1000px: 2, minImportance: 20 },
    { yearsPer1000px: 0.5, minImportance: 0 }, // ~6 months per screen → everything
  ],
  thresholdBias: 0,
  fadeBand: 3,
};
