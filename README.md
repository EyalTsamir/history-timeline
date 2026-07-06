# ציר הזמן ההיסטורי — HistoryTimeLine

An interactive, zoomable historical timeline web application. The first content scope covers **the Land of Israel / Israel, 1930–2000**, presented entirely in **Hebrew with a full RTL layout**.

Users move continuously through time, step-zoom between century, decade, and year altitudes, and explore major events and sub-events on an event field, the people active in each period (a cast strip), and written works — biographies, autobiographies, and historical novels — shelved by the historical period they describe.

## Status

**Phase 1 (MVP) — complete.** The guided-expedition timeline (a century-strip minimap, altitude pan/zoom, an event field with chapters, a cast strip and period shelf, a mobile chronicle, selection, and URL-shareable state) is built, and the first curated content pass is in: **80 events, 40 people, 28 works, 25 relations** spanning 1930–2000 across politics, military, society, immigration, economy, culture, religion, science and civil-rights history — each entity carrying at least one real source, and every date web-verified. Importance is calibrated to a pyramid so wide views stay readable and deep zoom rewards exploration.

Quality gates: a full **unit / component / real-content** Vitest suite, a **Playwright e2e suite** (desktop + mobile flows, keyboard a11y, and a 10k-item performance guardrail), strict TypeScript, ESLint, and content validation — all green in CI. The content is a **curated, representative selection, not an exhaustive record**.

How the system works today is documented in [docs/spec/](docs/spec/); the decision log and rationale are in [docs/decisions.md](docs/decisions.md). Developer commands (install / run / test / e2e / lint / seed) are in [docs/spec/development.md](docs/spec/development.md).

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

## Documentation

- **[docs/spec/](docs/spec/)** — how the system works today: product, architecture, domain, content, zoom, rendering, filtering, interaction, testing, performance, development.
- **[docs/decisions.md](docs/decisions.md)** — the decision log (D1–D16), release status, and accepted limitations.
- **[docs/roadmap.md](docs/roadmap.md)** — what's deferred and why.

Start at [docs/README.md](docs/README.md) for the full index.
