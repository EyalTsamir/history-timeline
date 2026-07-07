# Pre-write checklist — a topic is written only when every line passes

This is the gate between "researched" and "written". If any line fails and can't be fixed
with the evidence at hand, the topic is **not added** (report it with the failing line as the
reason). The repo's production tests treat validator warnings as failures, so several lines
below that look like style are actually hard requirements.

## Facts & sources

- Core facts (what happened, when, where, key actors, outcome) are confirmed by **at least
  two independent pages you opened this session**, or one clearly authoritative institutional
  page plus hedged phrasing. Each fact in the description traces to a recorded URL.
- Date precision equals source precision: a day (`YYYY-MM-DD`) only when sources state the
  day; `approx: true` when sources say בקירוב / rounded years; `end` omitted for point-in-time
  events; `end` present for real ranges and `start ≤ end`.
- The topic maps to **exactly one** well-defined historical referent. If the name covers
  several (two disasters, a recurring festival, a long process), split into separate entries
  or report `needs-decision` — never average them into one entry.
- 1–3 `sources`, each with: Hebrew `title`, a **real URL you opened and saw resolve to the
  right page**, percent-encoded where it contains characters that aren't URL-safe — a
  Hebrew-Wikipedia article whose title has a quote/acronym (e.g. `מפא״י`) must encode the
  `"`/`״` (`.../wiki/%D7%9E%D7%A4%D7%90%22%D7%99`), never carry a raw `"`; `kind` from
  `archive|library|museum|encyclopedia|reference|academic|government|book|press|website`,
  and `publisher` when it adds information. No placeholder patterns (`...`, example.com,
  guessed deep links). Hebrew-Wikipedia article URLs are reliable for notable topics; prefer
  adding one institutional source (NLI, Knesset, gov.il, Yad Vashem, IDI, museum, university)
  when you confirmed a real page.

## Repo fit

- `id` is a kebab-case ASCII slug, unique across **all** entity types and taxonomies
  (checked against the inventory); a year appears in the id only to disambiguate
  (`arab-revolt-1936`), never to express hierarchy. Filename equals `id` exactly.
- Not a duplicate: no existing entry shares the referent (check Hebrew title substrings,
  same category + same period, plausible alternate slugs). Also not a duplicate of an earlier
  topic in this same batch.
- Hierarchy: if the event belongs inside a curated parent event, `parentId` is set, the
  child's period overlaps the parent's period, and the child's importance is **strictly
  lower** than the parent's (both are validator warnings = test failures otherwise).
- Scope: event dates fall within Israel 1930–2000 (the current curated scope). Out-of-scope
  topics are `needs-decision`, not silent additions. No future dates anywhere.
- `categoryIds`: 1–2 ids that exist in `content/taxonomies/event-categories.json`, most
  specific first (the first drives the color); no duplicates within the list.

## Authoring quality

- `title.he`: short (fits a timeline card), natural Hebrew, gershayim ״ inside acronyms
  (מפא״י, צה״ל, האו״ם); no dates in the title unless part of the accepted name.
- `description.he`: 1–3 sentences in the corpus voice — concrete facts with explicit dates
  ("ב־5 בינואר 1930…"), then a significance clause (often after a semicolon). No filler, no
  editorializing beyond sourced assessments.
- `importance`: integer 1–100 assigned via references/scoring.md, with a one-line rationale
  recorded for the report. Not a template default, not a plateau value repeated across the
  whole batch.
- Image: **expected when importance ≥ 70** (every existing ≥70 event has one — keep that
  convention); below 70 add one only when an excellent, clearly-licensed candidate exists.
  Requirements: `src` is a direct file URL on `upload.wikimedia.org/wikipedia/commons/...`
  that you verified loads; the file's Commons description page shows public-domain or CC
  license; `alt.he` describes the picture (not the event); `credit` names photographer/source
  and license (e.g. "צילום: רודי ויסנשטיין, נחלת הכלל"). Anything unverifiable → omit `image`.
- Video: almost always omit. Only for real archival footage on a reputable channel (national
  archive, Knesset, established broadcaster): `{ provider: "youtube", videoId: <11 chars>,
  title.he, credit }`.
- Relations (optional, 0–3): `from` is an **existing** person id, `to` is the new event id,
  `type` ∈ `participated-in|led|influenced|related-to`, `note.he` states the role in a few
  words. No duplicate `(from,to,type)` edges. People who belong here but don't exist in
  `content/people/` are report suggestions, never auto-created.

## Writing mechanics

- File created with the Write tool (UTF-8, no BOM — never via PowerShell redirection),
  2-space indent, key order: `id, type, title, description, dates, parentId?, importance,
  categoryIds, tags?, image?, video?, sources`. Include optional keys only when present.
- `relations.json`: append edges in the file's existing one-line-per-edge style, keeping the
  array valid JSON.
- After writing: `npm run content:validate` → **0 errors and 0 warnings** before the topic is
  marked done.
