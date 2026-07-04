# 01 — Product definition

## Vision

An interactive historical timeline that lets users *move through time*: pan continuously, zoom from a whole-century view down to a single year, and watch the level of detail adapt — major events at wide zoom, sub-events, lesser figures, and individual books as they zoom in. Alongside events, the timeline shows **people** (drawn across their lifespans) and **written works** — biographies, autobiographies, and historical novels — positioned by the historical period they describe, connecting readers to books about the era they're looking at.

## Audiences

1. **History enthusiasts** — want depth: sub-events, secondary figures, sources.
2. **Curious general users** — want orientation: the big picture of a period at a glance, in Hebrew, on any device.
3. **Book seekers** — want to discover biographies, autobiographies, and historical novels tied to a period or person.

## First content scope

- **Geography:** the Land of Israel / State of Israel.
- **Period:** 1930–2000.
- **Language:** Hebrew only (UI and content), full RTL layout.

The scope is deliberately narrow to validate the technical system (semantic zoom, filtering, rendering, content pipeline) before expanding regions, periods, and content types. Nothing in the domain model or architecture is specific to this scope — see [03](03-domain-model.md) and [10](10-performance.md).

## MVP capabilities (in scope)

| Capability | Notes |
|---|---|
| Horizontal, continuously pannable timeline | Desktop drag / mobile swipe, inertial |
| Continuous zoom | Wheel / pinch / controls; no discrete zoom steps |
| Semantic zoom | Importance-driven visibility, configurable curve — [05](05-semantic-zoom.md) |
| Events and nested sub-events | Two levels populated in MVP; model supports arbitrary depth |
| People shown by lifespan | With short biography |
| Written works | Biography / autobiography / historical novel; positioned by covered period |
| Multiple books per person | Via work→person relations |
| Item detail on selection | Title, date(s), short description, image, category/type, importance, external link |
| Filters | Region, person category, content type, minimum importance — combinable, [07](07-filtering.md) |
| Responsive desktop + mobile | [08](08-interaction.md) |
| Shareable view state | Viewport + filters encoded in the URL hash |

## Explicitly out of MVP scope

Recorded here so scope creep is a conscious decision, not drift. Details in [11-roadmap.md](11-roadmap.md).

- Free-text search.
- Relationship explorer UI (the *model* stores relationships; the UI doesn't traverse them yet beyond person↔work links in the detail panel).
- Toggling works to publication-date positioning (data is stored; the view toggle is future).
- Any backend, API, database, CMS, or admin UI.
- User accounts, favorites, comments, analytics.
- Additional languages, regions, or periods.
- Automated content generation/ingestion (the content format is designed to receive it later — [04](04-data-and-content.md)).
- Map view / geographic visualization (regions exist as filter taxonomy only).

## Success criteria for the MVP

1. A user on a phone or desktop can pan 1930–2000 at 60fps-feeling smoothness and zoom from the full range to a single month.
2. Zooming visibly and sensibly changes what is shown (no clutter at wide zoom, rich detail at narrow zoom), driven entirely by data + config, not hardcoded cases.
3. All filters compose correctly and instantly.
4. Adding a new event/person/work requires editing one JSON file and passing validation — no code changes.
5. The site is live on a public GitHub Pages URL, loads in under ~2s on a mid-range phone.
