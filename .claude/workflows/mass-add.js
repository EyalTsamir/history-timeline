export const meta = {
  name: 'mass-add',
  description: 'Mass-add user-provided historical topics: pre-pass dedup/banding, parallel lean research, central calibration, batched sequential writes, single relations pass, final gates',
  whenToUse: 'When the user provides a large list (dozens to hundreds) of timeline topics to add. Launch ONLY when no other /add session is writing to content/. Pass args = { topics: ["<Hebrew topic>", ...] }; optional args.repoRoot.',
  phases: [
    { title: 'Pre-pass', detail: 'dedup against inventory + rough banding', model: 'sonnet' },
    { title: 'Research', detail: 'one researcher per topic — web-only, one-fetch, no repo access', model: 'sonnet' },
    { title: 'Calibrate', detail: 'central importance calibration (main model)' },
    { title: 'Write', detail: 'sequential writer batches, validate each', model: 'sonnet' },
    { title: 'Finalize', detail: 'relations pass + final gates', model: 'sonnet' },
  ],
}

// Robust args: name-invocation may hand `args` (or args.topics) through as a JSON string.
const rawArgs = typeof args === 'string' ? JSON.parse(args) : (args || {})
const rawTopics = typeof rawArgs.topics === 'string' ? JSON.parse(rawArgs.topics) : rawArgs.topics
const topics = Array.isArray(rawTopics) ? rawTopics.map(t => String(t).trim()).filter(Boolean) : []
if (!topics.length) throw new Error('args.topics must be a non-empty array of Hebrew topic strings')
const REPO = rawArgs.repoRoot || 'c:/Projects/HistoryTimeLine'
const INV_CMD = 'node "' + REPO + '/.claude/skills/add/scripts/list-events.mjs"'
const AUTHORING = REPO + '/.claude/skills/add/references/authoring.md'

// Event categories, injected inline into research prompts so researchers never Read the
// taxonomy file (that was ~66 redundant reads / one per agent in the prior run).
const EVENT_CATEGORIES =
  'war-security (wars, military operations, security), state-politics (political/legal/' +
  'diplomatic), immigration-settlement (aliyah, absorption, new settlements), culture-society ' +
  '(culture, society, religion, memory), economy-labor (economy, labor, Histadrut), ' +
  'science-tech (science, technology, infrastructure, higher education)'

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
  return 'Research the historical topic "' + row.topic + '" for a curated Hebrew timeline of Israel 1930-2000 and return a JSON dossier via StructuredOutput. This is fact-verification, not summarization.\n\n' +
  'TOKEN DISCIPLINE (cost is linear in your turn count — obey strictly):\n' +
  '- Do NOT touch the repository. No Bash, no Read, no ls/cat/grep, no content:validate, no reading content/ files or taxonomies. Everything you need is in this prompt. Use ONLY WebFetch/WebSearch.\n' +
  '- ONE fetch per source. NEVER fetch the same URL twice. NEVER fetch both the REST summary and the full /wiki/ article of the same page.\n\n' +
  'Method:\n' +
  '1. WebFetch the Hebrew-Wikipedia REST summary FIRST: https://he.wikipedia.org/api/rest_v1/page/summary/<percent-encoded article title>. For a well-defined topic (a law, a founding, one dated event) the summary usually settles what/when/where/who — STOP THERE and author from it (a correct summary already verifies the /wiki/ URL, so cite the article without fetching it).\n' +
  '2. Only if a load-bearing fact is still open (exact day, actors, outcome, casualty numbers) WebFetch the full /wiki/ article ONCE and author from that instead. One anchor source suffices for a notable topic; open a second page only if obscure/contested/sensitive. Cannot confirm core facts from real opened pages -> status "insufficient-sources".\n' +
  '3. Every load-bearing fact in the proposal (the date above all) needs an evidence entry {fact, url, quote} with a short verbatim quote at the SAME precision as the claim (claim a day only if a page states the day). Source disagreements go in openQuestions, never silently resolved.\n' +
  '4. Dates: "YYYY" | "YYYY-MM" | "YYYY-MM-DD"; optional end only for real ranges (start <= end); approx: true for circa dates. Precision equals source precision.\n' +
  '5. Hebrew authoring: title.he short (fits a timeline card), gershayim ״ inside acronyms; description.he 1-3 sentences - concrete dated facts, then a significance clause after a semicolon; natural precise Hebrew, no filler.\n' +
  '6. sources: 1-3, each { title: {he}, url (a page you opened; percent-encode characters that are not URL-safe - Hebrew Wikipedia titles containing ״ or " must be encoded), kind: archive|library|museum|encyclopedia|reference|academic|government|book|press|website, publisher when it adds information }. No guessed deep links, no placeholders.\n' +
  '7. If the name maps to more than one well-defined historical referent -> status "ambiguous"; name the referents in ambiguity; do not pick one.\n' +
  '8. relationCandidates: 0-3 key historical persons tied to the topic as { personName (Hebrew), type: led|participated-in|influenced|related-to, noteHe (role in a few words) }. Names only - mapping to existing people ids happens centrally.\n' +
  (imageRequired
    ? '9. This topic is banded >=70, which obliges an image (corpus convention): find a Wikimedia Commons image - open the file\'s Commons description page ONCE, read the license (must be public domain or CC), and return { src: a direct https://upload.wikimedia.org/wikipedia/commons/... file URL, filePage, license, altHe (describes the picture, not the event), credit (photographer/source + license, in Hebrew) }. If none is verifiable in one look, return empty imageCandidates and note it in openQuestions.\n'
    : '9. imageCandidates: return an empty list (below the image-obligation band) unless an outstanding, clearly-licensed Commons candidate surfaces during research anyway.\n') +
  '\nProposal fields: id (use "' + (row.idSuggestion || '') + '" unless research shows it is wrong), type "' + (row.entityType || 'event') + '", title, description, dates, ' +
  (row.parentHint ? 'parentId (likely "' + row.parentHint + '" - confirm the period fits inside the parent and set it only if it does), ' : 'parentId (omit unless the topic clearly belongs inside an existing curated parent event), ') +
  'importance (your proposal near band ' + (row.band || 30) + ' - final calibration is central; include scoreRationale with 2-3 anchors), categoryIds (1-2, most specific first, from: ' + EVENT_CATEGORIES + '; prefer the pre-assigned "' + (row.categoryId || '') + '"), sources.\n' +
  'Entity rules: person -> lifespan requires an explicit end (null while alive; an omitted end is invalid), categories leaders|military|writers|artists|pioneers|scientists|religious; work -> positioned by coveredPeriod (what it is about), not publicationDate, and needs authorPersonIds and/or authorName.'
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

// ---------- Phase 4: sequential writer batches (script-emitted files) ----------
phase('Write')
const WRITE_SCRIPT = REPO + '/.claude/skills/add/scripts/write-entries.mjs'
const writeResults = [...collisions]
const batches = chunk(writable, 20)
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i]
  const payload = batch.map(d => ({
    dossier: d,
    finalImportance: (calibrated[d.proposal.id] && calibrated[d.proposal.id].importance) || d.proposal.importance,
    scoreRationale: (calibrated[d.proposal.id] && calibrated[d.proposal.id].rationale) || d.scoreRationale || '',
  }))
  const res = await agent(
    'You are writer batch ' + (i + 1) + '/' + batches.length + ' for a mass content addition. Repo: ' + REPO + '\n\n' +
    'TOKEN DISCIPLINE — target <= 6 turns total. Do NOT read authoring.md or any repo file; do NOT run content:validate yourself; do NOT write entity files one by one; do NOT touch content/relations.json (relations are handled centrally later). The digest below plus the write script cover all of that.\n\n' +
    'Step 1 — verify ALL entries in ONE reasoning pass (no tools). Per entry: (a) every load-bearing fact — the date above all — is supported by the entry\'s OWN evidence quotes at the SAME precision (a day only if a quote states the day); (b) sources are 1-3 real opened URLs (percent-encoded where needed); (c) Hebrew reads natural — polish WORDING only, never facts; title short with gershayim ״ in acronyms; description 1-3 sentences, concrete dated facts then a significance clause; (d) keep image only if the candidate is fully verified (Commons direct file URL + license + Hebrew alt + credit) — when in doubt drop the IMAGE, not the entry. An entry whose facts are not supported by its own evidence is EXCLUDED and reported skipped with the reason — never invent, never guess.\n\n' +
    'Step 2 — Write ONE payload file into your scratchpad directory (listed in your system prompt), e.g. <scratchpad>/write-batch-' + (i + 1) + '.json, shaped {"entries": [ ...the corrected final entity JSONs, with finalImportance as the importance value... ]}.\n\n' +
    'Step 3 — run: node "' + WRITE_SCRIPT + '" "<payload path>"\n' +
    'The script does the mechanics for you: canonical key order, UTF-8/indent, filename=id, category/date/parent-importance/sources pre-checks, then content:validate. Trust its JSON summary.\n\n' +
    'Step 4 — only if the summary reports skipped entries or a non-green validate: fix the payload (Edit) and re-run with --overwrite for ids already written; revert a hopeless entry via a {"delete":["<id>"]} payload and report it skipped. At most two fix cycles — then report honestly.\n\n' +
    'Step 5 — StructuredOutput: per-entry results (written/skipped + reason) and the script\'s validate line.\n\n' +
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
  { label: 'final-gates', phase: 'Finalize', model: 'haiku', effort: 'low', schema: GATES_SCHEMA }
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
