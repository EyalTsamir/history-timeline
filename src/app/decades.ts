/**
 * Neutral decade periods (docs/spec/rendering.md) — the navigation frame for the
 * century strip and the "where am I" readout. Decades are non-editorial: they
 * are generated from the content range, carry no names beyond their year, and
 * replace the earlier curated eras (docs/decisions.md). Hebrew display labels
 * live in strings.he.ts under `decadeName`, keyed by the decade's start year.
 */
import { APP_CONFIG } from './config';
import type { TimeWindow } from '../timeline/scale';

export interface Decade {
  /** First year of the decade, e.g. 1950. Doubles as the label key. */
  startYear: number;
  /** Exclusive end year — the next decade's start, clamped to the content end. */
  endYear: number;
}

/** Decades tiling the content range [startYear, endYear), one per ten years. */
export const DECADES: readonly Decade[] = (() => {
  const { startYear, endYear } = APP_CONFIG.contentRange;
  const first = Math.floor(startYear / 10) * 10;
  const out: Decade[] = [];
  for (let y = first; y < endYear; y += 10) {
    out.push({ startYear: y, endYear: Math.min(y + 10, endYear) });
  }
  return out;
})();

/** The decade containing time t; times outside the tiled range clamp to the ends. */
export function decadeAt(t: number): Decade {
  const first = DECADES[0]!;
  if (t < first.endYear) return first;
  for (const decade of DECADES) {
    if (t >= decade.startYear && t < decade.endYear) return decade;
  }
  return DECADES[DECADES.length - 1]!;
}

/** A decade's viewport window, padded so its edge events aren't glued to the frame. */
export function decadeWindow(decade: Decade, paddingFraction = 0.08): TimeWindow {
  const pad = (decade.endYear - decade.startYear) * paddingFraction;
  return { start: decade.startYear - pad, end: decade.endYear + pad };
}
