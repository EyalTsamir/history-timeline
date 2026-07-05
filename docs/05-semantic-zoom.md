# 05 — Semantic zoom

## Model

Every timeline entity carries a numeric **importance score, 1–100**. Visibility is a pure function of the current viewport:

> An item is visible when `importance ≥ threshold(scale)` — where `scale` is the current **years-per-1000-CSS-pixels** of the viewport, and `threshold` is a continuous curve defined in config.

There are **no fixed zoom states**. The curve is piecewise-linear interpolation (in log-scale space) over configurable control points:

```ts
// src/timeline/semanticZoom.config.ts
export const zoomCurve: { yearsPer1000px: number; minImportance: number }[] = [
  { yearsPer1000px: 80,  minImportance: 85 },  // whole century in view → only the defining events
  { yearsPer1000px: 30,  minImportance: 65 },
  { yearsPer1000px: 10,  minImportance: 45 },
  { yearsPer1000px: 2,   minImportance: 20 },
  { yearsPer1000px: 0.5, minImportance: 0  },  // ~6 months per screen → everything
];
```

```ts
function threshold(yearsPer1000px: number): number {
  // clamp outside the curve; otherwise interpolate linearly in log(yearsPer1000px)
  // pure, memoizable, unit-tested against the config
}
```

Why **years-per-pixel** rather than visible-duration: it makes one curve correct on every screen. A phone showing 1930–2000 in 380px is far denser than a desktop showing the same range in 1600px; scale-per-pixel captures that automatically, so mobile gets a higher threshold with zero special-casing. (A `mobileThresholdBias` config knob exists for taste adjustments, default 0.)

## Importance rubric

Scores are meaningless unless authors share a scale. Content authoring uses this rubric ([04](04-data-and-content.md)):

| Range | Meaning | Examples (scope: Israel 1930–2000) |
|---|---|---|
| 90–100 | Era-defining; must be visible at the widest zoom | הקמת המדינה, מלחמת העצמאות, השואה (as it bears on the Yishuv), מלחמת ששת הימים |
| 70–89 | Major national events & figures | מבצע קדש, הסכמי אוסלו, גולדה מאיר, מנחם בגין |
| 40–69 | Notable events, secondary figures, major works | קרב לטרון (sub-event), אישים מרכזיים בתחומם, ביוגרפיות חשובות |
| 20–39 | Contextual detail visible at year-level zoom | sub-events, cultural figures, most works |
| 1–19 | Fine detail visible only at month-level zoom | minor sub-events, niche works |

Rule of thumb: a sub-event's importance should be lower than its parent's (validator warns otherwise), so hierarchies unfold naturally as the user zooms in.

### Calibration against the curated dataset (stage 4)

The rubric only works if scores form a **pyramid**, not a plateau — semantic zoom reveals detail only when lower tiers are actually populated. After the first full content pass (80 events / 40 people / 28 works) the scores were re-balanced systematically to this shape:

| Band | Meaning | Approx. count |
|---|---|---|
| 90–100 | era-defining | ~6 |
| 70–89 | major national | ~21 |
| 40–69 | notable | ~66 |
| 20–39 | contextual (year-level) | ~47 |
| 1–19 | fine detail (month-level) | ~8 |

Concrete calibration rules applied (and to keep applying):

- **Works default to 20–39** (their own rubric band); only a handful of canonical works (e.g. *ימי צקלג*, *סיפור על אהבה וחושך*) reach 44–50. This keeps books from surfacing at wide zoom and overwhelming events/people — books appear only around decade-level zoom and closer.
- **Sub-events and secondary affairs** (minor operations, single-issue scandals, institutional milestones) sit at 24–44, well below the era-defining events they hang under.
- **A thin 1–19 tail** (e.g. *ייבוש החולה*, *פרשת ואנונו*) exists so the deepest zoom still has something to reveal.

The observed reveal gradient on a 1200px desktop is smooth (≈11 items at century view → 14 at 1930–2000 → 30 → 44 → 83 → 145 as you zoom to a single year); on a 390px phone the same spans yield stricter thresholds automatically (≈11 → 18 → 33 → 105), which is the years-per-1000px normalization doing its job. `src/timeline/semanticZoom.calibration.test.ts` guards this shape against future content drift; if a content pass pushes a band far off these bounds, re-balance the content first — do **not** reshape the curve to paper over a content plateau.

## Why numeric importance (assessment requested by the user)

The main alternatives were considered and **numeric importance is retained** — it's the right call:

- **Fixed named tiers** (e.g. "major/minor"): just a coarser version of the same idea; loses smooth transitions and renumbering flexibility. Strictly worse.
- **Explicit per-item zoom ranges** (`visibleFrom`–`visibleTo` scale on each item): maximal editorial control, but O(n) hand-tuned pairs that all break when the density of a period changes; unscalable authoring burden.
- **Purely density-based decluttering** (show top-k per screen region regardless of scores): self-balancing but non-deterministic — an item's visibility depends on its neighbors, which makes behavior hard for authors to reason about and QA to test.

Numeric importance is deterministic, testable, author-controllable, and — critically for future scale — **indexable**: "give me items in [t1,t2] with importance ≥ x" is a database/tile query, which is exactly how a future API will serve windowed data ([10](10-performance.md)).

### Complementary mechanism: density cap (not a replacement)

Numeric importance has one real weakness — uneven historical density (1948 vs. 1955). A secondary, purely presentational **density cap** covers this (implemented in `timeline/laneLayout.ts`), with two bounds per band:

1. **Item budget** — after threshold filtering, a band keeps at most `maxItemsPer1000px × width/1000` top-level units (config, default 8), highest importance first.
2. **Row budget** — packing never opens more than `maxRows` rows (events/people 5, works 4); a container's children get `maxContainerChildRows` (3) inside it.

Everything cut by either bound collapses into **cluster chips** ("+5 נוספים") on a dedicated overflow row, grouped by pixel proximity (overlapping chips merge, so the chip row can never collide with itself). Tapping a chip zooms to fit the span its members cover. Importance stays the single source of *ranking*; the caps only decide how many ranked items fit.

## Behavior details

- **Fade band (decision D13):** items within `fadeBand` (3) importance points *below* the current floor render at a proportional opacity instead of popping — a continuous ramp, so jittery pinch gestures cannot strobe items, with no hidden state (visibility stays a pure function of item + viewport).
- **Filters interact multiplicatively:** effective minimum = `max(zoomThreshold, userImportanceFilter)`; see [07](07-filtering.md).
- **Sub-events** additionally require their parent chain to be visible; see [06](06-timeline-rendering.md#event-hierarchy).
- **Works and people** use the same mechanism and curve — one system, no per-type special cases. If books should surface earlier than equally-important events (a product question for later), that becomes a per-type curve offset in config, not new code.
- Authoritative code: curve + knobs in `src/timeline/semanticZoom.config.ts`, math in `src/timeline/semanticZoom.ts`, application in `src/timeline/visibility.ts` — all unit-tested.
