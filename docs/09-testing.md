# 09 — Testing strategy

The architecture was shaped for testability: everything hard (zoom math, layout, filtering, dates) lives in pure functions with no DOM/React dependency ([02](02-architecture.md#application-layers)). The pyramid follows from that.

## 1. Content validation (runs first, fails fastest)

Not classic tests, but the highest-value gate: `validate-content` in CI guarantees schema validity, date sanity, referential integrity, id uniqueness, and rubric warnings (child importance ≥ parent) for **every content PR** — the most frequent kind of change this project will see. See [04](04-data-and-content.md#build-pipeline).

## 2. Unit tests (Vitest) — the bulk

| Module | What must be pinned down |
|---|---|
| `domain/dates` | `HistDate` parsing/precision, decimal-year conversion, open ranges, display formatting ("מאי 1948", "≈") |
| `timeline/semanticZoom` | threshold curve interpolation incl. clamping at both ends, hysteresis band, `max(threshold, filter)` composition |
| `timeline/laneLayout` | packing correctness (no overlaps), stability (same input → same rows), band budgets, cluster-chip formation |
| `timeline/scale` | `xOf`/`tOf` round-trip, **RTL and LTR both** (the config flag stays honest), zoom anchoring math |
| `domain/filters` | combinatorial table: each dimension alone, all pairs, region-hierarchy expansion, person-category "unaffected" rule ([07](07-filtering.md)) |
| `domain/normalize` | each entity kind → `TimelineItem`, esp. work positioned by `coveredPeriod` not `publicationDate` (regression-guards decision D7) |
| `scripts/validate-content` | rejects each class of bad fixture (dangling ref, cyclic parentId, bad date…) |

Component tests (React Testing Library) cover the interactive shells: FilterBar state wiring, DetailPanel rendering of each kind, cluster chip expansion.

## 3. E2E (Playwright) — few, high-value flows

Run against the built static site (`vite preview`), desktop viewport + a mobile emulation project (touch, 390px). RTL rendering is inherently covered since the real app is RTL.

1. Load → full-range view shows only top-importance items; count sanity.
2. Zoom into 1948 (wheel + pinch) → sub-events appear, parent becomes container.
3. Pan across a decade with inertia; axis labels update.
4. Apply region + content-type filters together → visible set matches expectation; URL hash round-trips (reload restores view).
5. Select a person → detail shows bio + books; tap a book → work selected and panned into view.
6. Keyboard-only: Tab to an item, Enter opens detail, Esc closes.

Visual-regression screenshots (Playwright snapshots) on 2–3 canonical viewport states are cheap insurance for layout/RTL regressions; tolerate-and-update workflow.

## 4. Performance guardrail

One Playwright test pans/zooms over a **synthetic 10k-item dataset** (generated fixture) and asserts frame-time p95 under budget ([10](10-performance.md)) — so scale regressions surface before real content reaches that size.

## CI pipeline (GitHub Actions)

```
PR:    validate-content → typecheck → unit+component → build → e2e (chromium desktop+mobile)
main:  all of the above → deploy to GitHub Pages
```

No merge without green. Content-only PRs run the same pipeline (cheap, and e2e catches "valid JSON, absurd rendering" cases).
