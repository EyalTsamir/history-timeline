# Roadmap & MVP boundaries

## Phases

### Phase 0 — Foundation ✅
Product definition, architecture, domain model, and the [spec/](spec/) docs.
Approved decisions in [decisions.md](decisions.md).

### Phase 1 — MVP build ✅
Scaffold → domain layer → content pipeline → timeline core (scale, gestures,
ruler) → the guided-expedition UI (century strip, altitudes, event field, cast
strip, period shelf, mobile chronicle — D16) → filters + URL state → detail
panel/sheet → full curated content pass (80 events, 40 people, 28 works, 25
relations, sourced and web-verified) → e2e + mobile polish + performance
guardrail + a11y pass + adversarial review.

**Phase 1 is complete** — a curated, sourced, accessible, tested, deploy-ready
first release. Release detail and accepted limitations in
[decisions.md](decisions.md#release-status).

### Phase 2 — Content scale & discovery
- Responsive / mobile experience (removed in D20 — the app is currently desktop-only; a touch-first view may return, not necessarily the old vertical chronicle).
- Free-text search (client-side index; Hebrew stemming considerations).
- Static list/index view (SEO + no-JS fallback + accessibility alternative).
- Importance-tiered data splitting if the payload budget is hit ([performance](spec/performance.md)).
- Assisted content generation: LLM/scraper emits candidate JSON → same validator → human-reviewed PRs ([content](spec/content.md#designed-for-future-ingestion)).
- Publication-date view toggle for works (data already stored — decision D7).
- Opt-in full lifelines layer for people (a toggle back to axis geometry).

### Phase 3 — Platform
- API + database behind `DataSource` (tile queries by window/importance/filters); content files become the import corpus.
- Data-management/admin UI replacing git-based authoring.
- Additional regions & periods; region-aware curves if density diverges wildly.
- Additional languages (widen `Text`, extract UI strings — both prepared).
- Relationship explorer over the `Relation` edge list.
- New content types (photos, press, testimonies) via new normalize rules.

## Boundary rules of thumb

Build now only what Phase 1 renders; **model** now whatever is cheap to store and
expensive to migrate. That's why relations, publication dates, region hierarchy,
and language-keyed text are in the schema today while search, APIs, and explorers
are not in the code.

## Open questions (ask the user when they become relevant)

| Question | Becomes relevant |
|---|---|
| ~~Does the RTL time axis (D5) feel right in practice?~~ **Resolved: yes** — past-on-the-right reads naturally across desktop/mobile. | Resolved (redesign stage) |
| Should works surface earlier/later than events at equal importance (per-type tier offset)? | After the next content pass |
| Purchase/affiliate links on works? | Phase 2 (book-seeker audience) |
| Custom domain for GitHub Pages? | Before sharing publicly |
| Hebrew-calendar date display? | Phase 3 / localization |
