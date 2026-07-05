# ציר הזמן ההיסטורי — HistoryTimeLine

An interactive, zoomable historical timeline web application. The first content scope covers **the Land of Israel / Israel, 1930–2000**, presented entirely in **Hebrew with a full RTL layout**.

Users move continuously through time, zoom between wide and narrow ranges, and explore major events, sub-events, people (shown by lifespan), and written works — biographies, autobiographies, and historical novels — positioned on the timeline by the historical period they describe.

## Status

**Phase 1 (MVP) — complete.** The interactive timeline (continuous pan/zoom, semantic zoom, lane/collision layout, event hierarchy, selection, URL-shareable state) is built, and the first curated content pass is in: **80 events, 40 people, 28 works, 25 relations** spanning 1930–2000 across politics, military, society, immigration, economy, culture, religion, science and civil-rights history — each entity carrying at least one real source, and every date web-verified. Semantic-zoom importance is calibrated to a pyramid so wide views stay readable and deep zoom rewards exploration.

Quality gates: **276 unit/component/real-content tests**, a **Playwright e2e suite** (desktop + mobile flows, keyboard a11y, and a 10k-item performance guardrail), strict TypeScript, ESLint, and content validation — all green in CI. The content is a **curated, representative selection, not an exhaustive record**.

All product and technical decisions are recorded in [docs/](docs/README.md); developer commands (install / run / test / e2e / lint / seed) are in [docs/12-development.md](docs/12-development.md).

## Stack (decided)

| Concern | Choice |
|---|---|
| Frontend | React + TypeScript (strict) + Vite |
| Styling | CSS Modules with CSS logical properties (RTL-safe) |
| State | Zustand (viewport, filters, selection) |
| Data | Schema-validated static JSON in `content/`, compiled at build time — no backend in MVP |
| Validation | Zod schemas, enforced in CI |
| Testing | Vitest + React Testing Library, Playwright E2E |
| Hosting | GitHub Pages via GitHub Actions |

## Documentation map

| Doc | Contents |
|---|---|
| [01 Product](docs/01-product.md) | Vision, users, MVP scope and boundaries |
| [02 Architecture](docs/02-architecture.md) | Stack rationale, application layers, deployment, decision log |
| [03 Domain model](docs/03-domain-model.md) | Entities, relationships, date model, schemas |
| [04 Data & content](docs/04-data-and-content.md) | Storage strategy, file layout, authoring workflow, validation |
| [05 Semantic zoom](docs/05-semantic-zoom.md) | Importance model, zoom→threshold curve, decluttering |
| [06 Timeline rendering](docs/06-timeline-rendering.md) | Presentation format, pipeline, lanes, virtualization, RTL axis |
| [07 Filtering](docs/07-filtering.md) | Combined-filter semantics |
| [08 Interaction](docs/08-interaction.md) | Desktop/mobile gestures, responsive layout, accessibility |
| [09 Testing](docs/09-testing.md) | Testing strategy and CI pipeline |
| [10 Performance](docs/10-performance.md) | Budgets and the scaling path for much larger datasets |
| [11 Roadmap](docs/11-roadmap.md) | Phases; what is explicitly deferred |
| [12 Development](docs/12-development.md) | Install, run, test, seed, reset — exact commands |
