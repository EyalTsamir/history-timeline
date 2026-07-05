# 14 — UI Redesign: from free pan-zoom canvas to a guided expedition

Status: **approved direction, implemented in this stage.** This document supersedes the
*presentation* parts of [05-semantic-zoom.md](05-semantic-zoom.md) (the continuous
threshold curve), [06-timeline-rendering.md](06-timeline-rendering.md) (three fixed
bands + cluster chips), and [08-interaction.md](08-interaction.md) (continuous wheel
zoom). The data model, content pipeline, stores, URL scheme, and the pure
time↔pixels scale (docs/03, 04, and `timeline/scale.ts`) are unchanged.

Concept pitch with mockups: the "מִמַּפָּה אינסופית — לְמַסָּע מודרך" artifact
(2026-07). The mock is the design intent; where implementation deviates, this
document is authoritative.

## 1. Why the first UI failed (diagnosis, verified against the running app)

1. **No orientation.** Free pan/zoom over an unbounded canvas with no minimap, no
   named periods, no destinations. The only "where am I" was the range readout.
2. **Empty first impression.** The importance curve showed 14 of 148 items at the
   default view; the works band rendered empty but kept its space.
3. **Stripe degeneration.** At any zoom below ~decade, person lifespans and work
   `coveredPeriod`s exceed the window, so two of three bands became identical
   edge-to-edge lines carrying no information.
4. **Importance decided existence, never appearance.** Importance 100 and 32 got
   the same 11px row.
5. **Continuous zoom silently swapped content.** Items popped in/out mid-gesture,
   row packing reshuffled positions, and "+N נוספים" chips hid the best content at
   the most important moments, teleporting the zoom when clicked.
6. **Mobile was a shrunken desktop.** Three bands in a ~450px box, truncated
   labels, horizontal time unusable at 390px.

## 2. The five principles

1. **The whole range is always on screen** — a century strip (minimap) with named,
   tinted eras and a brush marking the current window.
2. **No empty screens** — every filtered-in item is always present: labeled marks
   for the important, colored dots for the rest. Zoom adds *labels and detail*,
   never *existence*. Layout overflow degrades a label to a dot — never to a chip,
   never to nothing.
3. **Importance = visual weight** — marker and label size derive from an
   importance tier, so the century's hierarchy reads at a glance.
4. **Three fixed altitudes instead of a continuous curve** — century → decade →
   year. Each altitude is a designed, predictable layout; gestures step between
   them. Panning stays continuous.
5. **Each kind gets its own form** — events live on the canvas (sub-events fold
   into their parent's "chapter" band); people become the **cast strip** ("מי
   בתמונה"): who is active in the visible window; works become the **period
   shelf** ("מדף התקופה"): what documents the visible window. People and works are
   no longer geometry on the axis (D7 preserved: the shelf membership test uses
   `coveredPeriod`).

## 3. Altitudes

```
Altitude   derived from span      canonical span (gesture target)
century    span ≥ 30y             the default (full-range) window
decade     6y ≤ span < 30y        12y
year       span < 6y              2y
```

- `altitudeOf(spanYears)` is pure; the window itself remains a free
  `{start,end}` (era jumps and shared URLs produce arbitrary spans), so the URL
  scheme (`t`/`s`) is untouched and `viewportStore` is untouched.
- Zoom gestures (wheel, pinch, ±, double-click) **step** to the next altitude's
  canonical span, anchored at the pointer (double-click/wheel) or window center
  (buttons). Wheel/pinch deltas accumulate to a threshold before stepping, so a
  trackpad flick is one step, not five.
- `Home` / "טווח מלא" returns to century.

### Importance tiers (label/marker weight)

```
tier        importance    century      decade       year
seal        ≥ 95          seal mark    seal mark    seal mark
anchor      80–94         labeled      labeled      labeled
major       55–79         dot          labeled      labeled
minor       30–54         dot          labeled*     labeled
background  < 30          dot          dot          labeled
```

\* at decade altitude, minor items are labeled from importance ≥ 45; 30–44 stay
dots. Exact floors live in `timeline/altitude.ts` (`LABEL_FLOORS`) — tuning is
editing numbers, as with the old curve. The user's explicit minimum-importance
filter still *removes* items entirely (docs/07 semantics, upstream of layout).

## 4. The event field (desktop canvas)

`timeline/fieldLayout.ts` replaces `laneLayout.ts`:

- **One field, no kind bands.** Only events reach the canvas.
- Labeled events pack into rows (greedy first-fit over label-aware pixel rects,
  same technique as before), **most important first**; an item that finds no row
  renders as a dot instead (principle 2). Dot marks live in a fixed dot band at
  the bottom of the canvas, jittered into sub-rows by an id hash (deterministic),
  each clickable/focusable with its title as accessible name and tooltip.
- Dots sharing a (sub-row, ~5px) cell merge into ONE element representing the
  bucket's weightiest item, with the merged count in its accessible name and
  tooltip ("…ועוד N פריטים סמוכים") — the density texture stays honest while
  the DOM stays bounded by pixels, not by dataset size (docs/10 guardrail).
- **Chapters**: at decade/year altitude, an event whose children are in the
  filtered set and whose span is ≥ a minimum pixel width becomes a chapter band —
  a tinted container with a header and its children packed inside (up to 2 rows
  collapsed, "עוד N" expands all rows in place; expansion is component state,
  never a zoom change). At century altitude, or when too narrow, the parent
  renders as a normal mark and children as dots.
- Era washes render behind the field (`rectOf` per era), with the era name shown
  when its on-screen width allows.
- The ruler (adaptive ticks) and the pan gesture layer (transform fast-path,
  inertia, keyboard) are kept from the previous implementation.

## 5. Cast strip and period shelf

- `timeline/presence.ts`: `castForWindow` (people whose lifespan intersects the
  window) and `shelfForWindow` (works whose covered period intersects the
  window), both importance-sorted with a top-N + "+N" overflow toggle.
- Desktop renders both as slim horizontal strips under the canvas; mobile renders
  them as cards in the chronicle. *(Deviation from the mock: the shelf is a strip,
  not a floating panel docked over the canvas — no overlap management, same
  information.)*
- Chips are buttons: selecting opens the existing detail panel/sheet. People and
  works keep full detail, relations, and sources; they simply stopped being bars.

## 6. Century strip (minimap)

`components/CenturyStrip.tsx`, always visible above the canvas:

- Era zones (tinted, labeled when wide), flag dots for anchor events (importance
  ≥ 80), and a brush rectangle for the current window (hidden at century
  altitude, where the strip and canvas coincide).
- Drag the brush (or anywhere on the strip) to pan; click jumps the window
  center. The era chip row underneath jumps to an era's padded range.
- On mobile the strip tracks the chronicle scroll position and taps jump.

## 7. Mobile: the chronicle

Below the existing 900px breakpoint the canvas is replaced by a **vertical
feed** (`components/Chronicle.tsx`) — scroll *is* movement through time:

- Sections per era → year headings → items sorted by time.
- Card size follows tier: seal/anchor → large card with description; chapter →
  card listing children (expand in place); major/minor → compact row; background
  → pill row. Cast and shelf appear as cards per era section.
- No pinch, no horizontal gestures. The century strip on top shows position
  (scroll spy via IntersectionObserver) and jumps on tap.
- Viewport sync: the active year updates `viewportStore` (coarse window), so
  shared URLs work in both directions across form factors.

## 8. What was removed

- `semanticZoom.ts` + `semanticZoom.config.ts` (continuous curve, fade band) —
  replaced by `altitude.ts` tiers/floors. D4's *numeric importance* stands; the
  curve presentation is superseded (see D15). D13 (fade band) is obsolete: items
  never enter/leave existence, so there is nothing to fade.
- `laneLayout.ts` (bands, density cap, cluster chips) — replaced by
  `fieldLayout.ts`. Cluster chips are gone; overflow degrades to dots.
- Person/work marks on the axis — replaced by cast strip + period shelf.

## 9. Follow-ups (not in this stage)

- Opt-in full lifelines layer (toggle) for people, as sketched in the mock.
- Anchor/person images in cards and panels — `image` exists in the schema and is
  unused by content.
- Search field in the toolbar.
- Animated cross-altitude transitions beyond the basic position/opacity
  transitions (shared-element morphs).
