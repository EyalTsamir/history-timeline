# 02 — Architecture

## Stack and rationale

| Concern | Choice | Why |
|---|---|---|
| UI framework | **React 18+ / TypeScript strict / Vite** | Largest ecosystem and long-term maintainability; TypeScript carries the domain model end-to-end; Vite keeps build/dev simple and outputs a plain static bundle for GitHub Pages. |
| Timeline component | **Custom-built** | No off-the-shelf timeline library supports continuous semantic zoom, lane packing, and RTL well. The timeline is the product; owning it is the point. |
| State | **Zustand** | Three small stores (viewport, filters, selection) with subscriptions granular enough for 60fps pan without context re-render storms. No Redux ceremony. |
| Styling | **CSS Modules + CSS logical properties** | `margin-inline-start`, `inset-inline-end`, etc. make RTL the default rather than a mirrored afterthought; no utility-framework dependency to churn. |
| Validation | **Zod** | One source of truth: schemas validate content JSON at build time *and* derive the TypeScript types used by the app. |
| Testing | **Vitest + React Testing Library; Playwright** | See [09](09-testing.md). |
| Hosting | **GitHub Pages + GitHub Actions** | Free public URL from the GitHub repo (user requirement), zero ops, deploy on push to `main`. |
| Data | **Static JSON, no backend** | See [04](04-data-and-content.md) and the decision log below. |

## Application layers

```
┌────────────────────────────────────────────────────────┐
│  app/         Shell, Hebrew strings, theme, URL state  │
│  components/  React UI: Timeline, ItemCard, FilterBar, │
│               DetailPanel, ZoomControls                 │
├────────────────────────────────────────────────────────┤
│  state/       Zustand stores: viewport, filters,        │
│               selection  (no React imports below here)  │
├────────────────────────────────────────────────────────┤
│  timeline/    Pure logic: time scale, semantic-zoom     │
│               threshold, lane layout, virtualization    │
├────────────────────────────────────────────────────────┤
│  data/        DataSource interface +                    │
│               StaticJsonDataSource implementation       │
├────────────────────────────────────────────────────────┤
│  domain/      Entity types, date model, normalization   │
│               to TimelineItem, filter predicates        │
└────────────────────────────────────────────────────────┘
   content/   Source JSON (events, people, works, taxonomies)
   scripts/   Content validation + build → public/data/dataset.json
```

Boundary rules (enforceable by lint import rules later):

1. `domain/` and `timeline/` are **pure TypeScript** — no React, no DOM, no fetch. This is what makes semantic zoom, layout, and filtering unit-testable and portable.
2. All data enters through the `DataSource` interface:

```ts
interface DataSource {
  loadDataset(): Promise<Dataset>; // Dataset = validated, ref-resolved content
}
```

   MVP ships `StaticJsonDataSource` (fetches `data/dataset.json`). A future API server implements the same interface (plus, later, windowed variants — see [10](10-performance.md)); UI code never knows the difference.
3. Components never compute layout or visibility themselves; they render the output of the `timeline/` pipeline ([06](06-timeline-rendering.md)).

## Planned repository layout

```
/                     README.md
/docs                 this documentation
/content              authored content JSON (source of truth)
/scripts              validate-content.ts, build-content.ts
/src
  /app                shell, strings.he.ts, url-state
  /components         *.tsx + *.module.css
  /state              viewportStore, filterStore, selectionStore
  /timeline           scale.ts, semanticZoom.ts, laneLayout.ts, viewportCull.ts
  /data               DataSource.ts, StaticJsonDataSource.ts
  /domain             entities.ts (Zod), dates.ts, normalize.ts, filters.ts
/public/data          dataset.json (generated — gitignored or build artifact)
/e2e                  Playwright tests
```

## Deployment

- GitHub Actions workflow on push to `main`: validate content → typecheck → unit tests → `vite build` (content build runs as a pre-step) → deploy to GitHub Pages.
- Vite `base` set to the repo path (or `/` if a custom domain is added later).
- Single-page app, **no router**: the only navigable state is the timeline view, encoded in the URL hash so links are shareable and GH Pages needs no SPA-fallback tricks. Implemented format (`src/app/urlState.ts`): `#t=<center-year>&s=<span-years>&r=<regions>&pc=<person-cats>&ct=<content-types>&imp=<min>&sel=<item-id>` — filter/selection params appear only when active; decode validates every id against the dataset and degrades garbage to the default view. Writes are debounced `history.replaceState` (no history spam); external hash edits (paste, back/forward) apply back into the stores.

## Decision log

| ID | Decision | Alternatives considered | Rationale | Status |
|----|----------|------------------------|-----------|--------|
| D1 | Hebrew-only UI/content, RTL throughout | English-first; bilingual | User requirement. Content schema still uses a `TextByLang`-shaped field (`{ he: string }`) so adding languages is additive, not a migration. | ✅ Approved by user |
| D2 | Static JSON + GitHub Pages, no backend | Backend+DB now; hosted BaaS | User choice. Realistic to several thousand items; `DataSource` boundary keeps the exit clean. | ✅ Approved by user |
| D3 | React + TS + Vite | Svelte; Next.js | User choice. SSR/SEO (Next) deferred until discoverability matters. | ✅ Approved by user |
| D4 | Numeric importance (1–100) + continuous configurable zoom curve | Tiered levels; per-item zoom ranges; density-only | User preference, endorsed — see [05](05-semantic-zoom.md#why-numeric-importance) for the analysis and the complementary density cap. | ✅ Approved by user |
| D5 | **Time axis flows RTL** (past on the right) | LTR axis inside RTL UI | User asked for RTL "throughout, including all interface elements". Hebrew-education timelines commonly run right→left. Implemented as a `timeDirection` config consumed only by the scale function — reversing it later is a one-line change. | ⚠️ Default chosen by Claude; flag to user if it feels wrong in the prototype |
| D6 | DOM rendering (virtualized absolute-positioned elements), not Canvas/WebGL | Canvas; hybrid | At post-semantic-zoom scale (≤ ~150 visible items), DOM wins on RTL text, accessibility, styling, and dev speed. The layout pipeline outputs plain positioned rectangles, so a Canvas renderer can replace the React renderer later without touching logic. | ✅ Proposed |
| D7 | Works positioned by covered historical period; publication date stored | Position by publication date | User requirement. `TimelineItem` derives its span from `coveredPeriod`; a future "publication view" is a different derivation over the same data. | ✅ Approved by user |
| D8 | CSS Modules + logical properties | Tailwind; styled-components | Fewest moving parts for a heavily custom, RTL-first UI. | ✅ Proposed |
| D9 | Zustand for state | Redux Toolkit; React context; Jotai | Minimal API, transient (non-render) subscriptions for gesture-time updates. | ✅ Proposed |
| D10 | Content-addressed dataset artifact: `dataset.<hash>.json` for production (injected via Vite define), stable `dataset.json` for dev | Plain filename + `no-cache` fetch | Immutable CDN caching on GitHub Pages with one request; a stale HTML→dataset mismatch surfaces as the `schema-version` error at worst. See docs/10. | ✅ Implemented (stage 2 review) |
| D11 | Content file naming: `<id>.json`, hierarchy via `parentId` only | `<start-year>-<slug>.json` with parent-prefix for sub-events (original docs/04 text) | One rule for every entity type; the validator enforces filename = id by warning. Years appear in ids only to disambiguate. | ✅ Implemented (supersedes original docs/04 wording) |
| D12 | Zoom-out bound = full **data extent** (+2% pad); reset ("טווח מלא") = configured content range (+5% margins) | Zoom-out capped at content range +10% (original docs/08 wording) | People born before the content range (e.g. 1886) are real data; capping zoom-out below the pannable bounds creates a "can pan there but never see it all" dead end. Both values derive from data + config — nothing hardcodes the scope. | ✅ Implemented (timeline stage; supersedes original docs/08 numbers) |
| D13 | Threshold **fade band** (pure opacity ramp over the 3 points below the floor) instead of stateful enter/exit hysteresis | Hysteresis band retaining the previous visible set (original docs/05 wording) | A continuous ramp cannot strobe under gesture jitter *and* keeps visibility a pure function of (item, viewport) — no hidden state, trivially testable. | ✅ Implemented (timeline stage) |
| D14 | Labels of long spans anchor to the span∩viewport box, recomputed per relayout | Label fixed at the span's start edge | A lifespan/era crossing the screen edge would otherwise carry its name off-screen. Computed in the pure layout (`labelX/labelWidth`), so it stays deterministic and testable; during a pan the anchor drifts up to one buffer screen until the settle relayout re-clamps it. | ✅ Implemented (timeline stage) |
