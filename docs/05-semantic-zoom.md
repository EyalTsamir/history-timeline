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

## Why numeric importance (assessment requested by the user)

The main alternatives were considered and **numeric importance is retained** — it's the right call:

- **Fixed named tiers** (e.g. "major/minor"): just a coarser version of the same idea; loses smooth transitions and renumbering flexibility. Strictly worse.
- **Explicit per-item zoom ranges** (`visibleFrom`–`visibleTo` scale on each item): maximal editorial control, but O(n) hand-tuned pairs that all break when the density of a period changes; unscalable authoring burden.
- **Purely density-based decluttering** (show top-k per screen region regardless of scores): self-balancing but non-deterministic — an item's visibility depends on its neighbors, which makes behavior hard for authors to reason about and QA to test.

Numeric importance is deterministic, testable, author-controllable, and — critically for future scale — **indexable**: "give me items in [t1,t2] with importance ≥ x" is a database/tile query, which is exactly how a future API will serve windowed data ([10](10-performance.md)).

### Complementary mechanism: density cap (not a replacement)

Numeric importance has one real weakness — uneven historical density (1948 vs. 1955). A secondary, purely presentational **per-lane density cap** covers this: after threshold filtering, if a lane holds more than `maxItemsPerLanePer1000px` (config, ~default 8), the lowest-importance overflow collapses into a **cluster chip** ("+5 נוספים") that expands on zoom-in or tap. Importance stays the single source of *ranking*; the cap only decides how many ranked items fit. This is an MVP-included refinement, not a future item, because dense years appear immediately in the first content scope.

## Behavior details

- **Hysteresis/fade:** items within ±3 importance points of the moving threshold fade rather than pop, and the threshold applies a small enter/exit hysteresis band so jittery pinch gestures don't strobe items.
- **Filters interact multiplicatively:** effective minimum = `max(zoomThreshold, userImportanceFilter)`; see [07](07-filtering.md).
- **Sub-events** additionally require their parent chain to be expanded-or-visible; see [06](06-timeline-rendering.md#event-hierarchy).
- **Works and people** use the same mechanism and curve — one system, no per-type special cases. If books should surface earlier than equally-important events (a product question for later), that becomes a per-type curve offset in config, not new code.
