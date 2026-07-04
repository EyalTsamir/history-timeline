# 07 — Filtering

## Filter state

```ts
interface FilterState {
  regionIds: Set<EntityId>;         // empty set = no filter (all pass)
  personCategoryIds: Set<EntityId>; // empty = all
  contentTypes: Set<ContentType>;   // 'event' | 'person' | 'biography' | 'autobiography' | 'historical-novel'
  minImportance: number;            // 0 = off
}
```

Held in `filterStore` (Zustand), mirrored into the URL hash for shareable links, rendered by `FilterBar` as chip groups in Hebrew (אזור · קטגוריית אישים · סוג תוכן · חשיבות).

## Combination semantics

**OR within a dimension, AND across dimensions.** Selecting "מנהיגים" and "סופרים" shows people in either category; adding region "ירושלים" then requires the region too.

```ts
function passes(item: TimelineItem, f: FilterState): boolean {
  return matchesRegion(item, f.regionIds)          // OR within
      && matchesCategory(item, f.personCategoryIds)
      && matchesContentType(item, f.contentTypes)
      && item.importance >= f.minImportance;        // AND across
}
```

Dimension rules:

| Dimension | Applies to | Semantics |
|---|---|---|
| Region | all kinds | Item passes if any of its `regionIds` is the selected region **or a descendant of it** (region hierarchy from [03](03-domain-model.md); ancestor expansion precomputed at load into a flat lookup). |
| Person category | people only | Non-person items are **unaffected** by this dimension (it narrows people, it doesn't hide events). |
| Content type | all kinds | `event` matches events; `person` matches people; the three work types match works by `workType`. |
| Min importance | all kinds | Combines with semantic zoom as `max(zoomThreshold, minImportance)` — the user can only *raise* the bar; zoom keeps decluttering underneath ([05](05-semantic-zoom.md)). |

The "unaffected" rule for person-category deserves emphasis because it's the one non-obvious semantic: filters scope *within* the kinds they describe. If the user wants only people, that's the content-type dimension's job. This keeps every combination meaningful and avoids the trap where selecting a person category empties the events band inexplicably.

## Execution

- `passes()` is a pure predicate in `domain/filters.ts`, unit-tested over a combinatorial table ([09](09-testing.md)).
- Filtering runs over the normalized, time-sorted `TimelineItem[]` via a memoized selector keyed on `FilterState`; at MVP scale this is a sub-millisecond array pass. The scaling path (bitmask precomputation, worker offload, server-side filtering) is in [10](10-performance.md).
- Filter changes animate items in/out with the same fade used by zoom thresholds — one visual language for "the visible set changed".
- An active-filter summary line shows result count ("מוצגים 34 פריטים") with a one-tap "נקה הכול".
