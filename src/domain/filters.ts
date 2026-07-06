/**
 * Combined-filter logic (docs/spec/filtering.md).
 * Semantics: OR within a dimension, AND across dimensions.
 * An empty set means "dimension inactive — everything passes".
 * Person-category narrows PEOPLE only; other kinds are unaffected by it.
 */
import type { EntityId } from './entities';
import type { ContentType, TimelineItem } from './timelineItem';

export interface FilterState {
  regionIds: ReadonlySet<EntityId>;
  personCategoryIds: ReadonlySet<EntityId>;
  contentTypes: ReadonlySet<ContentType>;
  /** User-raised floor; combines with semantic zoom as max(threshold, this). */
  minImportance: number;
}

export const EMPTY_FILTER_STATE: FilterState = {
  regionIds: new Set(),
  personCategoryIds: new Set(),
  contentTypes: new Set(),
  minImportance: 0,
};

export function isFilterActive(f: FilterState): boolean {
  return (
    f.regionIds.size > 0 || f.personCategoryIds.size > 0 || f.contentTypes.size > 0 || f.minImportance > 0
  );
}

/**
 * Expand selected regions through the hierarchy: selecting a parent includes
 * all its descendants. `regionDescendants` is the precomputed
 * region → [self, …descendants] index from the dataset.
 */
export function expandSelectedRegions(
  selected: ReadonlySet<EntityId>,
  regionDescendants: Record<string, EntityId[] | undefined>,
): ReadonlySet<EntityId> {
  const expanded = new Set<EntityId>();
  for (const id of selected) {
    for (const d of regionDescendants[id] ?? [id]) expanded.add(d);
  }
  return expanded;
}

function intersects(itemIds: readonly EntityId[], selected: ReadonlySet<EntityId>): boolean {
  return itemIds.some((id) => selected.has(id));
}

/** Pure predicate; `expandedRegionIds` must already be hierarchy-expanded. */
export function passesFilters(
  item: TimelineItem,
  f: FilterState,
  expandedRegionIds: ReadonlySet<EntityId>,
): boolean {
  if (f.regionIds.size > 0 && !intersects(item.regionIds, expandedRegionIds)) return false;
  if (f.personCategoryIds.size > 0 && item.kind === 'person' && !intersects(item.categoryIds, f.personCategoryIds)) {
    return false;
  }
  if (f.contentTypes.size > 0 && !f.contentTypes.has(item.contentType)) return false;
  if (item.importance < f.minImportance) return false;
  return true;
}

/** Filter a normalized item list (expands the region selection once). */
export function applyFilters(
  items: readonly TimelineItem[],
  f: FilterState,
  regionDescendants: Record<string, EntityId[] | undefined>,
): TimelineItem[] {
  const expanded = expandSelectedRegions(f.regionIds, regionDescendants);
  return items.filter((item) => passesFilters(item, f, expanded));
}
