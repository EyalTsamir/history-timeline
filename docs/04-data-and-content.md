# 04 — Data storage & content authoring

## Strategy

**Schema-validated static JSON in the repo, compiled at build time, served by GitHub Pages.** No backend, no database, no CMS in the MVP (decision D2).

- The repo *is* the CMS: adding content = adding a JSON file = a reviewable git diff.
- Zod schemas ([03](03-domain-model.md)) validate every file in CI; broken references or malformed dates fail the build, so the deployed site can assume clean data.
- The app consumes one compiled artifact, so authoring convenience (many small files) never costs runtime performance.

This holds comfortably to several thousand items (see [10](10-performance.md)); the `DataSource` interface is the designed exit to an API.

## Content file layout

One file per entity, grouped by type. Small files keep git diffs and PR reviews readable and merge conflicts rare — this matters most once a content-generation workflow starts producing PRs.

```
content/
  _templates/                   # authoring templates (ignored by the loader)
  events/
    arab-revolt-1936.json
    war-of-independence.json
    battles-of-latrun.json      # sub-event: linked by parentId, not by filename
  people/
    david-ben-gurion.json
    golda-meir.json
  works/
    ben-gurion-bar-zohar.json
  taxonomies/
    person-categories.json      # small closed lists live in one file
    event-categories.json
    work-types.json
    regions.json
  relations.json                # generic edges (optional, may be empty)
```

File naming convention: **`<id>.json`** — the filename equals the entity `id` for every type. The `id` field inside the file is authoritative; the validator warns on mismatch. Include a year in the *id itself* only when needed to disambiguate (e.g. `arab-revolt-1936`); hierarchy is expressed by `parentId`, never by filename.

### Example authored file — `content/events/war-of-independence.json`

```json
{
  "id": "war-of-independence",
  "type": "event",
  "title": { "he": "מלחמת העצמאות" },
  "description": { "he": "מלחמתה של מדינת ישראל שזה עתה קמה נגד צבאות ערב, מנובמבר 1947 ועד הסכמי שביתת הנשק ב-1949." },
  "dates": { "start": "1947-11-30", "end": "1949-07-20" },
  "importance": 95,
  "regionIds": ["israel"],
  "links": [{ "label": { "he": "ערך בוויקיפדיה" }, "url": "https://he.wikipedia.org/wiki/..." }]
}
```

## Build pipeline

```
content/**/*.json
   │  scripts/validate-content.ts   (Zod parse per file → aggregate all errors, not fail-fast)
   │    • schema validity, date well-formedness (start ≤ end), importance ∈ [1,100]
   │    • referential integrity: every *Id resolves; parentId acyclic
   │    • uniqueness of ids; filename/id mismatch warnings
   ▼
scripts/build-content.ts
   │    • verify refs again, then assemble + DatasetSchema-parse the artifact
   │    • precompute reverse indexes (personId → workIds, parentId → childIds,
   │      region → descendants)
   │    • sort each entity list by timeline start (the app relies on this — docs/10)
   │    • taxonomy colors must resolve to --cat-* tokens in src/styles/tokens.css
   ▼
public/data/dataset.json          (stable name — dev server)
public/data/dataset.<hash>.json   (content-addressed — production, docs/10)
public/data/dataset.meta.json     (schemaVersion, counts, content hash, build time)
```

Both scripts run in CI on every PR and as a pre-step of `npm run dev` / `npm run build`. Locally: `npm run content:validate` and `npm run content:build` (see [docs/12](12-development.md)).

## Manual authoring workflow (Phase 1)

1. Copy a template from `content/_templates/` (one per entity type, with Hebrew field guidance in comments-via-`_comment` keys that the validator strips).
2. Fill in Hebrew text; assign `importance` using the rubric in [05](05-semantic-zoom.md#importance-rubric) — the rubric, not gut feeling, is what keeps semantic zoom coherent across authors.
3. Run `npm run content:validate`.
4. Open a PR; CI validates; preview build; merge to `main` deploys.

Practical MVP target: ~60–100 events (incl. sub-events), ~40–60 people, ~30–50 works — enough density to exercise semantic zoom honestly across the 70-year range.

## Designed-for future ingestion

The same layout is the landing zone for automated generation later: a generator (LLM-assisted or scraped) emits candidate JSON files on a branch → the *same* validator gates them → a human reviews the PR. No new infrastructure is needed until content volume outgrows static JSON, at which point `content/` migrates into a database and `build-content.ts` becomes the import script — the file format is the migration format.
