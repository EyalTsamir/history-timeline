#!/usr/bin/env node
/**
 * Inventory of the content tree for the /add skill: one line per entity with the
 * fields needed for duplicate detection and importance calibration.
 *
 * Usage (from the repo root):  node .claude/skills/add/scripts/list-events.mjs [--type events|people|works|all]
 * Output columns:              kind | id | dates | imp | parent | categories | Hebrew title
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'content');
if (!existsSync(root)) {
  console.error(`No content/ directory under ${process.cwd()} — run from the repo root.`);
  process.exit(1);
}

const typeArg = (() => {
  const i = process.argv.indexOf('--type');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : 'all';
})();

function loadDir(subdir) {
  const dir = join(root, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json') && !n.startsWith('_'))
    .map((n) => {
      try {
        return JSON.parse(readFileSync(join(dir, n), 'utf8'));
      } catch (e) {
        console.error(`PARSE ERROR ${subdir}/${n}: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

const fmtRange = (r) => {
  if (!r) return '?';
  const end = r.end === null ? '…' : r.end !== undefined ? `–${r.end}` : '';
  return `${r.start}${end}${r.approx ? '~' : ''}`;
};
const pad = (s, n) => String(s ?? '').padEnd(n);

const rows = [];
if (typeArg === 'all' || typeArg === 'events') {
  for (const e of loadDir('events')) {
    rows.push({ kind: 'event', id: e.id, dates: fmtRange(e.dates), imp: e.importance, parent: e.parentId ?? '', cats: (e.categoryIds ?? []).join(','), title: e.title?.he ?? '' , sortKey: e.dates?.start ?? ''});
  }
}
if (typeArg === 'all' || typeArg === 'people') {
  for (const p of loadDir('people')) {
    rows.push({ kind: 'person', id: p.id, dates: fmtRange(p.lifespan), imp: p.importance, parent: '', cats: (p.categoryIds ?? []).join(','), title: p.name?.he ?? '', sortKey: p.lifespan?.start ?? '' });
  }
}
if (typeArg === 'all' || typeArg === 'works') {
  for (const w of loadDir('works')) {
    rows.push({ kind: 'work', id: w.id, dates: fmtRange(w.coveredPeriod), imp: w.importance, parent: '', cats: [w.workType].filter(Boolean).join(','), title: w.title?.he ?? '', sortKey: w.coveredPeriod?.start ?? '' });
  }
}

rows.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.sortKey.localeCompare(b.sortKey)));

const counts = rows.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
console.log(
  `# inventory: ${Object.entries(counts).map(([k, v]) => `${v} ${k}s`).join(', ') || 'empty'}\n`,
);
for (const r of rows) {
  console.log(
    `${pad(r.kind, 7)} ${pad(r.id, 34)} ${pad(r.dates, 24)} imp=${pad(r.imp, 4)} ${pad(r.parent, 26)} ${pad(r.cats, 34)} ${r.title}`,
  );
}
