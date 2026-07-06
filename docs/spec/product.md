# Product

## Vision

An interactive historical timeline that lets users *move through time*: pan
continuously, step zoom from a whole-century view down to a single year, and
watch the level of detail adapt — defining events at the widest view, then
lesser figures, sub-events, and individual books as they zoom in. Alongside the
events, the timeline surfaces the **people** active in the visible period (a
cast strip) and the **written works** that document it — biographies,
autobiographies, and historical novels — connecting readers to books about the
period they're looking at.

## Audiences

1. **History enthusiasts** — want depth: sub-events, secondary figures, sources.
2. **Curious general users** — want orientation: the big picture of a period at a glance, in Hebrew.
3. **Book seekers** — want to discover biographies, autobiographies, and historical novels tied to a period or person.

## First content scope

- **Geography:** the Land of Israel / State of Israel.
- **Period:** 1930–2000.
- **Language:** Hebrew only (UI and content), full RTL layout.

The scope is deliberately narrow to validate the technical system (zoom,
filtering, rendering, content pipeline) before expanding regions, periods, and
content types. Nothing in the domain model or architecture is specific to this
scope — see [domain](domain.md) and [performance](performance.md).

## MVP capabilities (in scope)

| Capability | Notes |
|---|---|
| Horizontal, continuously pannable timeline | Drag / wheel / keyboard, inertial |
| Altitude zoom | Century → decade → year, stepped by gesture; panning stays continuous — [zoom](zoom.md), [interaction](interaction.md) |
| Importance-driven detail | Weightiest items are labeled marks; the rest are always-present dots — nothing disappears by zoom ([zoom](zoom.md)) |
| Events and nested sub-events | Two levels populated in MVP; model supports arbitrary depth. Deeper zoom folds sub-events into a parent "chapter" |
| People as a cast strip | Who is active in the visible window, with a short biography |
| Works as a period shelf | Biography / autobiography / historical novel; membership by covered period (D7) |
| Multiple books per person | Via work→person relations |
| Item detail on selection | Title, date(s), description, image, category/type, importance, sources, external links |
| Filters | Region, person category, content type, minimum importance — combinable, [filtering](filtering.md) |
| Desktop-only | Canvas timeline; the earlier mobile chronicle was removed (D20) — [interaction](interaction.md) |
| Shareable view state | Viewport + filters + selection encoded in the URL hash |

## Explicitly out of MVP scope

Recorded here so scope creep is a conscious decision, not drift. Details in
[roadmap.md](../roadmap.md).

- Free-text search.
- Relationship explorer UI (the *model* stores relationships; the UI doesn't traverse them yet beyond person↔work links in the detail panel).
- Toggling works to publication-date positioning (data is stored; the view toggle is future).
- Any backend, API, database, CMS, or admin UI.
- User accounts, favorites, comments, analytics.
- Additional languages, regions, or periods.
- Automated content generation/ingestion (the content format is designed to receive it later — [content](content.md)).
- Map view / geographic visualization (regions exist as filter taxonomy only).

## Success criteria for the MVP

1. A user on a phone or desktop can pan 1930–2000 smoothly and zoom from the full range to a single year.
2. Zooming visibly and sensibly changes the level of detail (no clutter wide, rich detail narrow), driven entirely by data + config, not hardcoded cases.
3. All filters compose correctly and instantly.
4. Adding a new event/person/work requires editing one JSON file and passing validation — no code changes.
5. The site is live on a public GitHub Pages URL, loads in under ~2s on a mid-range phone.
