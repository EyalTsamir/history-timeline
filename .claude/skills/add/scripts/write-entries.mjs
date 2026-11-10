#!/usr/bin/env node
// write-entries.mjs — deterministic file emitter for mass-add write phases.
//
// Replaces per-file LLM Write turns: the writer agent verifies/polishes entries in ONE
// reasoning pass, dumps them into a single payload JSON, and this script does everything
// mechanical — canonical key order, UTF-8 (no BOM) + 2-space indent, filename=id, cheap
// pre-checks that used to surface only via content:validate, relations append with dedup —
// then runs the real validator once. One Bash turn instead of ~15 Write turns per batch.
//
// Usage:
//   node write-entries.mjs <payload.json> [--root <repo>] [--overwrite] [--no-validate]
//
// Payload shape (all keys optional):
//   {
//     "entries": [ { full entity JSON (event | person | work), final importance already set } ],
//     "edges":   [ { "from": "<person id>", "to": "<event id>", "type": "...",
//                    "note": {"he": "..."} | "noteHe": "..." } ],
//     "delete":  [ "entity-id", ... ]          // revert helper for failed entries
//   }
//
// Output: one JSON summary line on stdout: { written, skipped: [{id, error}], deleted,
// edgesAdded, edgesDropped, validate }. Exit 0 only when nothing failed AND validate
// (if run) ended 0 errors / 0 warnings.

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const payloadPath = argv.find(a => !a.startsWith('--'))
const flag = f => argv.includes(f)
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
if (!payloadPath) { console.error('usage: node write-entries.mjs <payload.json> [--root <repo>] [--overwrite] [--no-validate]'); process.exit(1) }

const ROOT = opt('--root') || process.cwd()
const DIRS = { event: 'events', person: 'people', work: 'works' }

const KEY_ORDER = {
  event: ['id', 'type', 'title', 'description', 'dates', 'parentId', 'importance', 'categoryIds', 'tags', 'image', 'video', 'sources'],
  person: ['id', 'type', 'name', 'bio', 'lifespan', 'categoryIds', 'importance', 'image', 'sources'],
  work: ['id', 'type', 'workType', 'title', 'description', 'authorPersonIds', 'authorName', 'subjectPersonIds', 'subjectEventIds', 'publicationDate', 'coveredPeriod', 'importance', 'categoryIds', 'tags', 'image', 'sources'],
}
const NESTED_ORDER = {
  dates: ['start', 'end', 'approx'],
  lifespan: ['start', 'end'],
  coveredPeriod: ['start', 'end', 'approx'],
  image: ['src', 'alt', 'credit'],
  video: ['provider', 'videoId', 'title', 'credit'],
}
const SOURCE_ORDER = ['title', 'publisher', 'url', 'kind']

const EVENT_CATS = ['war-security', 'state-politics', 'immigration-settlement', 'culture-society', 'economy-labor', 'science-tech']
const PERSON_CATS = ['leaders', 'military', 'writers', 'artists', 'pioneers', 'scientists', 'religious']
const WORK_TYPES = ['biography', 'autobiography', 'historical-novel']
const SOURCE_KINDS = ['archive', 'library', 'museum', 'encyclopedia', 'reference', 'academic', 'government', 'book', 'press', 'website']
const REL_TYPES = ['led', 'participated-in', 'influenced', 'related-to']
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/

function orderKeys(obj, order) {
  const out = {}
  for (const k of order) if (k in obj) out[k] = obj[k]
  return out
}

function canonicalize(e) {
  const type = e.type
  const order = KEY_ORDER[type]
  const unknown = Object.keys(e).filter(k => !order.includes(k))
  if (unknown.length) throw new Error('unknown keys for ' + type + ': ' + unknown.join(', '))
  const out = orderKeys(e, order)
  for (const [k, ord] of Object.entries(NESTED_ORDER)) if (out[k] && typeof out[k] === 'object') out[k] = orderKeys(out[k], ord)
  if (Array.isArray(out.sources)) out.sources = out.sources.map(s => orderKeys(s, SOURCE_ORDER))
  return out
}

function findEntityFile(id) {
  for (const d of Object.values(DIRS)) {
    const p = join(ROOT, 'content', d, id + '.json')
    if (existsSync(p)) return p
  }
  return null
}

function precheck(e, batchIds) {
  const errs = []
  const t = e.type
  if (!DIRS[t]) return ['type must be event|person|work, got: ' + JSON.stringify(t)]
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id || '')) errs.push('id must be a kebab-case ascii slug')
  if (!flag('--overwrite') && findEntityFile(e.id)) errs.push('id already exists on disk: ' + e.id)
  if (batchIds.has(e.id)) errs.push('duplicate id within payload: ' + e.id)
  if (!Number.isInteger(e.importance) || e.importance < 1 || e.importance > 100) errs.push('importance must be an integer 1-100')

  const label = t === 'person' ? e.name : e.title
  if (!label || typeof label.he !== 'string' || !label.he.trim()) errs.push((t === 'person' ? 'name' : 'title') + '.he required')
  const body = t === 'person' ? e.bio : e.description
  if (!body || typeof body.he !== 'string' || !body.he.trim()) errs.push((t === 'person' ? 'bio' : 'description') + '.he required')

  const checkDate = (v, where, req) => {
    if (v === undefined || v === null) { if (req) errs.push(where + ' required'); return }
    if (typeof v !== 'string' || !DATE_RE.test(v)) errs.push(where + ' must match YYYY[-MM[-DD]], got: ' + JSON.stringify(v))
  }
  if (t === 'event') {
    if (!e.dates) errs.push('dates required')
    else {
      checkDate(e.dates.start, 'dates.start', true)
      checkDate(e.dates.end, 'dates.end', false)
      if (e.dates.start && e.dates.end && e.dates.end < e.dates.start) errs.push('dates.end < dates.start')
    }
    const cats = e.categoryIds || []
    if (!cats.length || cats.length > 2) errs.push('categoryIds must have 1-2 entries')
    for (const c of cats) if (!EVENT_CATS.includes(c)) errs.push('unknown event category: ' + c)
    if (e.parentId) {
      const pf = join(ROOT, 'content', 'events', e.parentId + '.json')
      if (!existsSync(pf)) errs.push('parentId not found: ' + e.parentId)
      else {
        const parent = JSON.parse(readFileSync(pf, 'utf8'))
        if (!(e.importance < parent.importance)) errs.push('importance ' + e.importance + ' must be STRICTLY below parent ' + e.parentId + ' (' + parent.importance + ')')
      }
    }
  }
  if (t === 'person') {
    if (!e.lifespan) errs.push('lifespan required')
    else {
      checkDate(e.lifespan.start, 'lifespan.start', true)
      if (!('end' in e.lifespan)) errs.push('lifespan.end must be explicit (a date, or null while alive)')
      else if (e.lifespan.end !== null) checkDate(e.lifespan.end, 'lifespan.end', false)
    }
    const cats = e.categoryIds || []
    if (!cats.length || cats.length > 2) errs.push('categoryIds must have 1-2 entries')
    for (const c of cats) if (!PERSON_CATS.includes(c)) errs.push('unknown person category: ' + c)
  }
  if (t === 'work') {
    if (!WORK_TYPES.includes(e.workType)) errs.push('unknown workType: ' + e.workType)
    if (!e.coveredPeriod) errs.push('coveredPeriod required (positions the work — decision D7)')
    else { checkDate(e.coveredPeriod.start, 'coveredPeriod.start', true); checkDate(e.coveredPeriod.end, 'coveredPeriod.end', false) }
    const hasAuthor = (Array.isArray(e.authorPersonIds) && e.authorPersonIds.length) || (e.authorName && e.authorName.he)
    if (!hasAuthor) errs.push('a work needs authorPersonIds and/or authorName')
  }

  const sources = e.sources || []
  if (!sources.length || sources.length > 3) errs.push('sources must have 1-3 entries')
  for (const s of sources) {
    if (!s.title || !s.title.he) errs.push('source.title.he required')
    if (typeof s.url !== 'string' || !/^https?:\/\//.test(s.url) || /example\.com|\.\.\./.test(s.url)) errs.push('source.url must be a real http(s) URL: ' + JSON.stringify(s.url))
    if (s.kind && !SOURCE_KINDS.includes(s.kind)) errs.push('unknown source.kind: ' + s.kind)
  }
  if (e.image) {
    if (typeof e.image.src !== 'string' || !e.image.src.startsWith('https://upload.wikimedia.org/wikipedia/commons/')) errs.push('image.src must be a direct Wikimedia-Commons file URL')
    if (!e.image.alt || !e.image.alt.he) errs.push('image.alt.he required')
    if (!e.image.credit) errs.push('image.credit required')
  }
  return errs
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
const summary = { written: [], skipped: [], deleted: [], edgesAdded: 0, edgesDropped: [], validate: 'not run' }

// ---- deletions (revert helper) ----
for (const id of payload.delete || []) {
  const f = findEntityFile(id)
  if (f) { unlinkSync(f); summary.deleted.push(id) }
}

// ---- entries ----
const batchIds = new Set()
for (const raw of payload.entries || []) {
  try {
    const errs = precheck(raw, batchIds)
    if (errs.length) { summary.skipped.push({ id: raw.id || '?', error: errs.join('; ') }); continue }
    const entity = canonicalize(raw)
    batchIds.add(entity.id)
    const target = join(ROOT, 'content', DIRS[entity.type], entity.id + '.json')
    writeFileSync(target, JSON.stringify(entity, null, 2) + '\n', { encoding: 'utf8' })
    summary.written.push(entity.id)
  } catch (err) {
    summary.skipped.push({ id: raw.id || '?', error: String(err.message || err) })
  }
}

// ---- relations append (single-writer, dedup, endpoint checks) ----
const edges = payload.edges || []
if (edges.length) {
  const relPath = join(ROOT, 'content', 'relations.json')
  const existing = JSON.parse(readFileSync(relPath, 'utf8'))
  const seen = new Set(existing.map(r => r.from + '|' + r.to + '|' + r.type))
  const added = []
  for (const raw of edges) {
    const note = raw.note && raw.note.he ? raw.note.he : raw.noteHe
    const edge = { from: raw.from, to: raw.to, type: raw.type, note: { he: note } }
    const key = edge.from + '|' + edge.to + '|' + edge.type
    const problems = []
    if (!findEntityFile(edge.from)) problems.push('from not found: ' + edge.from)
    if (!findEntityFile(edge.to)) problems.push('to not found: ' + edge.to)
    if (!REL_TYPES.includes(edge.type)) problems.push('bad type: ' + edge.type)
    if (!note || !String(note).trim()) problems.push('note.he required')
    if (seen.has(key)) problems.push('duplicate edge')
    if (problems.length) { summary.edgesDropped.push({ edge: key, error: problems.join('; ') }); continue }
    seen.add(key)
    added.push(edge)
  }
  if (added.length) {
    const lines = existing.concat(added).map(r => '  ' + JSON.stringify(r))
    writeFileSync(relPath, '[\n' + lines.join(',\n') + '\n]\n', { encoding: 'utf8' })
    summary.edgesAdded = added.length
  }
}

// ---- validate ----
let validateOk = true
if (!flag('--no-validate')) {
  const res = spawnSync('npm', ['run', 'content:validate'], { cwd: ROOT, shell: true, encoding: 'utf8' })
  const out = (res.stdout || '') + (res.stderr || '')
  const tail = out.trim().split('\n').filter(l => /error|warning|content:/.test(l)).slice(-4).join(' | ')
  summary.validate = tail || out.trim().slice(-300)
  validateOk = res.status === 0 && /0 error\(s\), 0 warning\(s\)/.test(out)
}

console.log(JSON.stringify(summary, null, 1))
process.exit(summary.skipped.length === 0 && validateOk ? 0 : 2)
