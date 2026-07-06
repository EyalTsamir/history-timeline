# Testing strategy

The architecture was shaped for testability: everything hard (zoom math,
layout, filtering, dates) lives in pure functions with no DOM/React dependency
([architecture](architecture.md#application-layers)). The pyramid follows from
that.

## 1. Content validation (runs first, fails fastest)

Not classic tests, but the highest-value gate: `validate-content` in CI
guarantees schema validity, date sanity, referential integrity, id uniqueness,
≥1 non-placeholder source per entity, relations hygiene, sub-event/lifespan
sanity, projectability, and rubric warnings (child importance ≥ parent) for
**every content PR** — the most frequent kind of change this project will see.
See [content](content.md#build-pipeline). Fixture trees live in
`scripts/__fixtures__/`; post-review rules are covered by self-contained
temp-tree tests in `scripts/validate-content.review.test.ts`. The real `content/`
tree is gated by `scripts/production-content.test.ts` (zero errors *and*
warnings, curated-scope minimums, projection of every entity).

## 2. Unit tests (Vitest) — the bulk

| Module | What must be pinned down |
|---|---|
| `domain/dates` | `HistDate` parsing/precision, decimal-year conversion, open ranges, display formatting ("מאי 1948", "≈"), the `decimalYearToYearMonth` inverse (float-underflow boundary) |
| `timeline/altitude` | `altitudeOf`/`stepAltitude`/`canonicalSpan`, `tierOf` tier bounds, `isLabeled` label floors per altitude |
| `timeline/fieldLayout` | packing correctness (no overlaps), stability (same input → same rows), row budgets, chapter formation + collapse, dot bucketing, the presence guarantee (nothing dropped) |
| `timeline/presence` | `castForWindow` / `shelfForWindow` window-intersection + importance sort + overflow |
| `timeline/scale` | `xOf`/`tOf` round-trip, **RTL and LTR both** (the config flag stays honest), zoom anchoring math |
| `timeline/ticks`, `timeline/visibility` | adaptive gradations; culling to window ± buffer; open-ended spans |
| `domain/filters` | combinatorial table: each dimension alone, all pairs, region-hierarchy expansion, person-category "unaffected" rule ([filtering](filtering.md)) |
| `domain/normalize` | each entity kind → `TimelineItem`, esp. work positioned by `coveredPeriod` not `publicationDate` (regression-guards decision D7) |
| `scripts/validate-content` | rejects each class of bad fixture (dangling ref, cyclic parentId, bad date…) |

Component tests (React Testing Library) cover the interactive shells: FilterBar
state wiring, DetailPanel rendering of each kind, the event field's
selection/`aria-current` and chapter expansion, the century strip, the cast/shelf
strips, the desktop panel's focus lifecycle, the mobile bottom sheet (incl. the
ref-counted scroll lock and single-owner focus restoration), URL mirroring, and
filter changes preserving the viewport. `app/urlState` round-trips and validates.
One class of bug jsdom cannot catch — real pointer-capture/click interplay — is
covered by the e2e suite.

## 3. E2E (Playwright) — few, high-value flows

Run against the built static site (`vite preview`), a desktop viewport + a
mobile emulation project (touch, 390px). RTL rendering is inherently covered
since the real app is RTL.

1. Load → century view shows anchor marks + the dot band; result-count sanity.
2. Step-zoom into 1948 (wheel + pinch) → labels and a chapter appear; nothing pops out of existence.
3. Pan across a decade with inertia; axis labels update.
4. Apply region + content-type filters together → visible set matches; URL hash round-trips (reload restores view).
5. Select a person from the cast strip → detail shows bio + books + sources; follow a source link.
6. Keyboard-only: Tab to an item, Enter opens detail, Esc closes.
7. Mobile: filter and detail flows in the chronicle; invalid-URL resilience.

## <a name="performance-guardrail"></a>4. Performance guardrail

One Playwright test pans/zooms over a **synthetic 10k-item dataset** (generated
fixture, served via route interception) and asserts frame-time p95 under budget
([performance](performance.md)) — so scale regressions surface before real
content reaches that size.

## CI pipeline (GitHub Actions)

```
PR:    validate-content → lint → typecheck → unit+component → build → e2e (chromium desktop+mobile)
main:  all of the above → deploy to GitHub Pages (serialized by a `pages` concurrency group)
```

No merge without green. Content-only PRs run the same pipeline (cheap, and e2e
catches "valid JSON, absurd rendering" cases).
