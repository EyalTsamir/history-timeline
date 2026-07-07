# Authoring reference — pre-write checklist, scoring, research handoff

## Pre-write checklist — a topic is written only when every line passes

This is the gate between "researched" and "written". If any line fails and can't be fixed
with the evidence at hand, the topic is **not added** (report it with the failing line as the
reason). The repo's production tests treat validator warnings as failures, so several lines
below that look like style are actually hard requirements.

### Facts & sources

- Core facts (what happened, when, where, key actors, outcome) are confirmed by the **anchor
  source you actually opened this session** — normally a solid Hebrew-Wikipedia article (the
  REST-API extract counts as opening it). A **second independent page is required only** when
  the topic is obscure or thinly covered, sources may disagree, or a claim is
  sensitive/disputed. Each fact in the description traces to a recorded URL.
- Date precision equals source precision: a day (`YYYY-MM-DD`) only when sources state the
  day; `approx: true` when sources say בקירוב / rounded years; `end` omitted for point-in-time
  events; `end` present for real ranges and `start ≤ end`.
- The topic maps to **exactly one** well-defined historical referent. If the name covers
  several (two disasters, a recurring festival, a long process), split into separate entries
  or report `needs-decision` — never average them into one entry.
- 1–3 `sources` (one is the normal case for notable topics), each with: Hebrew `title`, a
  **real URL you opened and saw resolve to the right page**, percent-encoded where it contains
  characters that aren't URL-safe — a Hebrew-Wikipedia article whose title has a
  quote/acronym (e.g. `מפא״י`) must encode the `"`/`״`
  (`.../wiki/%D7%9E%D7%A4%D7%90%22%D7%99`), never carry a raw `"`; `kind` from
  `archive|library|museum|encyclopedia|reference|academic|government|book|press|website`,
  and `publisher` when it adds information. No placeholder patterns (`...`, example.com,
  guessed deep links). An institutional source (NLI, Knesset, gov.il, Yad Vashem, IDI,
  museum, university) is a welcome addition when you confirmed a real page — not a
  requirement.

### Repo fit

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

### Authoring quality

- `title.he`: short (fits a timeline card), natural Hebrew, gershayim ״ inside acronyms
  (מפא״י, צה״ל, האו״ם); no dates in the title unless part of the accepted name.
- `description.he`: 1–3 sentences in the corpus voice — concrete facts with explicit dates
  ("ב־5 בינואר 1930…"), then a significance clause (often after a semicolon). No filler, no
  editorializing beyond sourced assessments.
- `importance`: integer 1–100 assigned via the calibration protocol below, with a one-line
  rationale recorded for the report. Not a template default, not a plateau value repeated
  across the whole batch.
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

### Writing mechanics

- File created with the Write tool (UTF-8, no BOM — never via PowerShell redirection),
  2-space indent, key order: `id, type, title, description, dates, parentId?, importance,
  categoryIds, tags?, image?, video?, sources`. Include optional keys only when present.
- `relations.json`: append edges in the file's existing one-line-per-edge style, keeping the
  array valid JSON.

## Importance scoring — calibration protocol

`importance` (integer 1–100) is the single number that decides how loudly an item renders at
each zoom altitude (docs/spec/zoom.md). It never decides *whether* an item shows — presence
is guaranteed; low scores render as dots. So score for **historical weight relative to the
existing corpus**, never for visibility.

### The rubric (docs/spec/zoom.md)

| Range | Meaning | Existing examples |
|---|---|---|
| 90–100 | Era-defining; carries the century view | הכרזת העצמאות 100, מלחמת העצמאות 95, מלחמת ששת הימים 92, השואה 88* |
| 70–89 | Major national events | הסכם אוסלו 82, השלום עם מצרים 80, מלחמת לבנון הראשונה 78, מבצע קדש 72, המרד הערבי 70 |
| 40–69 | Notable events, sub-events of the top tier | המהפך 68, חוק השבות 65, תוכנית הייצוב 62, מבצע יונתן 60, הכנסת הראשונה 50, משטר הצנע 46 |
| 20–39 | Contextual detail (decade/year altitude) | ואדי סאליב 38, גוש אמונים 34, ועדת אגרנט 32, עליית הנוער 28, אירוויזיון 1978 24 |
| 1–19 | Fine detail (year altitude only) | ביטול הלביא 19, ייבוש החולה 18, הסכם ההעברה 17, אילת 15, אסון גשר המכביה 15 |

\* rubric examples are events; people and works use the same bands (most works sit 20–39 by
design — decision in zoom.md — with only canonical works reaching ~44–50).

### Protocol (apply per topic, mechanically)

1. **Neighbors first.** From the inventory (`scripts/list-events.mjs` output), pull 5–8
   existing entries that are the closest comparisons: same category, similar kind (war /
   law / founding / disaster / cultural moment), similar era. Write them down with scores.
2. **Pick the band** from the rubric by asking what altitude should *name* this item:
   era-defining (≥90) is essentially closed for this corpus — new additions are almost never
   there; "major national" (70–89) means a typical museum wall would label it a defining
   national event **and** obliges an image (corpus convention); most new additions land in
   40–69 or 20–39; use 1–19 deliberately for fine texture, it is a thin but real band.
3. **Slot between neighbors.** The number must read correctly as a comparison: if it scores
   above X it claims to matter more than X. Check the claim against 2–3 specific neighbors.
4. **Structural constraints:** a sub-event scores strictly below its parent (validator warns →
   tests fail). Within a batch, rank sibling topics against each other *before* fixing
   numbers, so the batch doesn't land on one plateau value.
5. **Record a one-line rationale** naming the anchors, e.g. "52 — above הכנסת הראשונה (50)
   as the founding act of the party that governed for ~47 years; below חוק השבות (65)".

### Worked example — הקמת מפא״י (January 1930)

- Neighbors: המהפך 68 (end of Mapai-era rule), חוק השבות 65, הכנסת הראשונה 50,
  לוי אשכול לרה״מ 30, הקמת גוש אמונים 34, הקמת שלום עכשיו 24.
- Band: the founding of the party that dominated the Yishuv and the state for ~47 years is a
  "notable event" with major long-run consequences — not itself an era-defining moment like
  the events it enabled. Band 40–69.
- Slot: clearly above party/movement foundings like גוש אמונים (34); at least as significant
  as כינון הכנסת הראשונה (50); below חוק השבות (65) and המהפך (68).
- → **importance ≈ 50–55** (e.g. 52), rationale recorded. No image obligation (<70), though a
  verified PD photo of the founding conference would be acceptable.

### Batch anti-drift rules

- Assign rubric bands for all batch siblings together (in the pre-pass for ≥5-topic batches;
  before fixing any number in smaller ones) — never score topic #14 without its batch
  siblings on screen.
- Distributions matter: the corpus is a pyramid (~6 items ≥90, ~21 at 70–89, ~66 at 40–69,
  ~47 at 20–39, ~8 at 1–19 across all entity types). A 20-topic batch that lands 15 items in
  70–89 is mis-calibrated — most curated additions belong at 20–69.
- If two batch topics feel equal, make them equal — then check both against the same existing
  neighbor rather than nudging one up "for variety".

## Subagent research handoff (orchestrated mode only)

Used only by SKILL.md's optional batch accelerator. Researchers research and return data;
the orchestrator verifies, calibrates, and writes. In inline mode (the default), skip this
section entirely — research and author directly, no intermediate dossier.

Each researcher returns ONLY this JSON (no prose) as its entire final message:

```json
{
  "topic": "<the input topic, verbatim>",
  "entityType": "event | person | work",
  "confidence": "high | medium | low",
  "duplicateOf": null,
  "ambiguity": null,
  "proposal": {
    "id": "kebab-slug",
    "type": "event",
    "title": { "he": "..." },
    "description": { "he": "1–3 sentences, corpus voice" },
    "dates": { "start": "YYYY[-MM[-DD]]", "end": "...optional", "approx": false },
    "parentId": "only-if-a-curated-parent-exists",
    "importance": 0,
    "categoryIds": ["..."],
    "sources": [ { "title": { "he": "..." }, "publisher": "...", "url": "https://...", "kind": "..." } ]
  },
  "evidence": [
    { "fact": "founding conference opened 5 January 1930 in Tel Aviv", "url": "https://...", "quote": "<short verbatim snippet>" }
  ],
  "imageCandidates": [
    { "src": "https://upload.wikimedia.org/wikipedia/commons/...", "filePage": "https://commons.wikimedia.org/wiki/File:...", "license": "PD / CC-BY-SA 3.0 / ...", "altHe": "...", "credit": "צילום: ..., רישיון ..." }
  ],
  "relationCandidates": [
    { "from": "<EXISTING person id from the inventory>", "type": "led | participated-in | influenced | related-to", "noteHe": "..." }
  ],
  "openQuestions": [],
  "scoreRationale": "proposed X — anchors: <neighbor> N, <neighbor> M"
}
```

When spawning a researcher (waves of ≤4, general-purpose agents), the prompt must include:

- The lean research method: start from the Hebrew-Wikipedia REST summary
  (`https://he.wikipedia.org/api/rest_v1/page/summary/<percent-encoded title>`), escalate to
  full pages only for facts the extract doesn't settle; one anchor source suffices for a
  notable topic; a second independent page only if the topic is obscure, contested, or
  thinly covered. Never cite a URL that wasn't opened (API extract counts for the article).
- The evidence rule: every load-bearing fact in `proposal` (the date above all) needs a
  matching `evidence` entry with a real quote at the SAME precision as the claim (claim a
  day only if a page states the day). Source disagreements go in `openQuestions`, never
  silently resolved. No evidence → the fact does not go in the proposal.
- `duplicateOf` is set when the referent already exists in the inventory (then the rest may
  be minimal). `ambiguity` is set when the topic has multiple referents — name them and stop.
- Hebrew authoring rules: short title with gershayim ״ in acronyms; description 1–3
  sentences, concrete dated facts then a significance clause; natural, precise Hebrew.
- Repo facts: the category ids with meanings, the date format
  (`"YYYY"|"YYYY-MM"|"YYYY-MM-DD"` + optional `end`, `approx`), and the inventory rows
  (id | dates | importance | categories | title) for dedup, relations, and score anchors.
- `imageCandidates` only from Wikimedia Commons with the license as read on the file's own
  description page (empty list is the normal case under importance 70).
  `relationCandidates.from` only ids that exist in the provided inventory. `importance` is
  only a proposal — final calibration happens centrally so batches stay consistent.

### Verifying a returned dossier (orchestrator duties)

- Cross-check the proposal's date/precision against the dossier's own quotes; spot-check one
  cited URL yourself when confidence < high or the topic is sensitive/disputed.
- Reject (→ retry with pointed instructions, or mark not-added) when: evidence quotes don't
  support the claims, URLs failed verification, the Hebrew reads translated-from-English, or
  `confidence: low`.
- Then: dedup again (batch siblings may have landed first), calibrate importance centrally,
  and only then write files.
