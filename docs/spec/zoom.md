# Zoom: importance & altitudes

Every timeline entity carries a numeric **importance score, 1–100**. Zoom has
**three fixed altitudes** — century → decade → year — and at each altitude
importance decides *how much* an item shows, never *whether* it shows.

> **Presence is guaranteed.** Every filtered-in item is always on screen. Zoom
> and importance decide labeled mark vs. plain dot; nothing disappears because
> you zoomed out. (D16 principle 2 — the continuous threshold curve it replaced
> is gone.)

The user's explicit **minimum-importance filter** is the one thing that *removes*
items entirely, and it runs upstream of layout ([filtering](filtering.md)).

## Altitudes

The viewport window stays a free `{start, end}` in decimal years (era jumps and
shared URLs produce arbitrary spans); the **altitude is derived from the span**,
and every zoom gesture *steps* between canonical spans rather than scaling
freely. Authoritative code: `timeline/altitude.ts`.

```
altitude   derived from span      canonical span a gesture lands on
century    span ≥ 30y             the default (full-range) window (data-derived)
decade     6y ≤ span < 30y        12y
year       span < 6y              2y
```

- `altitudeOf(spanYears)` is pure; `stepAltitude`/`canonicalSpan` drive the gestures. `Home` / "טווח מלא" returns to century.
- Because the window itself is never quantized, the URL scheme (`t`/`s`) and `viewportStore` are untouched by altitudes — a shared link with any span still opens correctly and snaps to its altitude's layout.
- The gesture mechanics (wheel/pinch accumulation, anchoring, keyboard) live in [interaction](interaction.md).

## Importance tiers (visual weight)

Importance maps to a **tier** that sets marker and label size, so the century's
hierarchy reads at a glance (D16 principle 3). Tier bounds (`TIER_FLOORS` in
`altitude.ts`):

| Tier | Importance |
|---|---|
| seal | ≥ 95 |
| anchor | 80–94 |
| major | 55–79 |
| minor | 30–54 |
| background | < 30 |

### Label floors: labeled mark vs. dot

Each altitude has a **label floor** (`LABEL_FLOORS` in `altitude.ts`): at or
above it an item is a labeled mark; below it, an always-present dot. Floors are
`century: 80`, `decade: 45`, `year: 1` — so:

| Tier | century | decade | year |
|---|---|---|---|
| seal (≥95) | seal mark | seal mark | seal mark |
| anchor (80–94) | labeled | labeled | labeled |
| major (55–79) | dot | labeled | labeled |
| minor (30–54) | dot | labeled from ≥45; 30–44 dot | labeled |
| background (<30) | dot | dot | labeled |

Tuning label density is editing these numbers, exactly as the old curve was
config. `isLabeled(importance, altitude)` is the single predicate; the event
field ([rendering](rendering.md)) turns it into marks and dots.

## Importance rubric

Scores are meaningless unless authors share a scale. Content authoring
([content](content.md)) uses this rubric:

| Range | Meaning | Examples (scope: Israel 1930–2000) |
|---|---|---|
| 90–100 | Era-defining; visible and weighty at century view | הקמת המדינה, מלחמת העצמאות, השואה (as it bears on the Yishuv), מלחמת ששת הימים |
| 70–89 | Major national events & figures | מבצע קדש, הסכמי אוסלו, גולדה מאיר, מנחם בגין |
| 40–69 | Notable events, secondary figures, major works | קרב לטרון (sub-event), אישים מרכזיים בתחומם, ביוגרפיות חשובות |
| 20–39 | Contextual detail, surfaced at decade/year altitude | sub-events, cultural figures, most works |
| 1–19 | Fine detail, labeled only at year altitude | minor sub-events, niche works |

Rule of thumb: a sub-event's importance should be lower than its parent's
(validator warns otherwise), so hierarchies unfold naturally as you zoom in.

### Calibration: keep the scores a pyramid

The rubric only works if scores form a **pyramid**, not a plateau — deeper
altitudes reveal detail only when the lower tiers are actually populated. The
curated dataset (80 events / 40 people / 28 works) is balanced to roughly:

| Band | Meaning | Approx. count |
|---|---|---|
| 90–100 | era-defining | ~6 |
| 70–89 | major national | ~21 |
| 40–69 | notable | ~66 |
| 20–39 | contextual | ~47 |
| 1–19 | fine detail | ~8 |

Calibration rules to keep applying:

- **Works default to 20–39**; only a handful of canonical works (e.g. *ימי צקלג*, *סיפור על אהבה וחושך*) reach ~44–50, so books don't crowd events/people at wide zoom.
- **Sub-events and secondary affairs** sit at ~24–44, below the era-defining events they hang under.
- **A thin 1–19 tail** exists so the year altitude still has something to reveal.

If a content pass pushes a band far off these bounds, **re-balance the content**,
not the floors. `scripts/production-content.test.ts` enforces the curated-scope
minimums; a bad content PR fails there.

## Why numeric importance

The main alternatives were considered and numeric importance is retained:

- **Fixed named tiers** as the *authored* value: a coarser version of the same idea; loses renumbering flexibility. (Tiers still exist — but as a *derived* view of the score, above.)
- **Explicit per-item zoom ranges** (`visibleFrom`–`visibleTo` on each item): maximal control, but O(n) hand-tuned pairs that all break when a period's density changes; unscalable authoring burden.
- **Purely density-based decluttering** (top-k per screen region): self-balancing but non-deterministic — an item's fate depends on its neighbors, hard for authors to reason about and QA to test.

Numeric importance is deterministic, testable, author-controllable, and —
critically for future scale — **indexable**: "give me items in [t1,t2] with
importance ≥ x" is a database/tile query, which is exactly how a future API will
serve windowed data ([performance](performance.md#scaling-path)).
