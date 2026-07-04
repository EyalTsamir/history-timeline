# 06 — Timeline rendering & presentation format

## The pipeline

Everything the timeline shows is produced by a chain of pure functions (all in `timeline/` + `domain/`, all unit-testable without a DOM):

```
Dataset (validated entities)
  │ normalizeDataset()                    — once at load (domain/normalize.ts)
  ▼
TimelineItem[]                            — the single presentation format, sorted by start
  │ applyFilters(filterState)             docs/07 (domain/filters.ts)
  ▼
  │ applySemanticVisibility(floor, fade)  threshold + fade band + parent chain (timeline/visibility.ts)
  ▼
  │ cullToWindow(window, buffer)          virtualization: items intersecting view ±1 screen
  ▼
  │ layoutTimeline(scale, openEndYear)    bands, rows, containers, density cap (timeline/laneLayout.ts)
  ▼
TimelineLayout — per band: PositionedItem[] { item, opacity, x, width, spanX,
  spanWidth, markerX?, labelX, labelWidth, row, heightRows, isContainer,
  labelPlacement, openEnded } + PositionedCluster[] { ids, x, width, row, start, end }
  │
  ▼ React renders absolutely-positioned <button>s (decision D6, components/Timeline.tsx)
```

React components never compute geometry; they draw `PositionedItem`s (vertical position = `row ×` a CSS row height; every horizontal value is a pixel from the layout). This keeps the door open to a Canvas/WebGL renderer later ([10](10-performance.md)) — only the last step changes.

The viewport model behind `scale`: a **TimeWindow** `{ start, end }` in decimal years lives in `state/viewportStore.ts` (with clamped `setWindow` as the single mutation path); the component measures its pixel width and builds a `Scale { window, widthPx, dir }` for the pure functions in `timeline/scale.ts` (`xOf`/`tOf`/`rectOf`, pan/zoom/clamp ops). During a pan gesture the item and ruler layers move by `translateX` only (`panOffsetPx`); layout recomputes when the gesture settles (~120ms), the pan crosses the one-screen cull buffer, or the zoom changes (rAF-throttled) — the transform-only rule from [10](10-performance.md).

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

The timeline is horizontally pannable and vertically organized into fixed **bands** (top to bottom): **אירועים** (events), **אנשים** (people), **ספרים** (works). Within each band, `layoutTimeline()` packs units into rows greedily, first-fit, **in pixel space** — collision boxes include a deterministic Hebrew label-width estimate (`chars × 7px + 18`, clamped 40–200), so what cannot collide on screen cannot collide in layout:

```
build unit boxes (span rect + label allowance; containers = header + packed children);
apply the density cap (docs/05) by importance;
sort by (box.x, start, id) — deterministic in both axis directions;
place each unit in the lowest row range that is free over its box (+8px gap),
up to the band's row budget; row overflow → cluster chips (docs/05)
```

Packing runs only when the *visible set* changes (zoom settle / filter change), not per animation frame — panning translates the already-positioned layer with a CSS transform. Label placement is chosen per item: `inside` a wide bar/chip, `aside` a narrow bar or point marker, `above` a lifespan line; `inside`/`above` labels anchor to the span∩viewport box (decision D14). Open-ended lifespans use "today" as a **visual** endpoint only (`openEnded` flag → fade-out edge); the item's `end` stays `null` everywhere.

Bands make scanning predictable (books never interleave with battles) and give each kind its own visual grammar — a shape signal, never color alone (docs/08): events = filled bars with a strong start edge, points = diamond markers; people = thin lifespan lines with the name above; works = outlined "book chips" with a double-line spine.

## Event hierarchy

- A **parent event** whose sub-events are below the current threshold renders as a single item.
- As the user zooms in past the sub-events' importance, the parent transitions to a **container** (a tinted background block with a bold header bar) with its visible sub-events packed into up to `maxContainerChildRows` rows inside it; child overflow merges into one in-container cluster chip.
- A sub-event is visible only if `importance ≥ floor` **and** its whole parent chain survived filtering + threshold (`applySemanticVisibility` enforces this) — parents govern narrative context, so a filtered-out or below-threshold parent hides its descendants regardless of their own scores. The validator's "child less important than parent" warning ([05](05-semantic-zoom.md)) makes this unfold naturally.
- The model allows arbitrary depth; MVP content uses ≤2 levels, and rendering nests one container level (deeper levels flatten into their topmost visible ancestor's container until a product need arises).
- A container that cannot fit its rows in the band degrades gracefully to a plain single-row bar before falling into a cluster chip.

## <a name="rtl-time-axis"></a>RTL time axis

Per decision D5: **time flows right-to-left** — 1930 at the right edge, 2000 at the left — matching the Hebrew reading direction of the entire UI. Implementation is confined to the scale function:

```ts
// timeline/scale.ts — the ONLY place direction exists
xOf(t)   = dir === 'rtl' ? (viewRight − t) · pxPerYear : (t − viewLeft) · pxPerYear
tOf(x)   = inverse
```

Every other module works in time coordinates. Flipping `timeDirection: 'ltr'` in config reverses the axis with no other changes — this decision is deliberately cheap to revisit after the first prototype is playable.

## Axis & labels

- The time ruler (`timeline/ticks.ts`) renders adaptive gradations chosen so labeled ticks keep ≥72px spacing (≥96px for month labels): a year-step ladder (1000…1) that switches to calendar-aligned month steps (6/3/1) when a single year is wide enough. Year ticks are labeled "1948" (decades emphasized as majors); month ticks "מאי 1948" (January major). Gridlines extend up through the bands.
- A **visible-range readout** next to the zoom controls always states the current window ("1947–1952", or "מרץ 1948 – יולי 1948" under 3 years) — the "where am I" answer required by [08](08-interaction.md).
- Item labels truncate with ellipsis; point items render a diamond at the **center of the date's precision range** (a year-precision event marks mid-year; the displayed date stays "1948" — precision is never fabricated) with the label beside it, and lane packing reserves the label's estimated width so side labels can't collide.
