---
name: add
description: >
  Add historical topics to the ציר הזמן content system as fully researched, fact-verified,
  deduplicated, importance-calibrated, Hebrew-authored, sourced, and build-validated entries
  (events, and when the topic is a person or a book — people/works). Use this whenever the user
  asks to add content to the timeline: "הוסף", "תוסיף", "/add", "add X to the timeline",
  a bare topic name, or a list/file of topics — even when they don't say "event" explicitly.
  Handles a single topic or batches of any size (including ~20+) without shallow work.
---

# /add — add historical topics completely and correctly

You are adding curated content to a Hebrew historical timeline (Israel 1930–2000 first scope).
"Added" means the topic went through the **whole** pipeline below and the repo's validation +
tests pass with the new content in place. Anything less is not an addition — it is a skipped
topic with a reason in the report.

Base directory of this skill (`<skill-dir>`): the folder containing this SKILL.md.

## Non-negotiable invariants

These exist because the repo's production test suite (`scripts/production-content.test.ts`)
runs the real `content/` tree and **fails on any validation error OR warning**, and because
the dataset is a curated historical record — a wrong date or invented "fact" is worse than
no entry at all.

1. **Never invent facts** — dates, actors, casualty numbers, precision, URLs, images, licenses.
   Every fact you author must come from a source page you actually opened this session.
   A year-only date stays `"YYYY"`; use `"approx": true` for circa dates. Don't guess deep links.
2. **All-or-nothing per topic** — never write a partial entry "to fix later". A topic's file is
   written only after its checklist (references/checklist.md) fully passes; otherwise the topic
   is reported as not-added with the concrete reason.
3. **Zero-warning discipline** — validator *warnings* (filename≠id, sub-event importance ≥
   parent, sub-event period outside parent, duplicate relation edges, duplicate ids in a ref
   list) fail the production tests. Treat warnings as errors.
4. **Duplicates are never re-added** — and existing entries are never modified unless the user
   explicitly asked for enrichment.
5. **Chat output and the final report are in English** (repo convention, hook-enforced);
   all authored content fields are Hebrew.
6. **Never commit or push** — leave the work as reviewable uncommitted changes (repo rule;
   the user commits explicitly, e.g. via /push).

## Input

Accept any of: a single topic, a comma/`ו`-separated or newline/bullet list, or a path to a
file containing a list. Normalize to an ordered topic list before starting and show it. Topics
are usually events; if a topic is clearly a person or a published work, the same pipeline
applies with the person/work template and rules (see "People and works" below).

## Orientation (once per invocation)

1. Build the inventory: `node "<skill-dir>/scripts/list-events.mjs"` (run from the repo root).
   This prints every existing event/person/work with id, dates, importance, categories, parent
   and Hebrew title — it is your duplicate-detection index AND importance-calibration ladder.
   Do not rely on `events-summary.md` (untracked, may be stale).
2. Read `content/_templates/event.json` (and person/work templates if needed) and
   `<skill-dir>/references/checklist.md`.
3. Confirm the tree starts green: `npm run content:validate` (0 errors, 0 warnings). If the
   environment lacks `node_modules`, set it up first (npm install, or link an existing one).
   If the tree starts red, stop and tell the user — don't build on a broken baseline.

## Per-topic pipeline

Every topic goes through all eight steps, in every mode (single, small batch, large batch).

1. **Research** — search Hebrew + English; open at least two independent, reliable pages
   (Hebrew Wikipedia is a fine anchor for notable topics; prefer adding an institutional page:
   National Library, Knesset, gov.il, Yad Vashem, IDI, museums, academia). Record each core
   fact (what/when/where/who/outcome) together with the URL that supports it. Verify every
   URL you intend to cite by opening it. references/research-brief.md defines the exact
   "dossier" this step must produce.
2. **Dedup** — scan the inventory for: likely id slugs, Hebrew title substrings, and
   same-category events in the same period. The batch itself counts: check earlier topics in
   this invocation too. A duplicate → status `duplicate-of:<id>`, move on.
3. **Frame** — entity type (event/person/work); hierarchy: if a curated parent exists
   (e.g. a battle inside מלחמת לבנון הראשונה), set `parentId` — the child's period must
   overlap the parent's and its importance must be strictly lower. Scope check: the timeline
   is Israel 1930–2000; a topic outside that window is not added silently — flag it and let
   the user decide (person lifespans may start earlier; that's fine).
   Ambiguity check: the topic must map to exactly one well-defined referent. If research
   reveals several (e.g. "אסון צור" is two separate disasters, 1982 and 1983), either add
   each as its own properly-sourced entry or report the ambiguity — never silently pick one.
4. **Classify** — 1–2 `categoryIds` from `content/taxonomies/event-categories.json`
   (first category drives the item color). Never invent a category — a new category needs a
   CSS token and is a design decision; flag it instead.
5. **Score** — follow the calibration protocol in references/scoring.md: nearest-neighbor
   table from the inventory → rubric band → integer. Record the one-line rationale for the
   report. Do not inflate scores to "make it visible" — low-importance items still render
   as dots by design.
6. **Author** — Hebrew `title` (short; use gershayim ״ in acronyms: מפא״י, צה״ל) and
   `description` (1–3 sentences in the corpus voice: concrete facts with dates, then a
   significance clause after a semicolon). Dates at sourced precision only. `id` is a unique
   kebab-case ASCII slug (year suffix only to disambiguate; hierarchy via parentId, never via
   filename). 1–3 verified `sources` with `kind` (and `publisher` when distinct). Image/video
   per the media rules in checklist.md — an image is expected for importance ≥70 (that is the
   existing corpus convention), and must be a verified Wikimedia-Commons direct file URL with
   checked license, Hebrew alt, and credit; when in doubt, omit media.
7. **Write** — create `content/events/<id>.json` with the Write tool (UTF-8, 2-space indent,
   key order: id, type, title, description, dates, parentId?, importance, categoryIds, tags?,
   image?, video?, sources). Filename must equal `id`. Well-grounded person↔event edges
   (existing people only, 0–3, no duplicates) are appended to `content/relations.json` in its
   one-line-per-edge style.
8. **Validate** — `npm run content:validate` must report 0 errors and 0 warnings. If it
   doesn't, fix or revert this topic's files before moving on.

## Batch protocol

Why a protocol at all: one invocation that researches 20 topics with all their raw sources in
context at once exhausts the window mid-batch — the failure mode that produces shallow
research, skipped fields, and score drift. The cure is **context hygiene**, not parallelism:
one topic fully in focus at a time, its research dropped before the next begins, with a
manifest on disk carrying the small amount of state that must survive between topics.

**Default for any size (1 topic or 30): sequential with a manifest.** This is the reliable
path — it never stalls, its token cost is predictable, it survives context compaction, and it
works identically whether `/add` runs in a main session or as a subagent.

- **Manifest:** create `add-manifest.json` in the session scratchpad (never inside the repo),
  one entry per topic: `{ topic, status, id?, decisions?, reason? }`; statuses
  `pending → researched → written → validated`, or `duplicate-of:<id>` / `not-added:<reason>`
  / `needs-decision:<question>`. Update it after each topic — it is the resumable source of
  truth for the final report even if the conversation is compacted.
- **Pre-pass (whole batch, cheap — no deep research yet):** normalize the topic list; dedup
  against the repo inventory AND within the batch; spot hierarchy pairs (topic A a parent of
  topic B); assign each topic a rough rubric band so siblings are scored relative to each
  other, not in isolation. Record this in the manifest.
- **Then one topic at a time:** run the full eight-step pipeline for a single topic —
  research → checklist → calibrate (against the pre-pass bands) → write → `content:validate`
  (0/0) → update manifest. Only then move on, deliberately letting that topic's raw sources
  fall out of focus. Never carry half-finished topics forward in parallel.
- Validate after **every** topic, not just at the end, so a mistake is caught against a known
  green baseline while you still remember the topic.

**Optional accelerator — synchronous research subagents (only when ALL of these hold):** you
are confident you're in a main session (not yourself a subagent), the Agent tool is available,
and the batch is large enough (roughly ≥8) that orientation-per-topic dominates. Then you may
delegate *research only* (never writing) to subagents using the prompt in
references/research-brief.md — but **call them synchronously and consume their results in the
same turn**. Spawn a wave, wait for that wave's results to return to you, verify and write
them, then spawn the next wave. Never launch background/fire-and-forget research agents and
end your turn to "wait for notifications": a subagent that stops with pending background
children is not reliably re-woken, so the batch silently stalls and the work is lost. If you
cannot guarantee synchronous consumption, use the sequential default — it is not the fallback,
it is the primary design. A single writer (you) always does all file writes and the one
`relations.json` edit, so formatting, scoring, and edges stay uniform and conflict-free.

## People and works

Same pipeline, different template and rules: people need `lifespan.end` explicitly (`null`
while alive — an omitted end is invalid), ≥1 category from person-categories, and bios in the
same 1–3 sentence voice. Works are positioned by `coveredPeriod` (what the work is *about*),
not `publicationDate` (decision D7); most works score 20–39; a work needs `authorPersonIds`
and/or `authorName`. Never create a person just to satisfy a relation — relations link
existing entities only; missing people go in the report as suggestions.

## Final gates (once per invocation)

1. `npm run content:validate` → 0 errors, 0 warnings.
2. `npm test` (Vitest, includes the production content gate). E2E is not required for
   content-only changes.
3. `git status --short` to enumerate exactly what was created/modified. Do not commit.

## Report (always, exactly this structure)

```
## Added
| Topic | id | Date | Category | Importance | Image | Relations |
(one row per added entity; importance column includes the calibration anchor, e.g. "52 — between first-knesset 50 and law-of-return 65")

## Skipped / needs decision
| Topic | Status | Why |
(duplicates with the existing id; out-of-scope; ambiguous; insufficient sources — every input topic appears in exactly one of the two tables)

## Sources used
- <topic>: <url> (<what it supported>), …

## Verification
- content:validate: <result>
- npm test: <result>
- files: <git status --short of content changes>

## Decisions & open questions
(scoring rationales, disambiguations, suggested-but-not-created people, media omitted and why)
```

## Reference files

- `references/checklist.md` — the pre-write gate; read it during orientation, apply per topic.
- `references/scoring.md` — importance calibration protocol + worked example (הקמת מפא״י).
- `references/research-brief.md` — research dossier definition + subagent prompt template.
- `scripts/list-events.mjs` — inventory/calibration index of the current content tree.
