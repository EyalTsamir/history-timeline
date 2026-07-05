/**
 * Presence selectors (docs/14-ui-redesign.md §5): who and what belongs to the
 * visible window. People and works are no longer geometry on the axis — the
 * CAST is the people alive during the window ("מי בתמונה") and the SHELF is
 * the works whose covered period intersects it ("מדף התקופה", decision D7:
 * membership tests coveredPeriod, never publicationDate). Pure and
 * order-deterministic: importance desc, then earlier start, then id.
 */
import type { TimelineItem, TimelineKind } from '../domain/timelineItem';
import type { TimeWindow } from './scale';
import { spansIntersect } from './scale';
import { layoutEnd } from './visibility';

export interface Presence {
  /** The strip's collapsed view — the `topN` most important members. */
  top: TimelineItem[];
  /** Members beyond `top`, revealed by the "+N" toggle. */
  rest: TimelineItem[];
}

const EMPTY: Presence = { top: [], rest: [] };

function byWeight(a: TimelineItem, b: TimelineItem): number {
  return b.importance - a.importance || a.start - b.start || a.id.localeCompare(b.id);
}

function presenceOf(
  items: readonly TimelineItem[],
  kind: TimelineKind,
  window: TimeWindow,
  openEndYear: number,
  topN: number,
): Presence {
  const members = items
    .filter(
      (i) => i.kind === kind && spansIntersect(i.start, layoutEnd(i, openEndYear), window.start, window.end),
    )
    .sort(byWeight);
  if (members.length === 0) return EMPTY;
  return { top: members.slice(0, topN), rest: members.slice(topN) };
}

/** People whose lifespan intersects the window (open ends run to ≈ today). */
export function castForWindow(
  items: readonly TimelineItem[],
  window: TimeWindow,
  openEndYear: number,
  topN: number,
): Presence {
  return presenceOf(items, 'person', window, openEndYear, topN);
}

/** Works whose covered period intersects the window. */
export function shelfForWindow(
  items: readonly TimelineItem[],
  window: TimeWindow,
  openEndYear: number,
  topN: number,
): Presence {
  return presenceOf(items, 'work', window, openEndYear, topN);
}
