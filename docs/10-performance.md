# 10 — Performance & the scaling path

## Budgets (MVP)

| Metric | Budget |
|---|---|
| Initial load (mid-range phone, 4G) | < 2s to interactive |
| Compiled dataset | < 200KB gzipped at MVP content volume |
| Pan/zoom frame time | p95 < 16ms (60fps feel) |
| Filter/zoom visible-set recompute | < 5ms at 1k items |

## Why the MVP is fast by construction

- **Semantic zoom is a performance feature**: regardless of dataset size, only items above the threshold *and* inside the viewport (+1 screen buffer) become DOM nodes — in practice ≤ ~150 elements.
- **Pan is transform-only**; layout recomputes only when the visible set changes (scale settle, filter change), rAF-throttled.
- Entity lists are **pre-sorted by start time** at build time; viewport culling is a binary search + walk, not a scan.
- Memoized selector chain (`filters → visibility → cull → layout`) keyed on `(FilterState, thresholdBucket, viewportWindow)` so gesture jitter doesn't recompute.
- One dataset fetch, cached by content hash in the filename: `build-content.ts` emits `dataset.<hash>.json` (plus a stable `dataset.json` for the dev server) and `vite.config.ts` injects the hashed URL into production bundles via the `__DATASET_URL__` define — immutable CDN caching on GitHub Pages with a single request.

## Scaling path

Ordered levers, each pulled only when measurement demands it — none require changing the domain model, the `TimelineItem` format, or any UI code, which is the payoff of the boundaries in [02](02-architecture.md):

| Scale | Pressure point | Lever |
|---|---|---|
| ~2–5k items | dataset payload size | Split compiled data by importance tier: top-tier loads first (timeline usable immediately), detail tiers lazy-load. Still static files. |
| ~10k | in-memory filter/cull passes | Interval index (sorted endpoints / interval tree) + precomputed filter bitmasks; move the selector chain into a Web Worker, main thread only renders `PositionedItem[]`. |
| ~50k+ | can't ship all data to client | **Tile API**: server serves `items?window=[t1,t2]&minImportance=x&filters=…` — note this query shape is exactly the numeric-importance model ([05](05-semantic-zoom.md#why-numeric-importance)), which is why that model was kept. `DataSource` gains a windowed variant; `StaticJsonDataSource` is replaced; nothing above `data/` changes. Content migrates from JSON files to a DB via the existing build script as importer ([04](04-data-and-content.md)). |
| Very dense rendering (maps of items, heat bands) | DOM node count | Canvas/WebGL renderer consuming the same `PositionedItem[]` (decision D6 anticipated this); DOM overlay retained for focused/selected items to keep accessibility. |

## Guardrail

A CI Playwright test drives pan/zoom over a synthetic 10k-item fixture and asserts the frame budget ([09](09-testing.md#4-performance-guardrail)) — the first lever gets pulled when this test says so, not speculatively.
