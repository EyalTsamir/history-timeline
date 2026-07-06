# Data storage & content authoring

## Strategy

**Schema-validated static JSON in the repo, compiled at build time, served by
GitHub Pages.** No backend, no database, no CMS (decision D2).

- The repo *is* the CMS: adding content = adding a JSON file = a reviewable git diff.
- Zod schemas ([domain](domain.md)) validate every file in CI; broken references or malformed dates fail the build, so the deployed site can assume clean data.
- The app consumes one compiled artifact, so authoring convenience (many small files) never costs runtime performance.

This holds comfortably to several thousand items (see
[performance](performance.md)); the `DataSource` interface is the designed exit
to an API.

## Content file layout

One file per entity, grouped by type. Small files keep git diffs and PR reviews
readable and merge conflicts rare — this matters most once a content-generation
workflow starts producing PRs.

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

File naming convention: **`<id>.json`** — the filename equals the entity `id`
for every type (decision D11). The `id` field inside the file is authoritative;
the validator warns on mismatch. Include a year in the *id itself* only to
disambiguate (e.g. `arab-revolt-1936`); hierarchy is expressed by `parentId`,
never by filename.

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
  "sources": [
    { "title": { "he": "ויקיפדיה העברית" }, "url": "https://he.wikipedia.org/wiki/מלחמת_העצמאות", "kind": "encyclopedia" }
  ]
}
```

## Build pipeline

```
content/**/*.json
   │  scripts/validate-content.ts   (Zod parse per file → aggregate all errors, not fail-fast)
   │    • schema validity, date well-formedness (start ≤ end), importance ∈ [1,100]
   │    • referential integrity: every *Id resolves; parentId acyclic
   │    • uniqueness of ids; filename/id mismatch warnings
   │    • ≥1 source per entity; every source needs an http(s) non-placeholder url
   │    • no future dates; lifespan ≤ ~120y (warn); sub-event overlaps parent (warn)
   │    • relations: no self-loops; duplicate edges (warn); no duplicate ids in a ref list (warn)
   │    • projectability: every entity yields a finite timeline span
   ▼
scripts/build-content.ts
   │    • verify refs again, then assemble + DatasetSchema-parse the artifact
   │    • precompute reverse indexes (personId → workIds, parentId → childIds,
   │      region → descendants)
   │    • sort each entity list by timeline start (the app relies on this)
   │    • taxonomy colors must resolve to --cat-* tokens in src/styles/tokens.css
   ▼
public/data/dataset.json          (stable name — dev server)
public/data/dataset.<hash>.json   (content-addressed — production, see performance.md)
public/data/dataset.meta.json     (schemaVersion, counts, content hash, build time)
```

Both scripts run in CI on every PR and as a pre-step of `npm run dev` / `npm run
build`. Locally: `npm run content:validate` and `npm run content:build` (see
[development](development.md)).

## Sourcing

The content is **curated, not comprehensive**, and must be traceable. Every
entity carries a `sources: Source[]` (shape in [domain](domain.md#sourcing)) —
one unified list of cited references, each a real place the reader can go.
Authoring rules (decisions D15, D18):

- **Every entity cites ≥1 source** (build error otherwise). A source is `{ title, url, publisher?, kind? }`.
- **Every source needs a real, stable `url`** (decision D18) — a citation with no reachable page doesn't help the reader, so unlinked sources are rejected at build. This folds the old related-`links` list into `sources`: there is now a single "מקורות וקישורים" section, not two.
- **Do not invent** dates, biographies, authors, coverage periods, places, or sources. If a fact is uncertain or disputed, use the `approx` date flag, hedge the description, and prefer a stronger source. Don't fabricate a `url` to satisfy the rule — cite a page you can confirm exists (a Hebrew-Wikipedia article on a notable topic is reliable) rather than guess a deep link.
- **Prefer authoritative institutions** — national libraries (the National Library of Israel), archives, universities, museums and memorial institutions (Yad Vashem), established encyclopedias (Britannica), the Knesset/government records, established publishers. Wikipedia may aid discovery but important or disputed facts should lean on stronger sources.
- Placeholder URLs (containing `...`, `example.com`) and non-http(s) URLs are rejected at build.
- Descriptions stay **concise and discovery-oriented**; the source, not the description, carries the authority. The UI shows a curation disclaimer so users know the set is a representative selection.

Validation cannot prove historical truth — it enforces that a claim is *sourced
and structurally sound*, not that it is correct. Accuracy remains a human
content-review responsibility.

## Media

`image` (any entity) and `video` (events only, decision D19) are optional,
illustrative, and **always external links — never stored in the repo**:

- **Images**: prefer a Wikimedia Commons direct file URL
  (`upload.wikimedia.org/wikipedia/commons/...`) — stable, hotlink-safe, and
  how Wikipedia itself embeds them. For sensitive subjects, an authoritative
  institutional source (e.g. Yad Vashem) is preferred when it offers a stable
  hotlinkable URL. Every image needs a Hebrew `alt` and a `credit` naming the
  source/license.
- **Video**: `{ provider: "youtube", videoId, title, credit? }` only — the
  schema rejects a raw URL or embed HTML (see
  [domain.md#media](domain.md#media)). Use only reputable channels (national
  archives, established news organizations, official government/institutional
  channels); skip the field entirely rather than link a dubious-rights
  re-upload or low quality footage.
- Media is illustrative — it does not substitute for the required `sources[]`
  citation, and a candidate URL should be verified to actually resolve before
  it's authored, the same discipline as a source `url`.
- Not every entity needs media, and most won't — add it only where a real,
  well-attributed, good-quality item exists.

## Manual authoring workflow

1. Copy a template from `content/_templates/` (one per entity type, with Hebrew field guidance in `_`-prefixed keys that the loader strips).
2. Fill in Hebrew text; assign `importance` using the rubric in [zoom.md](zoom.md#importance-rubric) — the rubric, not gut feeling, keeps zoom coherent across authors.
3. Run `npm run content:validate`.
4. Open a PR; CI validates; preview build; merge to `main` deploys.

## Designed for future ingestion

The same layout is the landing zone for automated generation later: a generator
(LLM-assisted or scraped) emits candidate JSON files on a branch → the *same*
validator gates them → a human reviews the PR. No new infrastructure is needed
until content volume outgrows static JSON, at which point `content/` migrates
into a database and `build-content.ts` becomes the import script — the file
format is the migration format.
