# 06 — Timeline rendering & presentation format

## The pipeline

Everything the timeline shows is produced by a chain of pure functions (all in `timeline/` + `domain/`, all unit-testable without a DOM):

```
Dataset (validated entities)
  │ normalize()            — once at load
  ▼
TimelineItem[]             — the single presentation format, sorted by start
  │ applyFilters(filterState)          docs/07
  ▼
  │ applyVisibility(viewport)          threshold + density cap, docs/05
  ▼
  │ cullToViewport(viewport, buffer)   virtualization: items intersecting view ±1 screen
  ▼
  │ layoutLanes()                      assign vertical positions
  ▼
PositionedItem[] { item, x, width, laneY, opacity, clusterOf? }
  │
  ▼ React renders absolutely-positioned elements (decision D6)
```

React components never compute geometry; they draw `PositionedItem`s. This keeps the door open to a Canvas/WebGL renderer later ([10](10-performance.md)) — only the last step changes.

## TimelineItem — the consistent presentation format

Every entity type converts to one shape; downstream code (filtering, zoom, layout, rendering, detail panel) knows only this:

```ts
interface TimelineItem {
  id: EntityId;
  kind: 'event' | 'person' | 'work';
  contentType: 'event' | 'person' | WorkType;   // filter dimension, docs/07
  title: string;                                 // Hebrew, already resolved from Text
  start: number;                                 // decimal year
  end: number | null;                            // null = open-ended (living person)
  isPoint: boolean;                              // point vs span rendering
  importance: number;
  regionIds: EntityId[];
  categoryIds: EntityId[];                       // person OR event category ids (empty for works)
  parentId?: EntityId;                           // event hierarchy
  styleToken: string;                            // color/icon key from kind/category/workType
  detail: DetailPayload;                         // everything ELSE the detail panel shows:
}                                                //   description, displayDate (precision-aware),
                                                 //   image, links, publicationDate, resolved
                                                 //   author names, reverse-index ids…
```

Authoritative shape: `src/domain/timelineItem.ts` (this sketch omits detail-payload internals).

Normalization rules of note:

- **Work** → `start/end` from `coveredPeriod`, **not** `publicationDate` (decision D7). Publication date rides along in `detail` and is rendered in the panel ("יצא לאור: 1987").
- **Person** → span from `lifespan`; open end (`null`) renders as a fade-out edge clamped to "today".
- **Event** with no `end` → `isPoint: true`, rendered as a point marker with label.

## Lanes and vertical layout

The timeline is horizontally scrollable and vertically organized into fixed **bands** (top to bottom): **אירועים** (events), **אנשים** (people), **ספרים** (works). Within each band, `layoutLanes()` packs items into rows greedily:

```
sort items by start; for each item, place in the first row of its band whose
last item ends before item.start − minGapYears(scale); else open a new row
(up to the band's row budget — then the density cap from docs/05 has already
bounded the count, so overflow cannot occur unboundedly)
```

Interval packing is O(n log n) per relayout and runs only when the *visible set* changes (zoom/filter), not per animation frame — panning translates the already-positioned layer with a CSS transform.

Bands make scanning predictable (books never interleave with battles) and give each kind its own visual grammar: events = bars/points on the axis, people = thin lifespan lines with a name, works = compact "book chip" spans.

## Event hierarchy

- A **parent event** whose sub-events are below the current threshold renders as a single item.
- As the user zooms in past the sub-events' importance, the parent transitions to a **container band** (a tinted background span labeled at its edge) with its visible sub-events laid out inside it.
- A sub-event is visible only if `importance ≥ threshold` **and** its parent is visible — parents govern narrative context. The validator's "child less important than parent" warning ([05](05-semantic-zoom.md)) makes this unfold naturally.
- The model allows arbitrary depth; MVP content uses ≤2 levels, and rendering nests one container level (deeper levels flatten into their topmost visible ancestor's container until a product need arises).

## <a name="rtl-time-axis"></a>RTL time axis

Per decision D5: **time flows right-to-left** — 1930 at the right edge, 2000 at the left — matching the Hebrew reading direction of the entire UI. Implementation is confined to the scale function:

```ts
// timeline/scale.ts — the ONLY place direction exists
xOf(t)   = dir === 'rtl' ? (viewRight − t) · pxPerYear : (t − viewLeft) · pxPerYear
tOf(x)   = inverse
```

Every other module works in time coordinates. Flipping `timeDirection: 'ltr'` in config reverses the axis with no other changes — this decision is deliberately cheap to revisit after the first prototype is playable.

## Axis & labels

- A time ruler renders adaptive gradations (decades → years → months) chosen from the same `yearsPer1000px` scale, with Hebrew labels ("שנות ה-50", "1948", "מאי 1948").
- Item labels truncate with ellipsis at narrow widths; point items place labels alternating above/below to reduce collisions.
