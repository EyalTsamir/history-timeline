/**
 * Combined-filter logic (docs/spec/filtering.md).
 * Semantics: OR within a dimension, AND across dimensions.
 * An empty set means "dimension inactive — everything passes".
 * Person-category narrows PEOPLE only; other kinds are unaffected by it.
 */
import type { EntityId } from './entities';
import type { ContentType, TimelineItem } from './timelineItem';

export interface FilterState {
  personCategoryIds: ReadonlySet<EntityId>;
  contentTypes: ReadonlySet<ContentType>;
  /** User-raised floor; combines with semantic zoom as max(threshold, this). */
  minImportance: number;
}

export const EMPTY_FILTER_STATE: FilterState = {
  personCategoryIds: new Set(),
  contentTypes: new Set(),
  minImportance: 0,
};

export function isFilterActive(f: FilterState): boolean {
  return f.personCategoryIds.size > 0 || f.contentTypes.size > 0 || f.minImportance > 0;
}

function intersects(itemIds: readonly EntityId[], selected: ReadonlySet<EntityId>): boolean {
  return itemIds.some((id) => selected.has(id));
}

export function passesFilters(item: TimelineItem, f: FilterState): boolean {
  if (f.personCategoryIds.size > 0 && item.kind === 'person' && !intersects(item.categoryIds, f.personCategoryIds)) {
    return false;
  }
  if (f.contentTypes.size > 0 && !f.contentTypes.has(item.contentType)) return false;
  if (item.importance < f.minImportance) return false;
  return true;
}

/** Filter a normalized item list. */
export function applyFilters(items: readonly TimelineItem[], f: FilterState): TimelineItem[] {
  return items.filter((item) => passesFilters(item, f));
}
