/**
 * CLI: validate content and compile the Dataset artifact
 * (docs/spec/content.md#build-pipeline). Aborts on any validation
 * error; the emitted artifact is DatasetSchema-parsed, valid by construction.
 *
 * Emits BOTH names for the same bytes (docs/spec/performance.md caching strategy):
 *   dataset.json          — stable name, used by the dev server
 *   dataset.<hash>.json   — content-addressed, injected into the production
 *                           bundle by vite.config.ts for immutable caching
 * plus dataset.meta.json carrying the hash/fileName.
 * Old dataset.*.json files are removed so public/data never accumulates.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '../src/domain/dataset';
import { buildDataset, collectContent, extractStyleTokens, renderIssueReport } from './lib/content';

const root = process.argv[2] ?? 'content';
const outDir = join('public', 'data');

const styleTokens = extractStyleTokens(readFileSync('src/styles/tokens.css', 'utf8'));
const result = collectContent(root, { styleTokens });
for (const line of renderIssueReport(result.errors, result.warnings)) console.log(line);

if (result.data === null) {
  console.error(`content build aborted: ${result.errors.length} error(s)`);
  process.exit(1);
}

const dataset = buildDataset(result.data);
const serialized = JSON.stringify(dataset);
// Content-address the artifact: hash the dataset with the build timestamp
// normalized out, so identical content produces an identical hash (hence
// filename) across builds — the point of the immutable-caching scheme (docs/spec/performance.md).
// generatedAt stays in the emitted file for provenance.
const hashInput = JSON.stringify({ ...dataset, generatedAt: '' });
const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 10);
const hashedFileName = `dataset.${hash}.json`;

const meta = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: dataset.generatedAt,
  hash,
  fileName: hashedFileName,
  counts: {
    events: dataset.events.length,
    people: dataset.people.length,
    works: dataset.works.length,
    personCategories: dataset.personCategories.length,
    eventCategories: dataset.eventCategories.length,
    workTypes: dataset.workTypes.length,
    regions: dataset.regions.length,
    relations: dataset.relations.length,
  },
  sourceFiles: result.counts.sourceFiles,
};

mkdirSync(outDir, { recursive: true });
if (existsSync(outDir)) {
  for (const name of readdirSync(outDir)) {
    if (/^dataset(\.[0-9a-f]+)?\.json$/.test(name) && name !== hashedFileName && name !== 'dataset.json') {
      rmSync(join(outDir, name));
    }
  }
}
writeFileSync(join(outDir, 'dataset.json'), serialized);
writeFileSync(join(outDir, hashedFileName), serialized);
writeFileSync(join(outDir, 'dataset.meta.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(
  `wrote ${join(outDir, hashedFileName)} (+ dataset.json) — ${meta.counts.events} events, ` +
    `${meta.counts.people} people, ${meta.counts.works} works (schema v${SCHEMA_VERSION})`,
);
if (result.warnings.length > 0) console.log(`${result.warnings.length} warning(s)`);
