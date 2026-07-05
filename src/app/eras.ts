/**
 * Named era definitions (docs/14-ui-redesign.md §6) — the product's curated
 * chapter structure for the first content scope. Pure data + lookups; Hebrew
 * display names live in strings.he.ts under `eraNames`, keyed by era id, and
 * background tints are the `--era-<id>` tokens in styles/tokens.css.
 *
 * Boundaries are decimal years chosen on historiographic seams (the partition
 * vote, the armistice, the Six-Day War, the מהפך, the 1992 elections); the
 * display years are the human-readable integers shown in chips and headers.
 */
import type { TimeWindow } from '../timeline/scale';

export interface Era {
  /** Slug — joins strings.he.ts `eraNames` and the `--era-<id>` CSS token. */
  id: string;
  /** Decimal-year bounds; eras tile the content range, [start, end). */
  start: number;
  end: number;
  /** Human-readable bounds for chips/headers. */
  displayStart: number;
  displayEnd: number;
}

export const ERAS: readonly Era[] = [
  { id: 'mandate', start: 1930, end: 1947.9, displayStart: 1930, displayEnd: 1947 },
  { id: 'independence', start: 1947.9, end: 1949.55, displayStart: 1947, displayEnd: 1949 },
  { id: 'statebuilding', start: 1949.55, end: 1967.4, displayStart: 1949, displayEnd: 1967 },
  { id: 'wars', start: 1967.4, end: 1977.4, displayStart: 1967, displayEnd: 1977 },
  { id: 'upheaval', start: 1977.4, end: 1992.5, displayStart: 1977, displayEnd: 1992 },
  { id: 'oslo', start: 1992.5, end: 2000, displayStart: 1992, displayEnd: 2000 },
];

/** The era containing time t; times outside the tiled range clamp to the ends. */
export function eraAt(t: number): Era {
  const first = ERAS[0]!;
  if (t < first.end) return first;
  for (const era of ERAS) {
    if (t >= era.start && t < era.end) return era;
  }
  return ERAS[ERAS.length - 1]!;
}

/** An era's viewport window, padded so its edge events aren't glued to the frame. */
export function eraWindow(era: Era, paddingFraction = 0.08): TimeWindow {
  const pad = (era.end - era.start) * paddingFraction;
  return { start: era.start - pad, end: era.end + pad };
}
