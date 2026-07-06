# Performance & the scaling path

## Budgets (MVP)

| Metric | Budget |
|---|---|
| Initial load (mid-range phone, 4G) | < 2s to interactive |
| Compiled dataset | < 200KB gzipped at MVP content volume |
| Pan/zoom frame time | p95 < 16ms (60fps feel) |
| Filter/zoom visible-set recompute | < 5ms at 1k items |

## Why the MVP is fast by construction

- **Altitude layout is a performance feature**: regardless of dataset size, only items inside the viewport (+1 screen buffer) become DOM nodes, and overflow degrades to pixel-bucketed dots — in practice ~30 elements at any zoom.
- **Pan is transform-only**; layout recomputes only when the visible set changes (altitude step, settle, filter change), rAF-throttled.
- Entity lists are **pre-sorted by start time** at build time; viewport culling is a binary search + walk, not a scan.
- Memoized selector chain (`filters → cull → layout`) keyed on `(FilterState, layoutWindow)` so gesture jitter doesn't recompute.
- One dataset fetch, cached by content hash in the filename: `build-content.ts` emits `dataset.<hash>.json` (plus a stable `dataset.json` for the dev server) and `vite.config.ts` injects the hashed URL into production bundles via the `__DATASET_URL__` define — immutable CDN caching on GitHub Pages with a single request (D10).

## Scaling path

Ordered levers, each pulled only when measurement demands it — none require
changing the domain model, the `TimelineItem` format, or any UI code, which is
the payoff of the boundaries in [architecture](architecture.md):

| Scale | Pressure point | Lever |
|---|---|---|
| ~2–5k items | dataset payload size | Split compiled data by importance tier: top-tier loads first (timeline usable immediately), detail tiers lazy-load. Still static files. |
| ~10k | in-memory filter/cull passes | Interval index (sorted endpoints / interval tree) + precomputed filter bitmasks; move the selector chain into a Web Worker, main thread only renders positioned marks. |
| ~50k+ | can't ship all data to client | **Tile API**: server serves `items?window=[t1,t2]&minImportance=x&filters=…` — this query shape is exactly the numeric-importance model ([zoom](zoom.md#why-numeric-importance)), which is why that model was kept. `DataSource` gains a windowed variant; `StaticJsonDataSource` is replaced; nothing above `data/` changes. Content migrates from JSON files to a DB via the existing build script as importer ([content](content.md)). |
| Very dense rendering | DOM node count | Canvas/WebGL renderer consuming the same positioned marks (decision D6 anticipated this); DOM overlay retained for focused/selected items to keep accessibility. |

## Measured results

Profiled with `scripts/bench-synthetic.ts` over a **synthetic 10,000-entity**
dataset (never production data — generated in-memory by
`scripts/lib/synthetic.ts`, served to the browser only via Playwright route
interception; it never touches `content/` or `public/data/`). Desktop width
1200px, Node/V8:

| Stage | Cost at 10k | Notes |
|---|---|---|
| `normalizeDataset` (once, on load) | ~63 ms | one-time; well within the 2s load budget |
| `applyFilters` (per filter change) | ~0.13 ms | O(n) scan, negligible |
| **full recompute** (cull + layout, per settle/zoom) | **1.2–5.7 ms** | worst case at the deepest zoom |
| **rendered DOM nodes** | **25–31, at every zoom** | altitude label budgets + dot bucketing + cull bound the set regardless of dataset size |

Two things the numbers confirm: (1) the rendered node count is **flat (~30)**
whether the dataset holds 148 or 10,000 items — the whole point of altitude label
budgets + dot bucketing + culling; and (2) the heaviest recompute (5.7 ms)
happens only on **settle / zoom / filter change** (rAF-throttled), never per pan
frame — a pan frame is a CSS transform only. So the 16 ms frame budget is met
with large headroom at 10k.

**Decision: no optimization applied.** Per "profile before optimizing", the
first scaling lever above is pulled when measurement demands it; at 10k it does
not.

## Guardrail

A CI Playwright test drives pan/zoom over a synthetic 10k-item fixture and
asserts the frame budget ([testing](testing.md#performance-guardrail)) — the
first lever gets pulled when this test says so, not speculatively.
