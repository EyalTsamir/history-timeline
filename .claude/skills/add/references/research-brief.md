# Research brief — the dossier every topic must produce

Research is the step where invented facts would enter the dataset, so it has a fixed output
contract: a **dossier** that separates *claims* from *evidence*. The orchestrator (or you, in
inline mode) verifies the dossier against references/checklist.md before anything is written.

## Dossier shape

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
  "urlChecks": [ { "url": "https://...", "opened": true, "correctPage": true } ],
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

Rules baked into the shape:

- Every load-bearing fact in `proposal` (the date above all) must have a matching `evidence`
  entry with a real quote from a page that was actually opened. No evidence → the fact does
  not go in the proposal.
- `duplicateOf` is set when the referent already exists in the inventory (then the rest may
  be minimal). `ambiguity` is set when the topic has multiple referents — name them and stop;
  the orchestrator decides (usually: one entry per referent, or a question to the user).
- `importance` in the proposal is a *proposal*; final calibration happens centrally
  (references/scoring.md) so batches stay consistent.
- `imageCandidates` only from Wikimedia Commons (or an institution's explicitly hotlinkable
  archive), each with the license as read on the file's own description page. Empty list is
  the normal case for topics under importance 70.
- `relationCandidates.from` must be ids that exist in the provided inventory — never new ids.

## Subagent prompt template (orchestrated mode)

Spawn one general-purpose agent per topic (waves of ≤4). Fill `{...}` slots. Researchers get
the inventory rows they need — they do not re-derive repo conventions.

```
Research the historical topic "{TOPIC}" for a curated Hebrew timeline of Israel 1930–2000,
and return ONLY a JSON dossier (no prose) in the exact shape below.

Method — this is a fact-verification task, not a summary task:
1. Search Hebrew and English (the Hebrew name is authoritative). Open at least two
   independent reliable pages: Hebrew Wikipedia is a good anchor; also try the National
   Library of Israel, Knesset/gov.il, Yad Vashem, IDI, museums, universities, established
   press archives.
2. For every core fact (what/when/where/who/outcome) record the supporting URL and a short
   verbatim quote. The event date must be supported by a quote at the SAME precision you
   claim: claim a day only if a page states the day. If sources disagree, say so in
   openQuestions instead of picking silently.
3. Verify every URL you cite by opening it and confirming it is the right page. Never guess
   a deep link. 1–3 sources, prefer one institutional + Hebrew Wikipedia.
4. Hebrew authoring: title short with gershayim ״ in acronyms; description 1–3 sentences,
   concrete dated facts then a significance clause. Write natural, precise Hebrew.
5. Duplicates/ambiguity: the current timeline inventory is below. If the topic is already
   there, set duplicateOf. If the name denotes more than one historical referent, set
   ambiguity and list them.
6. Image: optional. Only Wikimedia Commons direct-file URLs whose file page you opened and
   whose license you read. Otherwise return an empty list.
7. Relations: 0–3 candidates, only person ids that appear in the inventory below.

Repo facts you need: categories = {CATEGORY_IDS_WITH_MEANINGS}; date format
"YYYY"|"YYYY-MM"|"YYYY-MM-DD" (+optional end, approx); importance is 1–100 but your value is
only a proposal — include scoreRationale with 2–3 anchors from the inventory.

Inventory (id | dates | importance | categories | title):
{INVENTORY_ROWS}

Dossier shape:
{DOSSIER_JSON_SHAPE}

Return the dossier JSON as your entire final message.
```

## Verifying a dossier (orchestrator duties)

- Cross-check the proposal's date/precision against the dossier's own quotes; spot-check one
  cited URL yourself when confidence < high or the topic is sensitive/disputed.
- Reject (→ retry with pointed instructions, or mark not-added) when: evidence quotes don't
  support the claims, fewer than 2 real pages were opened, URLs failed verification, the
  Hebrew reads translated-from-English, or `confidence: low`.
- Then: dedup again (batch siblings may have landed first), calibrate importance, and only
  then write files.
