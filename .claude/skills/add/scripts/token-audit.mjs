#!/usr/bin/env node
// token-audit.mjs — measure where a mass-add workflow run spent its tokens.
//
// Usage:  node .claude/skills/add/scripts/token-audit.mjs <workflow-transcript-dir>
//
// <workflow-transcript-dir> is the folder holding the run's agent-*.jsonl files, e.g.
//   ~/.claude/projects/<proj>/<session>/subagents/workflows/wf_xxxxxxxx
// (printed as "Transcript dir" when the Workflow tool launches).
//
// Why this exists: research is ~75% of the pipeline's token bill and cost is linear in
// conversation TURNS (~3k fresh tokens/turn), not in page size. This script surfaces
// turns-per-agent, per-phase cache-creation, and WebFetch waste (duplicate + summary-then-full
// double fetches) so a regression in those shows up as a number, not a hunch.

import { readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node token-audit.mjs <workflow-transcript-dir>')
  process.exit(1)
}

const PHASES = ['pre-pass/dedup', 'research', 'calibrate', 'write', 'relations', 'gates', 'other']

function classify(prompt) {
  const p = prompt || ''
  if (/pre-pass for a mass content addition|dedup\/id pre-pass/.test(p)) return 'pre-pass/dedup'
  if (/return a JSON dossier via StructuredOutput/.test(p)) return 'research'
  if (/importance calibrator/.test(p)) return 'calibrate'
  if (/writer batch/.test(p)) return 'write'
  if (/relations writer/.test(p)) return 'relations'
  if (/Final gates/.test(p)) return 'gates'
  return 'other'
}

function firstUserPrompt(entries) {
  for (const e of entries) {
    if (e.type !== 'user') continue
    const c = e.message?.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return c.map(b => (typeof b === 'string' ? b : b?.text || '')).join(' ')
  }
  return ''
}

const agg = {}
for (const ph of PHASES) agg[ph] = { agents: 0, turns: 0, out: 0, create: 0, tools: {} }
let fetchTotal = 0, fetchDupes = 0, fetchDouble = 0

for (const file of readdirSync(dir)) {
  if (!/^agent-.*\.jsonl$/.test(file)) continue
  const entries = readFileSync(join(dir, file), 'utf8')
    .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  if (!entries.length) continue
  const phase = classify(firstUserPrompt(entries))
  const a = agg[phase]
  a.agents++
  const urls = []
  for (const e of entries) {
    const msg = e.message
    if (!msg || typeof msg !== 'object') continue
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b?.type === 'tool_use') {
          a.tools[b.name] = (a.tools[b.name] || 0) + 1
          if (b.name === 'WebFetch') urls.push(b.input?.url || '')
        }
      }
    }
    if (msg.usage) {
      a.turns++
      a.out += msg.usage.output_tokens || 0
      a.create += msg.usage.cache_creation_input_tokens || 0
    }
  }
  // WebFetch waste, per agent
  fetchTotal += urls.length
  const seen = new Map()
  for (const u of urls) seen.set(u, (seen.get(u) || 0) + 1)
  for (const n of seen.values()) if (n > 1) fetchDupes += n - 1
  const sums = new Set(urls.filter(u => u.includes('summary/')).map(u => u.split('summary/')[1]))
  const fulls = new Set(urls.filter(u => u.includes('/wiki/')).map(u => u.split('/wiki/')[1]))
  for (const s of sums) if (fulls.has(s)) fetchDouble++
}

const totCreate = Object.values(agg).reduce((s, a) => s + a.create, 0)
const totOut = Object.values(agg).reduce((s, a) => s + a.out, 0)
const totTurns = Object.values(agg).reduce((s, a) => s + a.turns, 0)
const n = x => x.toLocaleString('en-US')

console.log(`\nToken audit — ${basename(dir)}\n`)
console.log('phase           agents   turns    out_tok   cache_create   %create  turns/agent')
for (const ph of PHASES) {
  const a = agg[ph]
  if (!a.agents) continue
  const pct = totCreate ? (100 * a.create / totCreate).toFixed(0) : '0'
  const tpa = a.agents ? (a.turns / a.agents).toFixed(1) : '0'
  console.log(
    ph.padEnd(15) + String(a.agents).padStart(6) + String(a.turns).padStart(8) +
    n(a.out).padStart(11) + n(a.create).padStart(15) + (pct + '%').padStart(9) + tpa.padStart(13))
}
console.log('-'.repeat(78))
console.log('TOTAL'.padEnd(15) + ''.padStart(6) + String(totTurns).padStart(8) +
  n(totOut).padStart(11) + n(totCreate).padStart(15))
console.log(`\ncost model:  ${totTurns ? Math.round(totCreate / totTurns) : 0} fresh (cache-creation) tokens per turn`)
console.log(`             → turns are the lever. research tools:`, agg.research.tools)
console.log(`\nWebFetch waste:  ${fetchTotal} fetches | ${fetchDupes} exact-duplicate refetches` +
  ` | ${fetchDouble} summary+full doubles  (target: ~0 for both)`)
console.log()
