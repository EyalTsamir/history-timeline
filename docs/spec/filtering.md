# Filtering

## Filter state

```ts
interface FilterState {
  regionIds: Set<EntityId>;         // empty set = no filter (all pass)
  personCategoryIds: Set<EntityId>; // empty = all
  contentTypes: Set<ContentType>;   // 'event' | 'person' | 'biography' | 'autobiography' | 'historical-novel'
  minImportance: number;            // 0 = off
}
```

Held in `filterStore` (Zustand), mirrored into the URL hash for shareable links
(`r`/`pc`/`ct`/`imp` params — `src/app/urlState.ts`, restored via the store's
`replaceAll` action), rendered by `FilterBar` as chip groups in Hebrew (אזור ·
קטגוריית אישים · סוג תוכן · חשיבות).

## Combination semantics

**OR within a dimension, AND across dimensions.** Selecting "מנהיגים" and
"סופרים" shows people in either category; adding region "ירושלים" then requires
the region too.

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
| Region | all kinds | Item passes if any of its `regionIds` is the selected region **or a descendant of it** (region hierarchy from [domain](domain.md); ancestor expansion precomputed at load into a flat lookup). |
| Person category | people only | Non-person items are **unaffected** by this dimension (it narrows people, it doesn't hide events). |
| Content type | all kinds | `event` matches events; `person` matches people; the work types match works by `workType`. |
| Min importance | all kinds | The user's floor on importance. It **removes** items entirely, upstream of layout — distinct from the altitude label budgets, which only decide labeled-mark vs. dot ([zoom](zoom.md)). |

The "unaffected" rule for person-category deserves emphasis because it's the one
non-obvious semantic: filters scope *within* the kinds they describe. If the
user wants only people, that's the content-type dimension's job. This keeps
every combination meaningful and avoids the trap where selecting a person
category empties the events inexplicably.

## Execution

- `passes()` is a pure predicate in `domain/filters.ts`, unit-tested over a combinatorial table ([testing](testing.md)).
- Filtering runs over the normalized, time-sorted `TimelineItem[]` via a memoized selector keyed on `FilterState`; at MVP scale this is a sub-millisecond array pass. The scaling path (bitmask precomputation, worker offload, server-side filtering) is in [performance](performance.md).
- Filter changes feed the timeline through the same pipeline as zoom (a new filtered set → relayout) and **never touch the viewport** — the user's period and zoom are preserved. Items appear/disappear instantly on filter change (there is no fade transition — under D16 nothing enters or leaves existence by zoom, so no ramp was needed here either).
- An active-filter summary line shows the result count ("מוצגים 34 מתוך 120 פריטים") in an `aria-live` region with a one-tap "נקה הכול".
