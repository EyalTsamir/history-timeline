export const meta = {
  name: 'mass-add',
  description: 'Mass-add user-provided historical topics: pre-pass dedup/banding, parallel lean research, central calibration, batched sequential writes, single relations pass, final gates',
  whenToUse: 'When the user provides a large list (dozens to hundreds) of timeline topics to add. Launch ONLY when no other /add session is writing to content/. Pass args = { topics: ["<Hebrew topic>", ...] }; optional args.repoRoot.',
  phases: [
    { title: 'Pre-pass', detail: 'dedup against inventory + rough banding', model: 'sonnet' },
    { title: 'Research', detail: 'one lean researcher per topic', model: 'sonnet' },
    { title: 'Calibrate', detail: 'central importance calibration (main model)' },
    { title: 'Write', detail: 'sequential writer batches, validate each', model: 'sonnet' },
    { title: 'Finalize', detail: 'relations pass + final gates', model: 'sonnet' },
  ],
}

const topics = Array.isArray(args && args.topics) ? args.topics.map(t => String(t).trim()).filter(Boolean) : []
if (!topics.length) throw new Error('args.topics must be a non-empty array of Hebrew topic strings')
const REPO = (args && args.repoRoot) || 'c:/Projects/HistoryTimeLine'
const INV_CMD = 'node "' + REPO + '/.claude/skills/add/scripts/list-events.mjs"'
const AUTHORING = REPO + '/.claude/skills/add/references/authoring.md'

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

const PREPASS_SCHEMA = {
  type: 'object', required: ['rows'],
  properties: { rows: { type: 'array', items: { type: 'object', required: ['topic', 'action'], properties: {
    topic: { type: 'string' },
    action: { enum: ['research', 'duplicate', 'out-of-scope'] },
    duplicateOf: { type: 'string' },
    reason: { type: 'string' },
    entityType: { enum: ['event', 'person', 'work'] },
    band: { type: 'integer' },
    categoryId: { type: 'string' },
    idSuggestion: { type: 'string' },
    parentHint: { type: 'string' },
  } } } },
}

const DOSSIER_SCHEMA = {
  type: 'object', required: ['topic', 'status'],
  properties: {
    topic: { type: 'string' },
    status: { enum: ['ok', 'duplicate', 'ambiguous', 'insufficient-sources', 'out-of-scope'] },
    duplicateOf: { type: 'string' },
    ambiguity: { type: 'string' },
    proposal: { type: 'object' },
    evidence: { type: 'array', items: { type: 'object', required: ['fact', 'url'], properties: {
      fact: { type: 'string' }, url: { type: 'string' }, quote: { type: 'string' } } } },
    imageCandidates: { type: 'array' },
    relationCandidates: { type: 'array', items: { type: 'object', properties: {
      personName: { type: 'string' }, type: { enum: ['led', 'participated-in', 'influenced', 'related-to'] }, noteHe: { type: 'string' } } } },
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
  properties: { added: { type: 'integer' }, droppedNames: { type: 'array', items: { type: 'string' } }, validate: { type: 'string' } },
}

const GATES_SCHEMA = {
  type: 'object', required: ['validate', 'tests', 'gitStatus'],
  properties: { validate: { type: 'string' }, tests: { type: 'string' }, gitStatus: { type: 'string' } },
}

// ---------- Phase 1: pre-pass ----------
phase('Pre-pass')
log('Pre-pass over ' + topics.length + ' topics')
const prepassChunks = await parallel(chunk(topics, 100).map((group, gi) => () => agent(
  'You are the pre-pass for a mass content addition to a curated Hebrew timeline (Israel 1930-2000). Repo: ' + REPO + '\n' +
  'First run this to get the full inventory (id | dates | importance | categories | title): ' + INV_CMD + '\n' +
  'Also read ' + REPO + '/content/taxonomies/event-categories.json for valid event category ids.\n\n' +
  'For EACH topic below decide action:\n' +
  '- "duplicate" when the referent already exists in the inventory (set duplicateOf to the existing id; check Hebrew title substrings, same category+period, plausible slugs)\n' +
  '- "out-of-scope" when it falls outside Israel 1930-2000 (person lifespans may start earlier - that is in scope); set reason\n' +
  '- otherwise "research"\n' +
  'For "research" rows also assign: entityType (event|person|work); band = rough importance (integer; the corpus is a pyramid - most additions belong at 20-69, >=70 only for defining national events, >=90 essentially closed); categoryId (best existing id); idSuggestion (unique kebab-case ASCII slug not present in the inventory; year suffix only to disambiguate); parentHint (existing parent event id ONLY when the topic clearly belongs inside a curated parent).\n' +
  'Dedup within the list too: a later topic with the same referent as an earlier one is "duplicate" with duplicateOf = the earlier idSuggestion.\n' +
  'Band siblings relative to each other, not in isolation.\n\n' +
  'Topics:\n' + group.map((t, i) => (i + 1) + '. ' + t).join('\n'),
  { label: 'prepass:' + (gi + 1), phase: 'Pre-pass', model: 'sonnet', schema: PREPASS_SCHEMA }
)))
const prepassRows = prepassChunks.filter(Boolean).flatMap(r => r.rows)

// cross-chunk in-list dedup by suggested id
const seenIds = new Set()
for (const row of prepassRows) {
  if (row.action !== 'research') continue
  if (row.idSuggestion && seenIds.has(row.idSuggestion)) { row.action = 'duplicate'; row.duplicateOf = row.idSuggestion }
  else if (row.idSuggestion) seenIds.add(row.idSuggestion)
}
const toResearch = prepassRows.filter(r => r.action === 'research')
const preSkipped = prepassRows.filter(r => r.action !== 'research')
log('Pre-pass done: ' + toResearch.length + ' to research, ' + preSkipped.length + ' skipped (duplicate/out-of-scope)')

// ---------- Phase 2: research (parallel) ----------
phase('Research')
const researcherPrompt = (row) => {
  const imageRequired = (row.band || 0) >= 70
  return 'Research the historical topic "' + row.topic + '" for a curated Hebrew timeline of Israel 1930-2000 and return a JSON dossier via StructuredOutput. This is fact-verification, not summarization. Repo (for reference files): ' + REPO + '\n\n' +
  'Lean method:\n' +
  '1. Start with the Hebrew-Wikipedia REST summary: https://he.wikipedia.org/api/rest_v1/page/summary/<percent-encoded article title> (WebFetch it). A correct on-topic extract also verifies the corresponding /wiki/ article URL for citation. Escalate to the full article or more pages ONLY for facts the extract does not settle (exact day precision, actors, outcomes, numbers).\n' +
  '2. One anchor source suffices for a notable topic with a solid, uncontested article. Open a second independent page only if the topic is obscure or thinly covered, sources may disagree, or a claim is sensitive/disputed. Never cite a URL you did not open. Cannot confirm core facts from real opened pages -> status "insufficient-sources".\n' +
  '3. Every load-bearing fact in the proposal (the date above all) needs an evidence entry {fact, url, quote} with a short verbatim quote at the SAME precision as the claim (claim a day only if a page states the day). Source disagreements go in openQuestions, never silently resolved.\n' +
  '4. Dates: "YYYY" | "YYYY-MM" | "YYYY-MM-DD"; optional end only for real ranges (start <= end); approx: true for circa dates. Precision equals source precision.\n' +
  '5. Hebrew authoring: title.he short (fits a timeline card), gershayim ״ inside acronyms; description.he 1-3 sentences - concrete dated facts, then a significance clause after a semicolon; natural precise Hebrew, no filler.\n' +
  '6. sources: 1-3, each { title: {he}, url (a page you opened; percent-encode characters that are not URL-safe - Hebrew Wikipedia titles containing ״ or " must be encoded), kind: archive|library|museum|encyclopedia|reference|academic|government|book|press|website, publisher when it adds information }. No guessed deep links, no placeholders.\n' +
  '7. If the name maps to more than one well-defined historical referent -> status "ambiguous"; name the referents in ambiguity; do not pick one.\n' +
  '8. relationCandidates: 0-3 key historical persons tied to the topic as { personName (Hebrew), type: led|participated-in|influenced|related-to, noteHe (role in a few words) }. Names only - mapping to existing people ids happens centrally.\n' +
  (imageRequired
    ? '9. This topic is banded >=70, which obliges an image (corpus convention): find a Wikimedia Commons image - open the file\'s Commons description page, read the license (must be public domain or CC), and return { src: a direct https://upload.wikimedia.org/wikipedia/commons/... file URL you verified loads, filePage, license, altHe (describes the picture, not the event), credit (photographer/source + license, in Hebrew) }. If none is verifiable, return empty imageCandidates and note it in openQuestions.\n'
    : '9. imageCandidates: return an empty list (below the image-obligation band) unless an outstanding, clearly-licensed Commons candidate surfaces during research anyway.\n') +
  '\nProposal fields: id (use "' + (row.idSuggestion || '') + '" unless research shows it is wrong), type "' + (row.entityType || 'event') + '", title, description, dates, ' +
  (row.parentHint ? 'parentId (likely "' + row.parentHint + '" - confirm the period fits inside the parent and set it only if it does), ' : 'parentId (omit unless the topic clearly belongs inside an existing curated parent event), ') +
  'importance (your proposal near band ' + (row.band || 30) + ' - final calibration is central; include scoreRationale with 2-3 anchors), categoryIds (["' + (row.categoryId || '') + '"] or better existing ids from ' + REPO + '/content/taxonomies/, max 2, most specific first), sources.\n' +
  'Entity rules: person -> lifespan requires an explicit end (null while alive; an omitted end is invalid) and categories from person-categories; work -> positioned by coveredPeriod (what it is about), not publicationDate, and needs authorPersonIds and/or authorName.'
}
const dossiers = (await parallel(toResearch.map(row => () =>
  agent(researcherPrompt(row), { label: 'research:' + (row.idSuggestion || row.topic).slice(0, 30), phase: 'Research', model: 'sonnet', schema: DOSSIER_SCHEMA })
))).filter(Boolean)
const okDossiers = dossiers.filter(d => d.status === 'ok' && d.proposal && d.proposal.id)
const problemDossiers = dossiers.filter(d => d.status !== 'ok')
log('Research done: ' + okDossiers.length + ' ok, ' + problemDossiers.length + ' flagged (duplicate/ambiguous/insufficient/out-of-scope)')

// drop id collisions among ok dossiers (keep first)
const writtenIds = new Set()
const writable = []
const collisions = []
for (const d of okDossiers) {
  if (writtenIds.has(d.proposal.id)) collisions.push({ id: d.proposal.id, topic: d.topic, status: 'skipped', reason: 'id collision within batch' })
  else { writtenIds.add(d.proposal.id); writable.push(d) }
}

// ---------- Phase 3: central calibration ----------
phase('Calibrate')
let calibrated = {}
if (writable.length) {
  const calRows = writable.map(d => {
    const pre = toResearch.find(r => r.idSuggestion === d.proposal.id) || {}
    return { id: d.proposal.id, title: (d.proposal.title && d.proposal.title.he) || d.topic, band: pre.band, proposed: d.proposal.importance, rationale: d.scoreRationale || '', parentId: d.proposal.parentId || null, type: d.proposal.type || 'event' }
  })
  const cal = await agent(
    'You are the single importance calibrator for a batch of new entries entering a curated Hebrew timeline (Israel 1930-2000). Repo: ' + REPO + '\n' +
    'First read the "Importance scoring" section of ' + AUTHORING + ' and run ' + INV_CMD + ' to see the existing ladder.\n' +
    'Below are the batch rows (id, title, pre-pass band, researcher-proposed importance, rationale, parentId). Return a final integer importance per id.\n' +
    'Rules: score for historical weight relative to the existing corpus, never for visibility; keep the corpus pyramid (most of this batch belongs at 20-69; >=70 only for genuinely defining national events; >=90 closed); a sub-event scores STRICTLY below its parent (validator-enforced); rank batch siblings against each other - no plateau of identical values, but topics of equal weight may be equal; each score must read correctly as a comparison against 2-3 named neighbors (put them in rationale). Works usually 20-39.\n\n' +
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
    'You are writer batch ' + (i + 1) + '/' + batches.length + ' for a mass content addition. Repo: ' + REPO + '\n' +
    'First read ' + AUTHORING + ' - its pre-write checklist is your gate.\n\n' +
    'For each entry below: verify the dossier internally (every load-bearing fact, especially the date, is supported by its own evidence quotes at the claimed precision; sources are real-shaped per the checklist; Hebrew reads natural - you may polish wording, NEVER facts). An entry that fails and cannot be fixed from its own evidence is skipped with the failing reason - never write a partial entry, never invent anything.\n' +
    'Then write each passing entry with the Write tool (UTF-8 no BOM, 2-space indent) to ' + REPO + '/content/<events|people|works>/<id>.json by its type. Key order: id, type, title, description, dates, parentId?, importance, categoryIds, tags?, image?, video?, sources - optional keys only when present. Use finalImportance as the importance value. Filename must equal id exactly.\n' +
    'Use image data from imageCandidates only if it fully satisfies the checklist media rules; when in doubt omit image.\n' +
    'DO NOT touch content/relations.json - relations are handled centrally later.\n' +
    'After writing the whole batch run: npm run content:validate (from ' + REPO + '). It must end at 0 errors AND 0 warnings (warnings fail production tests). Fix or revert offending files until green; a reverted entry is status "skipped" with the reason.\n' +
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
  .flatMap(d => (d.relationCandidates || []).map(c => ({ eventId: d.proposal.id, personName: c.personName, type: c.type, noteHe: c.noteHe })))
let relations = { added: 0, droppedNames: [], validate: 'skipped - no candidates' }
if (relCandidates.length) {
  const rel = await agent(
    'You are the single relations writer for a mass content addition. Repo: ' + REPO + '\n' +
    'Run ' + INV_CMD + ' and note the existing PEOPLE ids. Below are candidate person-event edges using Hebrew person names.\n' +
    'Map each personName to an EXISTING person id from the inventory; drop candidates whose person does not exist (collect their names in droppedNames - they are report suggestions, never auto-created). Drop duplicate (from,to,type) edges, including against edges already in the file.\n' +
    'Append the surviving edges to ' + REPO + '/content/relations.json in its existing one-line-per-edge style ({ from: <person id>, to: <event id>, type, note: {he} }), keeping the array valid JSON.\n' +
    'Then run npm run content:validate - must be 0 errors 0 warnings; fix or revert until green. Return the count added, droppedNames, and the validate summary.\n\n' +
    'Candidates:\n' + JSON.stringify(relCandidates, null, 1),
    { label: 'relations:' + relCandidates.length + '-candidates', phase: 'Finalize', model: 'sonnet', schema: RELATIONS_SCHEMA }
  )
  if (rel) relations = rel
}
const gates = await agent(
  'Final gates for a mass content addition. In ' + REPO + ' run, in order: (1) npm run content:validate (2) npm test (3) git status --short. Do NOT commit, push, or modify any file. Return the validate summary line (errors/warnings counts), the test summary line (passed/failed counts), and the git status output.',
  { label: 'final-gates', phase: 'Finalize', model: 'sonnet', effort: 'low', schema: GATES_SCHEMA }
)
log('Done: ' + writtenOk.length + ' written, ' + (writeResults.length - writtenOk.length) + ' skipped at write, ' + problemDossiers.length + ' flagged at research, ' + preSkipped.length + ' skipped at pre-pass')

return {
  written: writtenOk.map(w => w.id),
  writeSkipped: writeResults.filter(r => r.status !== 'written'),
  researchFlagged: problemDossiers.map(d => ({ topic: d.topic, status: d.status, duplicateOf: d.duplicateOf, ambiguity: d.ambiguity, openQuestions: d.openQuestions })),
  prePassSkipped: preSkipped,
  calibration: Object.values(calibrated),
  relations,
  gates,
}
