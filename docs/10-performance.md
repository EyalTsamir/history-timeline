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

## Measured results (stage 4)

Profiled with `scripts/bench-synthetic.ts` over a **synthetic 10,000-entity** dataset (never production data — generated in-memory by `scripts/lib/synthetic.ts`, served to the browser only via Playwright route interception; it never touches `content/` or `public/data/`). Desktop width 1200px, Node/V8:

| Stage | Cost at 10k | Notes |
|---|---|---|
| `normalizeDataset` (once, on load) | ~63 ms | one-time; well within the 2s load budget |
| `applyFilters` (per filter change) | ~0.13 ms | O(n) scan, negligible |
| `applySemanticVisibility` (per settle) | 0.5–2.6 ms | O(n) scan incl. parent-chain |
| **full recompute** (visibility+cull+layout, per settle/zoom) | **1.2–5.7 ms** | worst case at the deepest zoom |
| **rendered DOM nodes** | **25–31, at every zoom** | density cap + cull bound the set regardless of dataset size |

Two things the numbers confirm: (1) the rendered node count is **flat (~30)** whether the dataset holds 148 or 10,000 items — the whole point of semantic zoom + density cap + culling; and (2) the heaviest recompute (5.7 ms) happens only on **settle / zoom / filter change** (rAF-throttled), never per pan frame — a pan frame is a CSS transform only. So the 16 ms frame budget is met with large headroom at 10k.

**Decision: no optimization applied.** Per "profile before optimizing", the first scaling lever below is pulled when measurement demands it; at 10k it does not. (The only O(n)-per-settle pass, `applySemanticVisibility`, would approach the frame budget only around ~50k+ items, which is where the interval-index / Web-Worker lever in the table below is designed to take over.)

## Guardrail

A CI Playwright test drives pan/zoom over a synthetic 10k-item fixture and asserts the frame budget ([09](09-testing.md#4-performance-guardrail)) — the first lever gets pulled when this test says so, not speculatively.
