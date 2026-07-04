# 11 — Roadmap & MVP boundaries

## Phases

### Phase 0 — Foundation (this stage) ✅
Product definition, architecture, domain model, and these docs. Approved decisions recorded in [02-architecture.md](02-architecture.md#decision-log).

### Phase 1 — MVP build
1. ✅ Project scaffold: Vite + React + TS strict, CSS Modules, RTL root, CI skeleton (typecheck/test/build/deploy to GitHub Pages with a placeholder page — deploy pipeline proven **first**).
2. ✅ Domain layer: entities (Zod), date model, normalization — with unit tests.
3. ✅ Content pipeline: validator + builder + templates; seed content to develop against.
4. ✅ Timeline core: scale (RTL), viewport store, pan/zoom gestures, ruler. *(timeline stage)*
5. ✅ Semantic zoom + lane layout + virtualization + density cap. *(timeline stage)*
6. ✅ Filters + URL hash state. *(timeline stage)*
7. ✅ Detail panel/sheet, selection, person↔work links. *(timeline stage)*
8. Full content pass: ~60–100 events, ~40–60 people, ~30–50 works per the rubric.
9. E2E suite (Playwright), mobile polish, performance guardrail, a11y pass.

### Phase 2 — Content scale & discovery
- Free-text search (client-side index; Hebrew stemming considerations).
- Static list/index view (SEO + no-JS fallback + accessibility alternative).
- Importance-tiered data splitting if payload budget is hit ([10](10-performance.md)).
- Assisted content generation: LLM/scraper emits candidate JSON → same validator → human-reviewed PRs ([04](04-data-and-content.md#designed-for-future-ingestion)).
- Publication-date view toggle for works (data already stored — decision D7).

### Phase 3 — Platform
- API + database behind `DataSource` (tile queries by window/importance/filters); content files become the import corpus.
- Data-management/admin UI replacing git-based authoring.
- Additional regions & periods; region-aware curves if density diverges wildly.
- Additional languages (widen `Text`, extract UI strings — both prepared).
- Relationship explorer over the `Relation` edge list.
- New content types (photos, press, testimonies) via new normalize rules.

## Boundary rules of thumb

Build now only what Phase 1 renders; **model** now whatever is cheap to store and expensive to migrate. That's why relations, publication dates, region hierarchy, and language-keyed text are in the schema today while search, APIs, and explorers are not in the code.

## Open questions (ask the user when they become relevant)

| Question | Becomes relevant |
|---|---|
| Does the RTL time axis (D5) feel right in practice? | First playable prototype |
| Should works surface earlier/later than events at equal importance (per-type curve offset)? | After first full content pass |
| Purchase/affiliate links on works? | Phase 2 (book-seeker audience) |
| Custom domain for GitHub Pages? | Before sharing publicly |
| Hebrew-calendar date display? | Phase 3 / localization |
