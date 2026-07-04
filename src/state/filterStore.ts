/**
 * Filter selections (docs/07-filtering.md). UI state only — predicate logic
 * lives in domain/filters.ts. Set updates are immutable (new Set per toggle)
 * so selectors can rely on reference equality. No persistence or URL sync
 * yet (next stage).
 */
import { create } from 'zustand';
import type { EntityId } from '../domain/entities';
import { EMPTY_FILTER_STATE } from '../domain/filters';
import type { FilterState } from '../domain/filters';
import type { ContentType } from '../domain/timelineItem';

export interface FilterActions {
  toggleRegion(id: EntityId): void;
  togglePersonCategory(id: EntityId): void;
  toggleContentType(ct: ContentType): void;
  setMinImportance(n: number): void;
  clearAll(): void;
  /** Bulk restore (URL-hash state, docs/07) — replaces every dimension at once. */
  replaceAll(next: FilterState): void;
}

export type FilterStore = FilterState & FilterActions;

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/* Actions are created once at store init — stable references forever. */
export const useFilterStore = create<FilterStore>()((set) => ({
  ...EMPTY_FILTER_STATE,
  toggleRegion: (id) => set((s) => ({ regionIds: toggled(s.regionIds, id) })),
  togglePersonCategory: (id) => set((s) => ({ personCategoryIds: toggled(s.personCategoryIds, id) })),
  toggleContentType: (ct) => set((s) => ({ contentTypes: toggled(s.contentTypes, ct) })),
  setMinImportance: (n) => set({ minImportance: n }),
  clearAll: () => set({ ...EMPTY_FILTER_STATE }),
  replaceAll: (next) =>
    set({
      regionIds: new Set(next.regionIds),
      personCategoryIds: new Set(next.personCategoryIds),
      contentTypes: new Set(next.contentTypes),
      minImportance: next.minImportance,
    }),
}));

/**
 * Selector for the plain FilterState slice to hand to domain predicates.
 * Identity function (the store state IS a FilterState superset), so the
 * reference is stable across renders until the state actually changes.
 */
export const selectFilterState = (s: FilterStore): FilterState => s;
