/**
 * Production content gate (docs/09 §1) — runs the REAL content/ tree through
 * the validator and the timeline projection, so a bad content PR fails here in
 * unit CI, not only in the `content:validate` build step. Distinct from the
 * fixture-tree tests, which exercise the validator RULES in isolation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectContent, buildDataset, extractStyleTokens } from './lib/content';
import { DatasetSchema } from '../src/domain/dataset';
import { normalizeDataset } from '../src/domain/normalize';
import { spanOf } from '../src/domain/dates';

const ROOT = join(process.cwd(), 'content');
const styleTokens = extractStyleTokens(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'));
const collected = collectContent(ROOT, { styleTokens });

describe('production content — validation', () => {
  it('has zero validation errors', () => {
    expect(collected.errors).toEqual([]);
  });

  it('has zero validation warnings', () => {
    expect(collected.warnings).toEqual([]);
  });

  it('meets the curated-scope minimums (rubric target)', () => {
    expect(collected.counts.events).toBeGreaterThanOrEqual(60);
    expect(collected.counts.people).toBeGreaterThanOrEqual(40);
    expect(collected.counts.works).toBeGreaterThanOrEqual(24);
  });

  it('builds a schema-valid dataset artifact', () => {
    expect(collected.data).not.toBeNull();
    const dataset = buildDataset(collected.data!, '2026-01-01T00:00:00.000Z');
    expect(DatasetSchema.safeParse(dataset).success).toBe(true);
  });
});

describe('production content — timeline projection (every displayable entity)', () => {
  const dataset = buildDataset(collected.data!, '2026-01-01T00:00:00.000Z');
  const items = normalizeDataset(dataset);
  const tokenOk = new Set([...styleTokens, 'event', 'person', 'work']);

  it('projects every entity to a valid TimelineItem', () => {
    expect(items.length).toBe(collected.counts.events + collected.counts.people + collected.counts.works);
    for (const it of items) {
      expect(Number.isFinite(it.start), `${it.id} start`).toBe(true);
      expect(it.end === null || (Number.isFinite(it.end) && it.end >= it.start), `${it.id} end`).toBe(true);
      expect(it.title.length, `${it.id} title`).toBeGreaterThan(0);
      expect(it.detail.displayDate.length, `${it.id} displayDate`).toBeGreaterThan(0);
      expect(it.detail.sources.length, `${it.id} sources`).toBeGreaterThanOrEqual(1);
      expect(tokenOk.has(it.styleToken), `${it.id} styleToken ${it.styleToken}`).toBe(true);
    }
  });

  it('positions works by coveredPeriod, not publicationDate (D7)', () => {
    // A work whose publicationDate is decades after the period it covers.
    const work = dataset.works.find((w) => w.id === 'oz-tale-of-love-darkness');
    expect(work).toBeDefined();
    const item = items.find((i) => i.id === 'oz-tale-of-love-darkness')!;
    expect(item.start).toBeCloseTo(spanOf(work!.coveredPeriod).start, 5);
    expect(item.start).toBeLessThan(2000); // covers ~1939–1952, not published-2002
  });

  it('keeps living people open-ended (end null), never a fabricated point', () => {
    const living = items.filter((i) => i.kind === 'person' && i.end === null);
    expect(living.length).toBeGreaterThanOrEqual(1); // e.g. David Grossman, Ada Yonath
    for (const p of living) expect(p.isPoint).toBe(false);
  });

  it('never fabricates date precision (a year-only date stays a year)', () => {
    // כ״ט בנובמבר is authored day-precision; the mass-immigration range is year-precision.
    const mass = items.find((i) => i.id === 'mass-immigration-1948-1951')!;
    expect(mass.detail.displayDate).not.toMatch(/בינואר|בפברואר/); // no fabricated day/month
  });
});
