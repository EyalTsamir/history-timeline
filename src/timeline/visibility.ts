/**
 * Visible-set computation (docs/05, docs/06): after user filters, apply the
 * semantic-zoom floor (with its fade ramp), enforce the event parent-chain
 * rule, and cull to the buffered viewport. Pure; order-preserving over the
 * time-sorted input.
 */
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import { importanceOpacity } from './semanticZoom';
import type { TimeWindow } from './scale';
import { spanYears, spansIntersect } from './scale';

export interface VisibleItem {
  item: TimelineItem;
  /** (0,1] — items below the floor but inside the fade band render translucent. */
  opacity: number;
}

/**
 * An item's layout end on the axis. Open-ended spans (living people) borrow
 * `openEndYear` (≈ today) as a VISUAL endpoint only — the item itself keeps
 * end: null, and nothing downstream may present this as a real end date.
 */
export function layoutEnd(item: TimelineItem, openEndYear: number): number {
  return item.end ?? Math.max(item.start, openEndYear);
}

/**
 * Semantic-zoom pass: keep items whose importance clears the floor (or its
 * fade band), then drop any event whose parent chain is not fully kept —
 * sub-events never outlive their narrative context (docs/06#event-hierarchy).
 */
export function applySemanticVisibility(
  items: readonly TimelineItem[],
  floor: number,
  fadeBand: number,
): VisibleItem[] {
  const kept = new Map<EntityId, VisibleItem>();
  for (const item of items) {
    const opacity = importanceOpacity(item.importance, floor, fadeBand);
    if (opacity > 0) kept.set(item.id, { item, opacity });
  }

  const chainKept = (item: TimelineItem): boolean => {
    let parentId = item.parentId;
    let hops = 0;
    while (parentId !== undefined) {
      const parent = kept.get(parentId);
      if (parent === undefined) return false;
      parentId = parent.item.parentId;
      if (++hops > 32) return false; // cycles are build-rejected; stay safe anyway
    }
    return true;
  };

  const result: VisibleItem[] = [];
  for (const item of items) {
    const visible = kept.get(item.id);
    if (visible !== undefined && chainKept(item)) result.push(visible);
  }
  return result;
}

/**
 * Virtualization cull: keep items intersecting the window ± bufferScreens
 * screens, so pan-by-transform has content ready at both edges (docs/10).
 */
export function cullToWindow(
  visible: readonly VisibleItem[],
  window: TimeWindow,
  bufferScreens: number,
  openEndYear: number,
): VisibleItem[] {
  const buffer = spanYears(window) * bufferScreens;
  const lo = window.start - buffer;
  const hi = window.end + buffer;
  return visible.filter(({ item }) => spansIntersect(item.start, layoutEnd(item, openEndYear), lo, hi));
}
