# Decisions & rationale

The **why** behind the project — the append-only decision ledger, the current
release status, and the limitations we deliberately accept. The **what** (how
the system works today) lives in [spec/](spec/); this file explains why it is
that way and what we chose against.

Decision IDs (`D1`…`D20`) are stable and cited from code comments (`decision
D7`, `(D14)`). Never renumber an entry — supersede it with a new one.

## Decision log

| ID | Decision | Alternatives considered | Rationale | Status |
|----|----------|------------------------|-----------|--------|
| D1 | Hebrew-only UI/content, RTL throughout | English-first; bilingual | User requirement. Content schema still uses a `TextByLang`-shaped field (`{ he: string }`) so adding languages is additive, not a migration. | ✅ Approved by user |
| D2 | Static JSON + GitHub Pages, no backend | Backend+DB now; hosted BaaS | User choice. Realistic to several thousand items; `DataSource` boundary keeps the exit clean. | ✅ Approved by user |
| D3 | React + TS + Vite | Svelte; Next.js | User choice. SSR/SEO (Next) deferred until discoverability matters. | ✅ Approved by user |
| D4 | Numeric importance (1–100), authored per a shared rubric | Named tiers; per-item zoom ranges; density-only | Deterministic, testable, author-controllable, and **indexable** for a future tile API ([spec/zoom.md](spec/zoom.md#why-numeric-importance)). The *continuous curve* that originally consumed it is superseded by D16; the 1–100 score itself stands. | ✅ Approved by user |
| D5 | **Time axis flows RTL** (past on the right) | LTR axis inside RTL UI | User asked for RTL "throughout, including all interface elements". Implemented as a `timeDirection` config consumed only by the scale function — reversing it later is a one-line change. | ✅ Confirmed (stage 4 visual review): reads naturally on desktop + mobile |
| D6 | DOM rendering (absolute-positioned elements), not Canvas/WebGL | Canvas; hybrid | At post-zoom scale (~30 visible nodes) DOM wins on RTL text, accessibility, styling, dev speed. The layout pipeline outputs plain positioned rectangles, so a Canvas renderer can replace the React one later without touching logic. | ✅ Implemented |
| D7 | Works positioned by covered historical period; publication date stored | Position by publication date | User requirement. Presence on the axis derives from `coveredPeriod`; a future "publication view" is a different derivation over the same data. Preserved through the D16 redesign (the period shelf's membership test still uses `coveredPeriod`). | ✅ Approved by user |
| D8 | CSS Modules + logical properties | Tailwind; styled-components | Fewest moving parts for a heavily custom, RTL-first UI. | ✅ Implemented |
| D9 | Zustand for state | Redux Toolkit; React context; Jotai | Minimal API, transient (non-render) subscriptions for gesture-time updates. | ✅ Implemented |
| D10 | Content-addressed dataset artifact: `dataset.<hash>.json` for production (injected via Vite define), stable `dataset.json` for dev | Plain filename + `no-cache` fetch | Immutable CDN caching on GitHub Pages with one request; a stale HTML→dataset mismatch surfaces as the `schema-version` error at worst. See [spec/performance.md](spec/performance.md). | ✅ Implemented |
| D11 | Content file naming: `<id>.json`, hierarchy via `parentId` only | `<start-year>-<slug>.json` with parent-prefix for sub-events | One rule for every entity type; the validator enforces filename = id by warning. Years appear in ids only to disambiguate. | ✅ Implemented |
| D12 | Zoom-out bound = full **data extent** (+2% pad); reset ("טווח מלא") = configured content range (+5% margins) | Zoom-out capped at content range +10% | People born before the content range (e.g. 1886) are real data; capping zoom-out below the pannable bounds creates a "can pan there but never see it all" dead end. Both values derive from data + config — nothing hardcodes the scope. | ✅ Implemented |
| D13 | ~~Threshold **fade band** (opacity ramp below the floor) instead of stateful hysteresis~~ | Hysteresis band retaining the previous visible set | **Obsolete under D16:** items never enter/leave existence by zoom anymore (overflow degrades to an always-present dot), so there is nothing to fade. Kept for the record. | ⛔ Superseded by D16 |
| D14 | ~~Labels of long spans anchor to the span∩viewport box, recomputed per relayout~~ | Label fixed at the span's start edge | A lifespan/era crossing the screen edge would otherwise carry its name off-screen. **Superseded by D17:** the "drifts up to one buffer screen until the settle relayout re-clamps it" cost was the visible pan jitter users reported — the viewport clamp is removed for a rigid pan. | ⛔ Superseded by D17 |
| D15 | Structured `sources: Source[]` on every entity, separate from `links`; validator requires ≥1 and rejects placeholder/non-http(s) source & link URLs | Reuse `links` as the only sourcing channel; no source requirement | Authoritative, honest, traceable content. `Source` (`title/publisher?/url?/kind?`) expresses citation authority and lets a `url` be omitted rather than fabricated — which `links` (a bare label+url) cannot. Additive schema field; rendered under "מקורות". Policy in [spec/content.md](spec/content.md#sourcing). **The `sources`/`links` split and the optional `url` are superseded by D18.** | ✅ Approved by user (stage 4) |
| D16 | **Guided-expedition UI** replaces the free pan-zoom canvas | Polish the existing canvas incrementally; keep the continuous curve | The first UI failed on six fronts (below). Replaced with: a persistent **century strip** + named eras; three zoom **altitudes** (century/decade/year) with importance-tier label budgets stepped by gesture; one **event field** (no kind bands, no cluster chips — overflow degrades to always-present dots); people as a **cast strip**, works as a **period shelf**; a vertical **chronicle** on mobile. Data model, stores, URL scheme, and `scale.ts` were untouched. Supersedes the presentation halves of D4 (curve) and D13 (fade band). | ✅ Approved by user (redesign stage) |
| D17 | **A pan is a rigid translation**: the field layout is a pure function of `(time, altitude, filters)`, so the settle relayout is a pixel-perfect visual no-op. The layer transform tracks the live window at all times (never freezes past the buffer); the field height reserves the altitude's full row budget (never resizes with content); dots sit at their true-time midpoint; era/bar/chapter labels anchor to their own geometry — **none of these are viewport-clamped** (revises D14). | Keep viewport-sticky dots/labels but re-clamp them every animation frame during the drag (smooth but per-frame layout work); or accept the settle snap | Users reported the field "trembling / re-placing itself" whenever they panned — every viewport-relative value (dot clamp, label∩viewport, and a content-dependent field height) rode the transform during the drag and then snapped when layout recomputed on settle (up to a full screen). Making the layout translation-invariant means what moves, moves *during* the drag, and the moment you stop nothing shifts. Cost: a span/era wider than the viewport shows its label only near its own centre (the RangeReadout and century-strip minimap still name the current era); a below-floor period longer than the view has no on-screen dot while you're inside it. | ✅ Implemented (user-requested) |
| D18 | **Merge `links` into `sources`; `Source.url` is now required** — one unified "מקורות וקישורים" list, no unlinked citations | Keep the two lists; keep `url` optional and show bare institution names | A source the reader can't open doesn't help — the two-section split (mostly url-less institution names under "מקורות", one Wikipedia link under "קישורים") was noise. Amends D15: `LinkSchema`/`links[]` removed, `Source.url` made mandatory. Migration folded each entity's related link into `sources`, dropped url-less citations, and sourced a verified URL for the 10 works left without one. | ✅ Approved by user |
| D19 | **Optional per-event `video` field**, YouTube-only, id-validated, rendered via a fixed `youtube-nocookie.com/embed/<videoId>` URL — never a raw URL or embed HTML | Freeform embed URL/iframe HTML field; self-hosting video files in the repo | A freeform field would let a content file's `video` point an iframe at an arbitrary domain or inject markup — a real risk for a schema that's otherwise inert data; constraining to a closed `provider` enum + bare regex-validated id means the render path alone builds the src. Self-hosting video contradicts D2 (static JSON, no backend/large-asset story) and would bloat the repo. `-nocookie` avoids tracking cookies pre-play. Used sparingly (only `importance >= 70` events, and only when real archival footage from a reputable channel exists) alongside the pre-existing but previously-unused `image` field — both media types are external links, curated the same way as `sources` (content.md#media). | ✅ Approved by user |
| D20 | **Drop the named eras and the mobile experience.** (a) The six curated eras ("בניין המדינה", "מלחמות והתפכחות"…) are removed everywhere — canvas washes/labels, century-strip zones, and the readout name. Navigation is now framed by **neutral decades** (`app/decades.ts`, generated from `contentRange`): the strip shades alternate decades and its jump chips are שנות ה־30…שנות ה־90; the readout names the current decade. (b) The app is **desktop-only** — the vertical mobile chronicle, the bottom-sheet detail surface, and the mobile filter sheet (the whole `Sheet` component) are deleted, along with every `matchMedia`/breakpoint branch. Amends the era half of D16 and retires D16 diagnosis point #6 (mobile). | User asked to remove the "arbitrary division into eras" and, rather than re-grouping the mobile feed, to eliminate the mobile view entirely ("אין יותר תצוגת מובייל — חסל. רק לדסקטופ. אולי בעתיד אשנה את זה"). Eras were an authorial interpretation the user rejected; neutral decades carry the same orientation/navigation affordances with no editorial claim. Mobile is deferred, not redesigned — it may return later. | ✅ Approved by user |

### Why the first UI was replaced (D16 diagnosis)

Six failures, verified against the running app, motivated the redesign — kept
here because they are the acceptance criteria the current design must not
regress:

1. **No orientation** — free pan/zoom over an unbounded canvas, no minimap, no named periods.
2. **Empty first impression** — the curve showed 14 of 148 items by default; the works band rendered empty but kept its space.
3. **Stripe degeneration** — below ~decade zoom, lifespans and covered-periods exceeded the window, so two of three bands became identical edge-to-edge lines.
4. **Importance decided existence, not appearance** — importance 100 and 32 got the same 11px row.
5. **Continuous zoom silently swapped content** — items popped mid-gesture; "+N נוספים" chips hid the best content and teleported the zoom when clicked.
6. **Mobile was a shrunken desktop** — three bands in a ~450px box, horizontal time unusable at 390px.

The five principles that answer them (whole range always on screen; no empty
screens; importance = visual weight; fixed altitudes not a curve; each kind its
own form) are documented as living design rules in
[spec/rendering.md](spec/rendering.md#design-principles).

## Release status

Phase 1 is complete: a curated, sourced, accessible, tested, deploy-ready first
release. The headline numbers (as of the redesign stage):

- **Content:** 80 events, 40 people, 28 works, 25 relations, Israel 1930–2000 (context back to the 1860s for people/works). Every entity cites ≥1 authoritative source (D15); every date was web-verified.
- **Quality gates (all green):** `content:validate` · `lint` · `typecheck` · `test` (unit/component/real-content) · `e2e` (Playwright desktop + mobile) · `build` (~95 KB gzipped bundle + ~35 KB gzipped dataset, under the 200 KB budget).
- **Performance:** rendered DOM nodes stay flat (~30) at any zoom over a synthetic 10k-item dataset; full pipeline recompute 1.2–5.7 ms, only on settle/zoom/filter ([spec/performance.md](spec/performance.md#measured-results)). No optimization was needed.
- **Adversarial review:** a 13-dimension skeptical review raised ~78 candidates; the 12 that survived independent verification were all fixed (float-underflow month bug, density-cap starvation, degraded-container child drop, stale `suppressClick`, non-ref-counted scroll lock, WCAG 2.5.3 cluster-chip name, unannounced filter counts, competing mobile focus paths, stale `lastWritten`, non-content-addressed hash, the Deir Yassin framing, missing Pages deploy concurrency group). Several targets were subsequently removed outright by the D16 redesign.

## Accepted limitations (deliberate, not defects)

- **Content is curated, not comprehensive.** A representative teaching selection; the footer says so. Historical framing of sensitive events is a human editorial responsibility — validation proves a claim is *sourced and structurally sound*, never that it is *true*.
- **Source URLs are not reachability-checked.** Validation rejects placeholders and non-http(s) URLs but cannot verify a link is live without the network (which would make CI flaky); dead links are a content-review concern.
- **Out-of-range `imp` in a shared URL clamps to 100** (slider semantics), which can show a near-empty timeline rather than the default view. Not a crash; deterministic.
- **The timeline hijacks the mouse wheel** for zoom/pan while hovered, so a wheel user must move off it to scroll a tall page. Intentional ([spec/interaction.md](spec/interaction.md)).
- **`role="application"`** suppresses the screen-reader browse cursor; mitigated by real inner `<button>`s, `aria-describedby` instructions, and full keyboard operability.
- **The loading spinner slows (not stops) under reduced motion** — a fully static ring reads as broken.
- **The relation edge list (25 edges) is stored and validated but has no explorer UI** yet (a [roadmap](roadmap.md) item).
- **Deploy prerequisite:** the GitHub repo's Pages source must be set to "GitHub Actions" once, in repo settings (cannot be set from code).
