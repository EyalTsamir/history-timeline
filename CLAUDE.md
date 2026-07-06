# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ציר הזמן ההיסטורי — an interactive historical timeline (Israel 1930–2000 first scope), **Hebrew-only with full RTL layout**. React 19 + TypeScript strict + Vite; Zustand for state; Zod for validation; static JSON data, no backend. The UI follows the **guided-expedition concept** (decision D16 in [docs/decisions.md](docs/decisions.md); presentation spec in [docs/spec/rendering.md](docs/spec/rendering.md)): a persistent century strip with named eras, three zoom altitudes (century/decade/year) with importance-tier label budgets, one event field (overflow degrades to always-present dots — never chips), people as a cast strip, works as a period shelf, and a vertical chronicle feed on mobile.

Docs are split three ways: [docs/spec/](docs/spec/) — how the system works **today**, one authoritative doc per topic; [docs/decisions.md](docs/decisions.md) — the decision log (D1–D16) and rationale; [docs/roadmap.md](docs/roadmap.md) — what's deferred. Check the relevant spec doc before changing direction on anything architectural, and update it (adding a decision entry) when a decision changes.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Builds dataset from `content/`, then Vite dev server (localhost:5173) |
| `npm run build` | content build → `tsc --noEmit` → `vite build` |
| `npm test` | Full Vitest suite |
| `npx vitest run src/domain/dates.test.ts` | Run a single test file |
| `npm run typecheck` | TypeScript strict check |
| `npm run content:validate` | Validate all of `content/` — schemas, refs, cycles, dates |
| `npm run content:build` | Validate + compile `public/data/dataset.json` + meta |
| `npm run content:clean` | Delete compiled `public/data/` (regenerated on next dev/build) |

CI (`.github/workflows/ci.yml`): validate → lint → typecheck → test → build → e2e; pushes to `main` deploy to GitHub Pages.

## Architecture

Strict layering (top may import from below, never the reverse):

```
app/ + components/   React shell & UI; ALL Hebrew strings live in src/app/strings.he.ts;
                     app/eras.ts = named era definitions; app/urlState.ts = shareable #hash
state/               Zustand stores: filterStore, viewportStore, selectionStore — no React imports
timeline/            pure logic: scale.ts (time↔px; axis direction lives ONLY here),
                     altitude.ts (century/decade/year, importance tiers, label floors),
                     fieldLayout.ts (event field: marks/chapters/dots), presence.ts
                     (cast + shelf selectors), ticks, visibility (culling), config.ts
data/                DataSource interface + StaticJsonDataSource (fetches compiled dataset)
domain/              Zod entity schemas, date model, normalize → TimelineItem, filter predicates
```

- `domain/` and `timeline/` are **pure TypeScript** — no React, no DOM, no fetch.
- All data enters through the `DataSource` interface (`loadDataset(): Promise<Dataset>`); UI never knows the source.
- Components never compute layout/visibility; they render the output of the `timeline/` pipeline. `components/Timeline.tsx` owns gestures/keyboard; horizontal geometry is inline-styled physical px from the layout — deliberate, since those values already encode the axis direction (logical properties cover everything else).

### Content pipeline

`content/*.json` (source of truth, one file per entity) → `scripts/build-content.ts` validates against the Zod schemas in [src/domain/entities.ts](src/domain/entities.ts), resolves every reference, precomputes reverse indexes, and emits `public/data/dataset.json` plus a content-addressed `dataset.<hash>.json` (injected into production builds via the `__DATASET_URL__` Vite define; dev uses the stable name). The compiled artifact is gitignored and rebuilt on every dev/build.

### Key domain rules

- **Dates**: authored as `"1948"`, `"1948-05"`, or `"1948-05-14"`; compiled to decimal years by `domain/dates.ts`. All layout/zoom math uses decimal years; nothing downstream parses date strings. Precision is preserved for display (a year-only date never renders a fabricated day).
- **Works** are positioned by `coveredPeriod`, not `publicationDate` (decision D7).
- **Person lifespan** requires an explicit `end` (death date or `null` = still alive) — an omitted end is invalid.
- `importance` is numeric 1–100 per the rubric in [docs/spec/zoom.md](docs/spec/zoom.md); the altitude label floors (same doc) decide *labeled mark vs dot* from it — items below a floor stay visible as dots, they never disappear.
- Category `color` values must be existing `--cat-*` tokens in `src/styles/tokens.css` (validated at build).

## Conventions

- **Hebrew/RTL**: components hold no Hebrew literals — every user-facing string goes in `src/app/strings.he.ts`. Styling uses CSS Modules with **CSS logical properties** (`margin-inline-start`, `inset-inline-end`…), never left/right. The time axis itself flows RTL (past on the right), controlled by a `timeDirection` config consumed only by the scale function.
- **Content authoring**: copy a template from `content/_templates/`; filename must equal the entity `id` (kebab-case slug, globally unique). `_`-prefixed keys are template comments, stripped by the loader. Run `npm run content:validate` after edits.
- **Tests** live next to their subjects (`src/**/*.test.ts(x)`, `scripts/*.test.ts`). Vitest `globals` is **off** — import `describe`/`it`/`expect`, and every component test file calls `afterEach(cleanup)` itself. Content-validator tests run against fixture trees in `scripts/__fixtures__/` — add a new fixture tree when adding a validator rule.
- tsconfig is maximally strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) — expect index accesses to be `| undefined` and use `import type` for types.
