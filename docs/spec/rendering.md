# Rendering & presentation

## Design principles

The presentation follows five rules (decision D16 — they answer the six failures
of the first UI, recorded in [decisions.md](../decisions.md#why-the-first-ui-was-replaced-d16-diagnosis)):

1. **The whole range is always on screen** — a persistent century strip (minimap) with named, tinted eras and a brush marking the current window.
2. **No empty screens** — every filtered-in item is always present: a labeled mark if it clears the altitude's label floor, otherwise an always-present dot. Zoom adds *labels and detail*, never *existence*. Layout overflow degrades a label to a dot — never to a cluster chip, never to nothing.
3. **Importance = visual weight** — marker and label size derive from the importance tier ([zoom](zoom.md)), so hierarchy reads at a glance.
4. **Three fixed altitudes, not a continuous curve** — each altitude is a designed, predictable layout; gestures step between them; panning stays continuous.
5. **Each kind gets its own form** — events live on the canvas (sub-events fold into a parent **chapter**); people become the **cast strip** ("מי בתמונה"); works become the **period shelf** ("מדף התקופה"). People and works are no longer geometry on the axis (D7 preserved: shelf membership uses `coveredPeriod`).

## The pipeline

Everything the timeline shows is produced by a chain of pure functions (all in
`timeline/` + `domain/`, unit-testable without a DOM):

```
Dataset (validated entities)
  │ normalizeDataset()                  — once at load (domain/normalize.ts)
  ▼
TimelineItem[]                          — the single presentation format, sorted by start
  │ applyFilters(filterState)           filtering.md (domain/filters.ts)
  ▼  filtered items ─────────────┬───────────────────────────────┐
  │ cullToWindow(window, buffer) │ castForWindow / shelfForWindow │ (timeline/presence.ts)
  ▼ (timeline/visibility.ts)     │                                ▼
  │ layoutField(scale, altitude) │                        cast strip + period shelf
  ▼ (timeline/fieldLayout.ts)    │
FieldLayout { marks[], chapters[], dots[], rowsUsed }
  │
  ▼ React renders absolutely-positioned <button>s (decision D6, components/Timeline.tsx,
    EventMark.tsx, PresenceStrips.tsx, CenturyStrip.tsx)
```

React components never compute geometry; they draw the layout's output (vertical
position = a row index × a CSS row height; every horizontal value is a pixel from
`scale`). This keeps the door open to a Canvas/WebGL renderer later
([performance](performance.md)) — only the last step changes.

The viewport model behind `scale`: a **TimeWindow** `{ start, end }` in decimal
years lives in `state/viewportStore.ts` (with clamped `setWindow` as the single
mutation path); `Timeline.tsx` measures its pixel width and builds a `Scale {
window, widthPx, dir }` for the pure functions in `timeline/scale.ts`. During a
pan the item and ruler layers move by `translateX` only (the transform tracks the
live window at all times — it never freezes past the buffer); layout recomputes
when the gesture settles, the pan crosses the one-screen cull buffer, or the
altitude changes (rAF-throttled) — the transform-only rule from
[performance](performance.md). Because the field layout is a **pure function of
`(time, altitude, filters)`** (decision D17), that relayout is a pixel-perfect
no-op for everything on screen: a pan is a rigid translation, so the moment you
stop nothing shifts. Refilling from the buffer while suppressing item transitions
(`.instant`) keeps the relayout invisible; only the *settled* window feeds the
memoized pipeline.

## TimelineItem — the consistent presentation format

Every entity type converts to one shape; downstream code (filtering, layout,
rendering, detail panel) knows only this:

```ts
interface TimelineItem {
  id: EntityId;
  kind: 'event' | 'person' | 'work';
  contentType: 'event' | 'person' | WorkType;   // filter dimension, filtering.md
  title: string;                                 // Hebrew, already resolved from Text
  start: number;                                 // decimal year
  end: number | null;                            // null = open-ended (living person)
  isPoint: boolean;                              // point vs span
  importance: number;
  regionIds: EntityId[];
  categoryIds: EntityId[];                       // person OR event category ids (empty for works)
  parentId?: EntityId;                           // event hierarchy
  styleToken: string;                            // color/icon key from kind/category/workType
  detail: DetailPayload;                         // everything else the detail panel shows:
}                                                //   description, displayDate (precision-aware),
                                                 //   image, links, sources, publicationDate,
                                                 //   resolved author names, reverse-index ids…
```

Authoritative shape: `src/domain/timelineItem.ts`.

Normalization rules of note (`domain/normalize.ts`):

- **Work** → `start/end` from `coveredPeriod`, **not** `publicationDate` (decision D7). Publication date rides along in `detail` ("יצא לאור: 1987").
- **Person** → span from `lifespan`; open end (`null`) is preserved everywhere; the cast strip clamps it to "today" only for display.
- **Event** with no `end` → `isPoint: true`.

## The event field (desktop canvas)

`timeline/fieldLayout.ts` (`layoutField`) lays out **events only** into one
field — no kind bands:

- **Labeled events** pack into rows, greedy first-fit over label-aware pixel rects, **most important first**, up to the altitude's row budget. Collision boxes include a deterministic Hebrew label-width estimate, so what cannot collide on screen cannot collide in layout. An event that finds no row degrades to a **dot** (principle 2), never disappears.
- **Dots** live in a fixed dot band at the bottom, jittered into sub-rows by an id hash (deterministic), each a clickable/focusable button with its title as accessible name and tooltip.
- **Dot bucketing**: dots sit at their span's **true-time midpoint** (never viewport-clamped — D17) and merge, within a `(sub-row, ~5px)` cell keyed in **time** (`mid · pxPerYear`, so the merge grid rides the pan rather than the screen), into ONE element representing the bucket's weightiest item, with the merged count in its accessible name ("…ועוד N פריטים סמוכים") — the density texture stays honest while the DOM stays bounded by pixels, not by dataset size ([performance](performance.md) guardrail).
- **Chapters**: at decade/year altitude, an event whose children are in the filtered set and whose span is ≥ a minimum pixel width becomes a **chapter band** — a tinted container with a header and its children packed inside (up to 2 rows collapsed; "עוד N" expands the rest in place — component state, never a zoom change). At century altitude, or when too narrow, the parent renders as a normal mark and children as dots. A chapter that finds no room degrades to a plain mark + dots.
- **Era washes** render behind the field (`rectOf` per era), the era name shown when its on-screen width allows.
- The adaptive **ruler** and the pan gesture layer (transform fast-path, inertia, keyboard) are shared with the previous implementation.

### Event hierarchy

- A sub-event is shown only if its whole parent chain survived filtering — parents govern narrative context.
- The model allows arbitrary depth; MVP content uses ≤2 levels, and a chapter nests one container level (deeper levels flatten into their topmost in-set ancestor).

## Cast strip & period shelf

`timeline/presence.ts`: `castForWindow` (people whose lifespan intersects the
window) and `shelfForWindow` (works whose covered period intersects it), both
importance-sorted with a top-N + "עוד N" overflow toggle.

- Desktop renders both as slim horizontal strips under the canvas (`PresenceStrips.tsx`); mobile renders them as cards in the chronicle ([interaction](interaction.md)).
- Chips are buttons: selecting opens the existing detail panel/sheet. People and works keep full detail, relations, and sources; they simply stopped being bars on the axis.

## Century strip (minimap)

`components/CenturyStrip.tsx`, always visible above the canvas:

- Era zones (tinted, labeled when wide), flag dots for anchor events (importance ≥ 80), and a brush rectangle for the current window (hidden at century altitude, where the strip and canvas coincide).
- Drag the brush (or anywhere on the strip) to pan; click jumps the window center. The era chip row underneath jumps to an era's padded range.
- On mobile the strip tracks the chronicle scroll position and taps jump.

## <a name="rtl-time-axis"></a>RTL time axis

Per decision D5: **time flows right-to-left** — 1930 at the right edge, 2000 at
the left — matching the Hebrew reading direction of the entire UI.
Implementation is confined to the scale function:

```ts
// timeline/scale.ts — the ONLY place direction exists
xOf(t)   = dir === 'rtl' ? (viewRight − t) · pxPerYear : (t − viewLeft) · pxPerYear
tOf(x)   = inverse
```

Every other module works in time coordinates. Flipping `timeDirection: 'ltr'` in
config reverses the axis with no other changes.

## Axis & labels

- The time ruler (`timeline/ticks.ts`) renders adaptive gradations chosen so labeled ticks keep ≥72px spacing (≥96px for month labels): a year-step ladder (1000…1) that switches to calendar-aligned month steps (6/3/1) when a single year is wide enough. Year ticks are labeled "1948" (decades emphasized as majors); month ticks "מאי 1948". Gridlines extend up through the field.
- A **visible-range readout** near the controls always states the current window ("1947–1952", or "מרץ 1948 – יולי 1948" under 3 years) — the "where am I" answer required by [interaction](interaction.md).
- Labels anchor to their own geometry — a bar/chapter label to its box, an era name to the era's true centre — **not** to the span∩viewport (decision D17 revises D14): the old viewport clamp made a wide span's label ride the pan and snap back on settle. A span/era wider than the viewport therefore shows its label only near its own centre (the visible-range readout and century-strip minimap still name the current era); point items mark the center of the date's precision range with the label beside them, and packing reserves the label's estimated width so side labels can't collide.
