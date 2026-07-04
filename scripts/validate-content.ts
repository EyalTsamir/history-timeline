/**
 * CLI: validate authored content (docs/04-data-and-content.md#build-pipeline).
 * Prints all issues grouped by file, then a summary; exits 1 when errors exist.
 * Usage: tsx scripts/validate-content.ts [contentRoot]
 */
import { readFileSync } from 'node:fs';
import { collectContent, extractStyleTokens, renderIssueReport } from './lib/content';

const root = process.argv[2] ?? 'content';
const styleTokens = extractStyleTokens(readFileSync('src/styles/tokens.css', 'utf8'));
const { errors, warnings, counts } = collectContent(root, { styleTokens });

for (const line of renderIssueReport(errors, warnings)) console.log(line);
if (errors.length > 0 || warnings.length > 0) console.log('');

console.log(
  `content: ${counts.events} events, ${counts.people} people, ${counts.works} works, ` +
    `${counts.personCategories} person-categories, ${counts.eventCategories} event-categories, ` +
    `${counts.workTypes} work-types, ${counts.regions} regions, ${counts.relations} relations ` +
    `(${counts.sourceFiles} source files)`,
);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);

if (errors.length > 0) process.exitCode = 1;
