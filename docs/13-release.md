# 13 — Stage 4 release: first curated, production-ready release

This stage turned the working interactive timeline into a credible first release: a curated, sourced, historically-responsible dataset; a strengthened content pipeline; product/mobile/accessibility polish; measured performance; broad automated coverage; and a deploy-ready build. The core product was **not** redesigned — every change extends the existing architecture (decision log in [02](02-architecture.md#decision-log)).

## What shipped

### Content (the headline)
- **80 events, 40 people, 28 works, 25 relations** covering the Land of Israel / Israel **1930–2000** (with in-scope context back to the 1860s for people/works). Every decade is represented, including the previously-empty **1980s**.
- Historical balance across **politics, military, society, immigration, labour & economics, culture & literature, religion, science & technology, education, and civil-rights / minority history**, plus Israeli–Palestinian history where relevant.
- Variety that exercises every product feature: dense (1947–49) vs. sparse periods; major events with **sub-events** (event hierarchy); **biographies, autobiographies, and historical novels**; short, long, and **open-ended (living)** lifespans; works positioned by **covered period** (D7); geographic + combined filtering; and all five importance bands so **semantic zoom** has something to reveal at every depth.
- **Sourcing (decision D15):** a new additive structured `sources[]` field, distinct from related `links`. Every entity cites at least one real, authoritative source (National Library of Israel, Yad Vashem, the Knesset, State Archives, Britannica, Ben-Gurion/Rabin/Begin institutes, …). Every date was **web-verified** (145/148 correct on the first pass; 3 corrected). Sources render under "מקורות" in the detail panel; the product footer states the content is a **curated, representative selection, not exhaustive**.

### Pipeline & calibration
- **Validator strengthened** with seven new rules: ≥1 source per entity, non-placeholder http(s) source/link URLs, no future dates, lifespan sanity (>120y), sub-event temporal containment, relations hygiene (self-loops / duplicate edges), intra-list duplicate refs, and an explicit projectability guard. Errors identify the file and field.
- **Importance recalibrated** to a pyramid (≈6 / 21 / 66 / 47 / 8 across the five bands) so wide views stay readable, major items always appear, and deep zoom rewards exploration ([05](05-semantic-zoom.md#calibration-against-the-curated-dataset-stage-4)).

### Product, mobile & accessibility
- Confirmed **RTL time axis** (D5) reads naturally on desktop and mobile; light/dark themes, reduced motion, keyboard, and touch all verified.
- A11y polish: focus restoration when a selected item is culled off-screen, `aria-live` range + result-count readouts, `role="status"` empty notice, WCAG 2.5.3-compliant cluster-chip names, and a single-owner mobile focus model.

### Performance
- Profiled over a **synthetic 10,000-item** dataset ([10](10-performance.md#measured-results-stage-4)): rendered DOM nodes stay **flat (~30) at any zoom**, full pipeline recompute is **1.2–5.7 ms** and only runs on settle/zoom/filter (never per pan frame). **No optimization was needed** — the first scaling lever is pulled when measurement demands it, and at 10k it does not. Synthetic data is generated in-memory and **never enters `content/`, `public/data/`, or a build**.

### Testing & CI
- **286 unit / component / real-content tests** (incl. production-content validation, timeline projection of every entity, and an importance-calibration guard) plus a **Playwright e2e suite**: the full desktop journey (explore → zoom → reveal hierarchy → filter → open → follow source → clear → restore-after-refresh), mobile filter/detail flows, keyboard a11y, invalid-URL resilience, and the 10k **performance guardrail**.
- CI runs validate → **lint** → typecheck → test → build → **e2e (desktop + mobile)**; `main` deploys to GitHub Pages (serialized via a deploy concurrency group).

## Adversarial review outcome

A skeptical multi-dimension review (13 dimensions, each finding verified by an independent skeptic) raised ~78 candidates; **12 survived verification and were all fixed**, each with code comments and — where practical — a regression test:

| Fix | Area |
|---|---|
| `decimalYearToYearMonth` float-underflow returned the previous month for ~44% of month boundaries | timeline math |
| Density cap starved on-screen items in favour of off-screen buffer items | collision layout |
| A degraded container dropped its children with no `+N` affordance | collision layout |
| Stale `suppressClick` swallowed the first tap after a touch pan/pinch | mobile gestures |
| Sheet scroll-lock not ref-counted (out-of-order unlock) | mobile / a11y |
| Cluster-chip visible text not contained in its accessible name (WCAG 2.5.3) | a11y |
| Filter result-count changes were not announced | a11y |
| Mobile detail close ran two competing focus-restoration paths | a11y |
| Stale `lastWritten` swallowed a legitimate back/forward hash change | URL state |
| Dataset hash included the build timestamp (not content-addressed) | content pipeline |
| "קרב דיר יאסין" softened framing inconsistent with the dataset's other events | historical integrity |
| Pages deploy job had no concurrency group | deployment |

## Quality gates (all green)

`npm run content:validate` 0/0 · `npm run lint` 0 · `npm run typecheck` 0 · `npm test` 286 passed · `npm run e2e` 8 passed · `npm run build` clean (~95 KB gzipped bundle + ~35 KB gzipped dataset, well under the 200 KB budget) · dataset hash content-stable · **no synthetic data in `dist/`** · 0 console/network errors · no unused/missing dependencies.

## Known open bugs

**None known.** Every confirmed finding from the adversarial review is fixed, and all gates are green. This is not a proof of absence — see limitations below.

## Accepted limitations (deliberate, not defects)

- **Content is curated, not comprehensive.** It is a representative teaching selection; the footer says so. Historical framing of sensitive events remains a human editorial responsibility — automated validation can prove a claim is *sourced and structurally sound*, never that it is *true*.
- **Source URLs are not reachability-checked.** Validation rejects placeholders and non-http(s) URLs but cannot verify a link is live without the network (which would make CI flaky); dead links are a content-review concern.
- **Out-of-range `imp` in a shared URL clamps to 100** (slider semantics), which can show a near-empty timeline rather than the default view. Not a crash; deterministic.
- **The timeline hijacks the mouse wheel** for zoom/pan while hovered (docs/08), so a wheel user must move off it to scroll a tall page. Intentional.
- **`role="application"`** suppresses the screen-reader browse cursor; mitigated by real inner `<button>`s, `aria-describedby` instructions, and keyboard operability.
- **The loading spinner slows (not stops) under reduced motion** — a fully static ring reads as broken.
- **The relation edge list (25 edges) is stored and validated but has no explorer UI** yet (Phase 2/3).
- **Deploy prerequisite:** the GitHub repo's Pages source must be set to "GitHub Actions" once, in repo settings (cannot be set from code).

## Next three highest-value product improvements (not implemented)

1. **Free-text search** — a client-side Hebrew search index so users can jump to any event/person/work by name instead of scrubbing the timeline. The single biggest discovery win; the dataset and `DataSource` boundary are ready for it (Phase 2, [11](11-roadmap.md)).
2. **A static list / index view with SEO + no-JS fallback** — a crawlable, linkable, screen-reader-friendly alternative to the canvas timeline. Expands reach (search engines, no-JS, low-power devices) and doubles as a strong accessibility alternative.
3. **Scale the content via the assisted-ingestion pipeline** — the product's value grows with its content; wire the designed LLM-assisted-candidate → *same validator* → human-reviewed-PR flow ([04](04-data-and-content.md#designed-for-future-ingestion)) so the dataset can grow toward and beyond the rubric's upper bound without hand-authoring each entity. (A close runner-up: a relationship explorer over the now-populated relation graph.)
