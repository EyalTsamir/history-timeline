/**
 * Viewport culling (docs/14 §4, docs/10): nothing is hidden by zoom anymore —
 * the altitude label floors only decide labeled mark vs dot — so the only
 * visibility question left is virtualization: keep items intersecting the
 * buffered window. Pure; order-preserving over the time-sorted input.
 */
import type { TimelineItem } from '../domain/timelineItem';
import type { TimeWindow } from './scale';
import { spanYears, spansIntersect } from './scale';

/**
 * An item's layout end on the axis. Open-ended spans (living people) borrow
 * `openEndYear` (≈ today) as a VISUAL endpoint only — the item itself keeps
 * end: null, and nothing downstream may present this as a real end date.
 */
export function layoutEnd(item: TimelineItem, openEndYear: number): number {
  return item.end ?? Math.max(item.start, openEndYear);
}

/**
 * Virtualization cull: keep items intersecting the window ± bufferScreens
 * screens, so pan-by-transform has content ready at both edges (docs/10).
 */
export function cullToWindow(
  items: readonly TimelineItem[],
  window: TimeWindow,
  bufferScreens: number,
  openEndYear: number,
): TimelineItem[] {
  const buffer = spanYears(window) * bufferScreens;
  const lo = window.start - buffer;
  const hi = window.end + buffer;
  return items.filter((item) => spansIntersect(item.start, layoutEnd(item, openEndYear), lo, hi));
}
