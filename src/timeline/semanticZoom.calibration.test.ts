/**
 * Importance CALIBRATION guard over the real content (docs/05#calibration).
 * Distinct from semanticZoom.test.ts (which tests the curve math on synthetic
 * inputs): this asserts the shipped dataset keeps a pyramid-shaped importance
 * distribution and a monotonic zoom-reveal gradient, so a content pass can't
 * silently flatten semantic zoom. If it fails, re-balance the CONTENT.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectContent, buildDataset, extractStyleTokens } from '../../scripts/lib/content';
import { yearsPer1000px } from './scale';
import type { TimeWindow } from './scale';
import { zoomThreshold } from './semanticZoom';
import { SEMANTIC_ZOOM } from './semanticZoom.config';

const styleTokens = extractStyleTokens(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'));
const data = collectContent(join(process.cwd(), 'content'), { styleTokens }).data!;
const dataset = buildDataset(data, '2026-01-01T00:00:00.000Z');
const importances = [
  ...dataset.events.map((e) => e.importance),
  ...dataset.people.map((p) => p.importance),
  ...dataset.works.map((w) => w.importance),
];
const inBand = (lo: number, hi: number): number => importances.filter((i) => i >= lo && i <= hi).length;

describe('importance distribution is a pyramid (docs/05)', () => {
  it('has a small era-defining apex (90–100)', () => {
    expect(inBand(90, 100)).toBeGreaterThanOrEqual(3);
    expect(inBand(90, 100)).toBeLessThanOrEqual(12);
  });

  it('populates the contextual tier so deep zoom reveals detail (20–39)', () => {
    expect(inBand(20, 39)).toBeGreaterThanOrEqual(25);
  });

  it('has a fine-detail tail for the deepest zoom (1–19)', () => {
    expect(inBand(1, 19)).toBeGreaterThanOrEqual(3);
  });

  it('does not overload the notable tier into a plateau (40–69)', () => {
    // must not swamp the lower tiers — the stage-4 failure mode we fixed.
    expect(inBand(40, 69)).toBeLessThanOrEqual(importances.length * 0.6);
  });
});

describe('semantic-zoom reveal gradient is monotonic', () => {
  const WIDTH = 1200;
  const spans = [156, 100, 70, 40, 20, 10, 5, 2, 1];
  const visibleAt = (span: number): number => {
    const window: TimeWindow = { start: 1950 - span / 2, end: 1950 + span / 2 };
    const t = zoomThreshold(yearsPer1000px(window, WIDTH), SEMANTIC_ZOOM);
    return importances.filter((i) => i >= t).length;
  };

  it('reveals monotonically more items as the viewport narrows', () => {
    const counts = spans.map(visibleAt);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!, `span ${spans[i]} vs ${spans[i - 1]}`).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });

  it('keeps the widest view readable and rewards the deepest zoom', () => {
    expect(visibleAt(156)).toBeLessThanOrEqual(15); // century view: only the defining items
    expect(visibleAt(1)).toBeGreaterThan(importances.length * 0.8); // single-year: nearly everything
  });
});
