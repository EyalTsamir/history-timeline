/**
 * Zoom altitudes and importance tiers (docs/spec/zoom.md) — the
 * replacement for the continuous semantic-zoom curve.
 *
 * The viewport window stays a free {start,end} (URLs and era jumps produce
 * arbitrary spans); the ALTITUDE is derived from the span, and every zoom
 * gesture steps between the three canonical spans instead of scaling freely.
 * Importance maps to a TIER (visual weight); each altitude has a label floor
 * deciding which items get a labeled mark vs an always-present dot. Nothing
 * ever leaves the screen because of zoom — tuning is editing these numbers.
 */

export type Altitude = 'century' | 'decade' | 'year';

/** Ordered high → low (wide → narrow). */
export const ALTITUDES: readonly Altitude[] = ['century', 'decade', 'year'];

export const ALTITUDE_CONFIG = {
  /** Spans (years) at or above this read as the century altitude… */
  centuryMinSpan: 30,
  /** …and spans at or above this (but below century) as the decade altitude. */
  decadeMinSpan: 6,
  /** Canonical spans gestures step to. Century's canonical span is the
   *  default (full-range) window, which depends on data — passed by callers. */
  decadeSpan: 12,
  yearSpan: 2,
} as const;

export function altitudeOf(spanYears: number): Altitude {
  if (spanYears >= ALTITUDE_CONFIG.centuryMinSpan) return 'century';
  if (spanYears >= ALTITUDE_CONFIG.decadeMinSpan) return 'decade';
  return 'year';
}

/** The next altitude in `direction` (+1 dives in, −1 climbs out); clamped. */
export function stepAltitude(altitude: Altitude, direction: 1 | -1): Altitude {
  const i = ALTITUDES.indexOf(altitude) + direction;
  return ALTITUDES[Math.max(0, Math.min(ALTITUDES.length - 1, i))]!;
}

/** The span (years) a zoom gesture lands on for `altitude`. */
export function canonicalSpan(altitude: Altitude, defaultSpanYears: number): number {
  if (altitude === 'century') return defaultSpanYears;
  if (altitude === 'decade') return ALTITUDE_CONFIG.decadeSpan;
  return ALTITUDE_CONFIG.yearSpan;
}

// ---------------------------------------------------------------------------
// Importance tiers (visual weight) and per-altitude label floors
// ---------------------------------------------------------------------------

export type ImportanceTier = 'seal' | 'anchor' | 'major' | 'minor' | 'background';

/** Tier bounds — lower inclusive importance per tier, highest first. */
export const TIER_FLOORS: readonly { tier: ImportanceTier; min: number }[] = [
  { tier: 'seal', min: 95 },
  { tier: 'anchor', min: 80 },
  { tier: 'major', min: 55 },
  { tier: 'minor', min: 30 },
  { tier: 'background', min: 0 },
];

export function tierOf(importance: number): ImportanceTier {
  for (const { tier, min } of TIER_FLOORS) {
    if (importance >= min) return tier;
  }
  return 'background';
}

/**
 * Minimum importance that earns a LABELED mark at each altitude; everything
 * below stays a dot (docs/spec/rendering.md — presence is never zoom-dependent).
 */
export const LABEL_FLOORS: Record<Altitude, number> = {
  // Century names the major national events (importance ≥ 70 per the rubric),
  // not only the 9 anchors ≥ 80 — the overview should read rich, not bare
  // (decision D22 follow-up). Everything below stays an always-present dot.
  century: 70,
  decade: 45,
  year: 1,
};

export function isLabeled(importance: number, altitude: Altitude): boolean {
  return importance >= LABEL_FLOORS[altitude];
}
