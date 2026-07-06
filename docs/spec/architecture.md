# Architecture

## Stack and rationale

| Concern | Choice | Why |
|---|---|---|
| UI framework | **React 19 / TypeScript strict / Vite** | Largest ecosystem and long-term maintainability; TypeScript carries the domain model end-to-end; Vite outputs a plain static bundle for GitHub Pages. |
| Timeline component | **Custom-built** | No off-the-shelf timeline supports altitude zoom, importance-weighted layout, and RTL well. The timeline is the product; owning it is the point. |
| State | **Zustand** | Three small stores (viewport, filters, selection) with subscriptions granular enough for 60fps pan without context re-render storms. |
| Styling | **CSS Modules + CSS logical properties** | `margin-inline-start`, `inset-inline-end`, etc. make RTL the default rather than a mirrored afterthought; no utility-framework dependency. |
| Validation | **Zod** | One source of truth: schemas validate content JSON at build time *and* derive the TypeScript types the app uses. |
| Testing | **Vitest + React Testing Library; Playwright** | See [testing](testing.md). |
| Hosting | **GitHub Pages + GitHub Actions** | Free public URL from the repo, zero ops, deploy on push to `main`. |
| Data | **Static JSON, no backend** | See [content](content.md) and the [decision log](../decisions.md) (D2). |

## Application layers

Strict layering — a layer may import from below, never above:

```
┌─────────────────────────────────────────────────────────────┐
│  app/         Shell, Hebrew strings (strings.he.ts), decades,│
│  components/  URL state, config; React UI: Timeline,         │
│               CenturyStrip, EventMark, PresenceStrips,        │
│               FilterBar, DetailPanel                          │
├─────────────────────────────────────────────────────────────┤
│  state/       Zustand stores: viewport, filters, selection   │
│               (no React imports below here)                  │
├─────────────────────────────────────────────────────────────┤
│  timeline/    Pure logic: scale.ts (time↔px; axis direction  │
│               lives ONLY here), altitude.ts (altitudes,      │
│               tiers, label floors), fieldLayout.ts (event    │
│               field), presence.ts (cast + shelf), ticks,     │
│               visibility (culling), config                   │
├─────────────────────────────────────────────────────────────┤
│  data/        DataSource interface + StaticJsonDataSource    │
├─────────────────────────────────────────────────────────────┤
│  domain/      Entity schemas (Zod), date model, normalize →  │
│               TimelineItem, filter predicates                │
└─────────────────────────────────────────────────────────────┘
   content/   Source JSON (events, people, works, taxonomies)
   scripts/   Content validation + build → public/data/dataset.json
```

Boundary rules:

1. `domain/` and `timeline/` are **pure TypeScript** — no React, no DOM, no fetch. This is what makes zoom, layout, and filtering unit-testable and portable.
2. All data enters through the `DataSource` interface:

```ts
interface DataSource {
  loadDataset(): Promise<Dataset>; // Dataset = validated, ref-resolved content
}
```

   MVP ships `StaticJsonDataSource` (fetches the compiled dataset). A future API server implements the same interface (plus, later, windowed variants — see [performance](performance.md)); UI code never knows the difference.
3. Components never compute layout or visibility themselves; they render the output of the `timeline/` pipeline ([rendering](rendering.md)).

## Repository layout

```
/                     README.md
/docs                 this documentation (spec/, decisions.md, roadmap.md)
/content              authored content JSON (source of truth)
/scripts              validate-content.ts, build-content.ts, lib/, bench-synthetic.ts
/src
  /app                config.ts, strings.he.ts, urlState.ts, decades.ts
  /components         *.tsx + *.module.css
  /state              viewportStore, filterStore, selectionStore
  /timeline           scale.ts, altitude.ts, fieldLayout.ts, presence.ts,
                      ticks.ts, visibility.ts, config.ts
  /data               DataSource.ts, StaticJsonDataSource.ts
  /domain             entities.ts (Zod), dates.ts, normalize.ts, filters.ts,
                      timelineItem.ts, dataset.ts
  /styles             tokens.css
/public/data          dataset.json (generated — gitignored, rebuilt each build)
/e2e                  Playwright tests
```

## Deployment

- GitHub Actions on push to `main`: validate content → lint → typecheck → unit tests → build (content build runs as a pre-step) → e2e → deploy to GitHub Pages. Pages deploys are serialized by a `concurrency: pages` group.
- Vite `base: './'` (relative) — the bundle is relocatable to any Pages path or a custom domain without knowing the repo name; runtime data fetch prepends `import.meta.env.BASE_URL` (D10).
- Single-page app, **no router**: the only navigable state is the timeline view, encoded in the URL hash so links are shareable and GH Pages needs no SPA-fallback tricks. Format (`src/app/urlState.ts`): `#t=<center-year>&s=<span-years>&r=<regions>&pc=<person-cats>&ct=<content-types>&imp=<min>&sel=<item-id>` — filter/selection params appear only when active; decode validates every id against the dataset and degrades garbage to the default view. Writes are debounced `history.replaceState` (no history spam); external hash edits (paste, back/forward) apply back into the stores.

## Decisions

The stack, layering, RTL axis, data strategy, and the D16 presentation model are
recorded with alternatives and rationale in the [decision log](../decisions.md).
