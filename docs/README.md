# Documentation

Three kinds of document, kept deliberately separate:

- **[spec/](spec/)** — how the system works **today**, present tense, one authoritative doc per topic. If code and a spec doc disagree, that's a bug in one of them; there is no "superseded but still here" text to reconcile.
- **[decisions.md](decisions.md)** — **why** it works that way: the append-only decision ledger (`D1`…`D16`), release status, and accepted limitations.
- **[roadmap.md](roadmap.md)** — what is **not** built yet, and the boundary rules for deciding.

Docs are written in English (developer-facing); the application UI and all content are Hebrew, RTL.

## Spec

| Doc | One-line summary |
|---|---|
| [product](spec/product.md) | What we're building, for whom, and the MVP boundary |
| [architecture](spec/architecture.md) | Stack, application layers, deployment |
| [domain](spec/domain.md) | Entities, relationships, the date model, schemas |
| [content](spec/content.md) | Static-JSON storage, file layout, authoring, sourcing, build pipeline |
| [zoom](spec/zoom.md) | Numeric importance + three altitudes with importance-tier label budgets |
| [rendering](spec/rendering.md) | `TimelineItem`, the layout pipeline, the event field / cast strip / period shelf / century strip, RTL axis |
| [filtering](spec/filtering.md) | How combined filters compose |
| [interaction](spec/interaction.md) | Altitude-stepping gestures, selection/detail, a11y (desktop-only) |
| [testing](spec/testing.md) | Test pyramid, what to test, CI gates |
| [performance](spec/performance.md) | Budgets and the scaling path for 10k–100k+ items |
| [development](spec/development.md) | Install, run, test, reset — exact commands |

## Fixed decisions (quick reference)

Full rationale in [decisions.md](decisions.md).

- **Language:** Hebrew UI and content, full RTL layout throughout (D1).
- **Time axis direction:** RTL — past on the right — behind a single `timeDirection` config flag (D5).
- **Stack:** React + TypeScript + Vite; Zustand; CSS Modules with logical properties; Zod; Vitest; Playwright (D3, D8, D9).
- **Data:** Static schema-validated JSON compiled at build time; no backend; access behind a `DataSource` interface so an API can replace it without touching UI code (D2).
- **Hosting:** GitHub Pages, deployed by GitHub Actions from `main`.
- **Presentation:** a guided expedition — persistent century strip, three zoom altitudes, importance as visual weight, people/works as strips rather than axis geometry (D16).
- **Importance:** numeric 1–100 per a shared rubric; altitude tiers decide labeled mark vs. dot — nothing below a floor disappears (D4, D16).
- **Works on the timeline:** positioned by the historical period they describe; publication date stored for a future view (D7).
