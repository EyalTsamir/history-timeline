# Documentation index

These documents record the approved product and technical decisions for the HistoryTimeLine project. They were written before implementation (Phase 0) and are the source of truth for later stages. When a decision changes, update the relevant doc **and** the decision log in [02-architecture.md](02-architecture.md#decision-log).

Docs are written in English (developer-facing); the application UI and all content are in Hebrew, RTL.

| # | Doc | One-line summary |
|---|---|---|
| 01 | [Product](01-product.md) | What we're building, for whom, and the exact MVP boundary |
| 02 | [Architecture](02-architecture.md) | Stack, application layers, deployment, decision log |
| 03 | [Domain model](03-domain-model.md) | Entities, relationships, the date model, TypeScript schemas |
| 04 | [Data & content](04-data-and-content.md) | Static-JSON storage, content file layout, authoring workflow |
| 05 | [Semantic zoom](05-semantic-zoom.md) | Numeric importance + configurable zoom→threshold curve |
| 06 | [Timeline rendering](06-timeline-rendering.md) | TimelineItem presentation format, layout pipeline, RTL axis |
| 07 | [Filtering](07-filtering.md) | How combined filters compose |
| 08 | [Interaction](08-interaction.md) | Desktop/mobile interaction model, responsiveness, a11y |
| 09 | [Testing](09-testing.md) | Test pyramid, what to test, CI gates |
| 10 | [Performance](10-performance.md) | Budgets now, scaling strategy for 10k–100k+ items |
| 11 | [Roadmap](11-roadmap.md) | Phases and deferred functionality |
| 12 | [Development](12-development.md) | Install, run, test, seed, reset — exact commands |
| 13 | [Stage 4 release](13-release.md) | First curated release: what shipped, gates, limitations, next steps |

## Fixed decisions (quick reference)

- **Language:** Hebrew UI and content, full RTL layout throughout.
- **Time axis direction:** RTL — past on the right, time advances leftward — behind a single `timeDirection` config flag (see [06](06-timeline-rendering.md#rtl-time-axis)).
- **Stack:** React + TypeScript + Vite; Zustand; CSS Modules with logical properties; Zod; Vitest; Playwright.
- **Data:** Static schema-validated JSON compiled at build time; no backend in MVP; data access behind a `DataSource` interface so an API can replace it without touching UI code.
- **Hosting:** GitHub Pages, deployed by GitHub Actions from `main`.
- **Semantic zoom:** Numeric importance (1–100) with a configurable, continuous zoom→threshold curve — no fixed zoom states. A per-lane density cap is a secondary declutter mechanism.
- **Works on the timeline:** positioned by the historical period they describe; publication date stored for future views.
