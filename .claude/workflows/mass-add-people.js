export const meta = {
  name: 'mass-add-people',
  description: 'Mass-add historical people surfaced as relation candidates during the WWII/1948/1950s event batch: dedup check, parallel lean research (reusing recovered event+role context), central calibration, batched writes, relations linking, final gates',
  phases: [
    { title: 'Dedup', detail: 'inventory check + id slugs + category/band hints', model: 'sonnet' },
    { title: 'Research', detail: 'one lean researcher per person, seeded with known role', model: 'sonnet' },
    { title: 'Calibrate', detail: 'central importance calibration (main model)' },
    { title: 'Write', detail: 'sequential writer batches, validate each', model: 'sonnet' },
    { title: 'Finalize', detail: 'relations pass (now that people exist) + final gates', model: 'sonnet' },
  ],
}

const PEOPLE = __PEOPLE_JSON__
const REPO = 'c:/Projects/HistoryTimeLine'
const INV_CMD = 'node "' + REPO + '/.claude/skills/add/scripts/list-events.mjs"'
const AUTHORING = REPO + '/.claude/skills/add/references/authoring.md'
const PERSON_CATS = REPO + '/content/taxonomies/person-categories.json'

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

const DEDUP_SCHEMA = {
  type: 'object', required: ['rows'],
  properties: { rows: { type: 'array', items: { type: 'object', required: ['name', 'action'], properties: {
    name: { type: 'string' },
    action: { enum: ['research', 'duplicate'] },
    duplicateOf: { type: 'string' },
    idSuggestion: { type: 'string' },
    categoryHint: { enum: ['leaders', 'military', 'writers', 'artists', 'pioneers', 'scientists', 'religious'] },
    band: { type: 'integer' },
  } } } },
}

const DOSSIER_SCHEMA = {
  type: 'object', required: ['name', 'status'],
  properties: {
    name: { type: 'string' },
    status: { enum: ['ok', 'duplicate', 'insufficient-sources'] },
    duplicateOf: { type: 'string' },
    proposal: { type: 'object' },
    evidence: { type: 'array', items: { type: 'object', required: ['fact', 'url'], properties: {
      fact: { type: 'string' }, url: { type: 'string' }, quote: { type: 'string' } } } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    scoreRationale: { type: 'string' },
  },
}

const CALIBRATION_SCHEMA = {
  type: 'object', required: ['rows'],
  properties: { rows: { type: 'array', items: { type: 'object', required: ['id', 'importance'], properties: {
    id: { type: 'string' }, importance: { type: 'integer' }, rationale: { type: 'string' } } } } },
}

const WRITER_SCHEMA = {
  type: 'object', required: ['results', 'validate'],
  properties: {
    results: { type: 'array', items: { type: 'object', required: ['id', 'status'], properties: {
      id: { type: 'string' }, status: { enum: ['written', 'skipped'] }, reason: { type: 'string' } } } },
    validate: { type: 'string' },
  },
}

const RELATIONS_SCHEMA = {
  type: 'object', required: ['added', 'validate'],
  properties: { added: { type: 'integer' }, droppedCandidates: { type: 'array', items: { type: 'string' } }, validate: { type: 'string' } },
}

const GATES_SCHEMA = {
  type: 'object', required: ['validate', 'tests', 'gitStatus'],
  properties: { validate: { type: 'string' }, tests: { type: 'string' }, gitStatus: { type: 'string' } },
}

// ---------- Phase 1: dedup + id/category/band pre-pass ----------
phase('Dedup')
log('Dedup pre-pass over ' + PEOPLE.length + ' candidate people')
const dedupChunks = await parallel(chunk(PEOPLE, 60).map((group, gi) => () => agent(
  'You are the dedup/id pre-pass for adding historical PEOPLE to a curated Hebrew timeline (Israel 1930-2000). Repo: ' + REPO + '\n' +
  'First run this to get the full inventory, including existing PEOPLE ids and Hebrew names: ' + INV_CMD + '\n' +
  'Also read ' + PERSON_CATS + ' for the exact category ids.\n\n' +
  'For EACH name below, each already tied to a specific event as a relation candidate (context given), decide:\n' +
  '- "duplicate" when this exact person already exists in the inventory under a different id/spelling (set duplicateOf to the existing id) - names ending in a parenthetical nickname or alternate surname (e.g. "X (Y)") refer to the SAME person as "X", check for both forms\n' +
  '- otherwise "research"\n' +
  'For "research" rows also assign: idSuggestion (unique kebab-case ASCII slug, e.g. an English transliteration of the name, not present in the inventory); categoryHint (best-fit from leaders|military|writers|artists|pioneers|scientists|religious based on their role in the note below); band = rough importance guess (integer 1-100; most of these are secondary/supporting figures relative to top-tier leaders already in the corpus - typical range 20-45, a few central commanders or heads of state may reach 45-60, only truly era-defining figures already at 90+ exist - rank based on how central their role/candidates note describes them, e.g. a division/front commander or government minister ranks higher than a company commander or single-mention aide).\n\n' +
  'Names with context (JSON, one entry per person, "candidates" lists every event+role they were tied to):\n' + JSON.stringify(group, null, 1),
  { label: 'dedup:' + (gi + 1), phase: 'Dedup', model: 'sonnet', schema: DEDUP_SCHEMA }
)))
const dedupRows = dedupChunks.filter(Boolean).flatMap(r => r.rows)
const seenIds = new Set()
for (const row of dedupRows) {
  if (row.action !== 'research') continue
  if (row.idSuggestion && seenIds.has(row.idSuggestion)) { row.action = 'duplicate'; row.duplicateOf = row.idSuggestion }
  else if (row.idSuggestion) seenIds.add(row.idSuggestion)
}
const byName = new Map(PEOPLE.map(p => [p.name, p]))
const toResearch = dedupRows.filter(r => r.action === 'research')
const preSkipped = dedupRows.filter(r => r.action !== 'research')
log('Dedup done: ' + toResearch.length + ' to research, ' + preSkipped.length + ' already exist (duplicate)')

// ---------- Phase 2: research (parallel) ----------
phase('Research')
const researcherPrompt = (row) => {
  const person = byName.get(row.name) || { candidates: [] }
  const eventsList = person.candidates.map(c => '- ' + c.eventId + ' (' + c.type + '): ' + c.noteHe).join('\n')
  return 'Research the historical PERSON "' + row.name + '" for a curated Hebrew timeline of Israel 1930-2000 and return a JSON dossier via StructuredOutput. This is fact-verification, not summarization. Repo: ' + REPO + '\n\n' +
  'This person was already identified as connected to these curated events (their role is a research LEAD, not a pre-verified fact - confirm it independently):\n' + eventsList + '\n\n' +
  'Lean method:\n' +
  '1. Start with the Hebrew-Wikipedia REST summary: https://he.wikipedia.org/api/rest_v1/page/summary/<percent-encoded article title> (WebFetch it). A correct on-topic extract also verifies the corresponding /wiki/ article URL for citation. Escalate to the full article or more pages ONLY for facts the extract does not settle (exact birth/death dates, precise role, disambiguation from same-named people).\n' +
  '2. One anchor source suffices for a notable person with a solid, uncontested article. Open a second independent page only if the person is obscure or thinly covered, sources may disagree, or the identity is ambiguous (common name). Never cite a URL you did not open.\n' +
  '3. lifespan.end is REQUIRED and must be explicit: an ISO year/month/day if deceased, or null if still alive - NEVER omit it. If a source states or strongly implies death (e.g. "killed in battle", "fell in the fighting" - note some of the leads above literally say this, tying death to the very event/date already in the corpus), use that as the death date at the precision available, but still corroborate via an opened source if possible. If you cannot determine with any confidence whether the person is alive or dead nor find a real source discussing their fate -> status "insufficient-sources" (do NOT invent or guess an end date).\n' +
  '4. If NO real source beyond the bare event mention can be found at all (no independent biographical footprint, not even a stub) -> status "insufficient-sources".\n' +
  '5. Every load-bearing fact in the proposal (lifespan dates, role) needs an evidence entry {fact, url, quote} with a short verbatim quote. Source disagreements go in openQuestions, never silently resolved.\n' +
  '6. Hebrew authoring: name.he as commonly spelled (drop parenthetical nicknames unless that IS the common form); bio.he 1-3 sentences - concrete facts (role, dates), then a significance clause; natural precise Hebrew, no filler.\n' +
  '7. sources: 1-3, each { title: {he}, url (a page you opened; percent-encode characters that are not URL-safe), kind: archive|library|museum|encyclopedia|reference|academic|government|book|press|website, publisher when it adds information }. No guessed deep links, no placeholders.\n' +
  '8. If this name actually refers to more than one distinct historical figure and you cannot tell which one the event context points to -> status "insufficient-sources" and explain in openQuestions.\n\n' +
  'Proposal fields: id "' + (row.idSuggestion || '') + '" (unless research shows it is wrong), type "person", name, bio, lifespan {start, end}, categoryIds (["' + (row.categoryHint || 'military') + '"] or a better fit from leaders|military|writers|artists|pioneers|scientists|religious, max 2), importance (your proposal near band ' + (row.band || 30) + ' - final calibration is central; include scoreRationale with 2-3 anchors from figures already in this corpus, e.g. abba-eban=48), sources.'
}
const dossiers = (await parallel(toResearch.map(row => () =>
  agent(researcherPrompt(row), { label: 'research:' + (row.idSuggestion || row.name).slice(0, 30), phase: 'Research', model: 'sonnet', schema: DOSSIER_SCHEMA })
))).filter(Boolean)
const okDossiers = dossiers.filter(d => d.status === 'ok' && d.proposal && d.proposal.id)
const problemDossiers = dossiers.filter(d => d.status !== 'ok')
log('Research done: ' + okDossiers.length + ' ok, ' + problemDossiers.length + ' flagged (duplicate/insufficient-sources)')

const writtenIds = new Set()
const writable = []
const collisions = []
for (const d of okDossiers) {
  if (writtenIds.has(d.proposal.id)) collisions.push({ id: d.proposal.id, name: d.name, status: 'skipped', reason: 'id collision within batch' })
  else { writtenIds.add(d.proposal.id); writable.push(d) }
}

// ---------- Phase 3: central calibration ----------
phase('Calibrate')
let calibrated = {}
if (writable.length) {
  const calRows = writable.map(d => {
    const pre = toResearch.find(r => r.idSuggestion === d.proposal.id) || {}
    return { id: d.proposal.id, name: (d.proposal.name && d.proposal.name.he) || d.name, band: pre.band, proposed: d.proposal.importance, rationale: d.scoreRationale || '' }
  })
  const cal = await agent(
    'You are the single importance calibrator for a batch of new PEOPLE entering a curated Hebrew timeline (Israel 1930-2000). Repo: ' + REPO + '\n' +
    'First read the "Importance scoring" section of ' + AUTHORING + ' (same rubric applies to people) and run ' + INV_CMD + ' to see the existing people ladder (e.g. abba-eban=48).\n' +
    'Below are the batch rows (id, name, pre-pass band, researcher-proposed importance, rationale). Return a final integer importance per id.\n' +
    'Rules: score for historical weight relative to the existing corpus, never for visibility; most of this batch are secondary/supporting figures (commanders, ministers, aides, foreign counterparts) so most should land 20-45; reserve 45-60 for genuinely central commanders/ministers/heads of state in these events; rank batch siblings against each other - no plateau of identical values, but genuinely equal-weight people may be equal; each score must read correctly as a comparison against 2-3 named existing-corpus anchors (put them in rationale).\n\n' +
    'Rows:\n' + JSON.stringify(calRows, null, 1),
    { label: 'calibrate:' + calRows.length + '-rows', phase: 'Calibrate', schema: CALIBRATION_SCHEMA }
  )
  if (cal) for (const r of cal.rows) calibrated[r.id] = r
  log('Calibration done for ' + Object.keys(calibrated).length + ' entries')
}

// ---------- Phase 4: sequential writer batches ----------
phase('Write')
const writeResults = [...collisions]
const batches = chunk(writable, 15)
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i]
  const payload = batch.map(d => ({
    dossier: d,
    finalImportance: (calibrated[d.proposal.id] && calibrated[d.proposal.id].importance) || d.proposal.importance,
    scoreRationale: (calibrated[d.proposal.id] && calibrated[d.proposal.id].rationale) || d.scoreRationale || '',
  }))
  const res = await agent(
    'You are writer batch ' + (i + 1) + '/' + batches.length + ' for a mass PEOPLE addition. Repo: ' + REPO + '\n' +
    'First read ' + AUTHORING + ' - its pre-write checklist is your gate (person-specific rules: lifespan.end explicit, >=1 person-category).\n\n' +
    'For each entry below: verify the dossier internally (every load-bearing fact, especially lifespan.end, is supported by its own evidence quotes; sources are real-shaped per the checklist; Hebrew reads natural - you may polish wording, NEVER facts). An entry that fails and cannot be fixed from its own evidence is skipped with the failing reason - never write a partial entry, never invent anything, never guess a death date.\n' +
    'Then write each passing entry with the Write tool (UTF-8 no BOM, 2-space indent) to ' + REPO + '/content/people/<id>.json. Key order: id, type, name, bio, lifespan, categoryIds, importance, image?, sources - optional keys only when present. Use finalImportance as the importance value. Filename must equal id exactly.\n' +
    'DO NOT touch content/relations.json - relations are handled centrally later.\n' +
    'After writing the whole batch run: npm run content:validate (from ' + REPO + '). It must end at 0 errors AND 0 warnings. Fix or revert offending files until green; a reverted entry is status "skipped" with the reason.\n' +
    'Return per-entry results and the final validate summary line.\n\n' +
    'Entries:\n' + JSON.stringify(payload, null, 1),
    { label: 'write:batch-' + (i + 1), phase: 'Write', model: 'sonnet', schema: WRITER_SCHEMA }
  )
  if (res) { writeResults.push(...res.results); log('Writer batch ' + (i + 1) + '/' + batches.length + ': ' + res.results.filter(r => r.status === 'written').length + ' written - validate: ' + res.validate) }
  else { writeResults.push(...batch.map(d => ({ id: d.proposal.id, status: 'skipped', reason: 'writer agent failed' }))); log('Writer batch ' + (i + 1) + ' FAILED - entries marked skipped') }
}
const writtenOk = writeResults.filter(r => r.status === 'written')

// ---------- Phase 5: relations + final gates ----------
phase('Finalize')
const relCandidates = writable
  .filter(d => writtenOk.some(w => w.id === d.proposal.id))
  .flatMap(d => (byName.get(d.name) || { candidates: [] }).candidates.map(c => ({ personId: d.proposal.id, eventId: c.eventId, type: c.type, noteHe: c.noteHe })))
let relations = { added: 0, droppedCandidates: [], validate: 'skipped - no candidates' }
if (relCandidates.length) {
  const rel = await agent(
    'You are the single relations writer for a mass PEOPLE addition. Repo: ' + REPO + '\n' +
    'The people below were just written to content/people/ in this same run, using the exact ids given. Below are candidate person-event edges (personId already resolved, eventId already an existing event).\n' +
    'For each candidate: confirm the eventId actually exists (run ' + INV_CMD + ' to check both people and events), then append the edge to ' + REPO + '/content/relations.json in its existing one-line-per-edge style ({ from: <personId>, to: <eventId>, type, note: {he} }), keeping the array valid JSON. Drop and report (in droppedCandidates) any edge whose eventId does not exist, or any duplicate (from,to,type) edge (including against edges already in the file).\n' +
    'Then run npm run content:validate - must be 0 errors 0 warnings; fix or revert until green. Return the count added, droppedCandidates, and the validate summary.\n\n' +
    'Candidates:\n' + JSON.stringify(relCandidates, null, 1),
    { label: 'relations:' + relCandidates.length + '-candidates', phase: 'Finalize', model: 'sonnet', schema: RELATIONS_SCHEMA }
  )
  if (rel) relations = rel
}
const gates = await agent(
  'Final gates for a mass PEOPLE addition. In ' + REPO + ' run, in order: (1) npm run content:validate (2) npm test (3) git status --short. Do NOT commit, push, or modify any file. Return the validate summary line (errors/warnings counts), the test summary line (passed/failed counts), and the git status output.',
  { label: 'final-gates', phase: 'Finalize', model: 'sonnet', effort: 'low', schema: GATES_SCHEMA }
)
log('Done: ' + writtenOk.length + ' written, ' + (writeResults.length - writtenOk.length) + ' skipped at write, ' + problemDossiers.length + ' flagged at research, ' + preSkipped.length + ' skipped at dedup')

return {
  written: writtenOk.map(w => w.id),
  writeSkipped: writeResults.filter(r => r.status !== 'written'),
  researchFlagged: problemDossiers.map(d => ({ name: d.name, status: d.status, duplicateOf: d.duplicateOf, openQuestions: d.openQuestions })),
  dedupSkipped: preSkipped,
  calibration: Object.values(calibrated),
  relations,
  gates,
}
