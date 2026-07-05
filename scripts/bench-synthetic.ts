/**
 * Performance profiling harness (docs/10). Runs the pure timeline pipeline over
 * a synthetic dataset (never production data) and reports per-stage timings so
 * optimization decisions are measured, not speculative. Run: tsx scripts/bench-synthetic.ts [n]
 */
import { performance } from 'node:perf_hooks';
import { makeSyntheticDataset } from './lib/synthetic';
import { normalizeDataset } from '../src/domain/normalize';
import { currentDecimalYear } from '../src/domain/dates';
import { applyFilters } from '../src/domain/filters';
import type { FilterState } from '../src/domain/filters';
import { yearsPer1000px } from '../src/timeline/scale';
import type { Scale, TimeWindow } from '../src/timeline/scale';
import { effectiveMinImportance, zoomThreshold } from '../src/timeline/semanticZoom';
import { SEMANTIC_ZOOM } from '../src/timeline/semanticZoom.config';
import { applySemanticVisibility, cullToWindow } from '../src/timeline/visibility';
import { layoutTimeline } from '../src/timeline/laneLayout';
import { TIMELINE_INTERACTION } from '../src/timeline/config';

const N = Number(process.argv[2] ?? 10000);
const WIDTH = 1200;
const openEndYear = currentDecimalYear();
const emptyFilter: FilterState = {
  regionIds: new Set(), personCategoryIds: new Set(), contentTypes: new Set(), minImportance: 0,
};

function time(label: string, iters: number, fn: () => number): void {
  fn(); // warm up
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < iters; i++) sink += fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(3)} ms/op   (sink ${sink % 7})`);
}

console.log(`synthetic dataset: ${N} entities, width ${WIDTH}px`);
const t0 = performance.now();
const dataset = makeSyntheticDataset(N);
console.log(`generate: ${(performance.now() - t0).toFixed(1)} ms`);

const tN = performance.now();
const items = normalizeDataset(dataset);
console.log(`normalizeDataset(${items.length}): ${(performance.now() - tN).toFixed(1)} ms\n`);

const windows: Array<[string, TimeWindow]> = [
  ['full 100y', { start: 1900, end: 2000 }],
  ['70y', { start: 1930, end: 2000 }],
  ['decade 10y', { start: 1965, end: 1975 }],
  ['5y', { start: 1965, end: 1970 }],
  ['2y', { start: 1967, end: 1969 }],
];

for (const [name, window] of windows) {
  const scale: Scale = { window, widthPx: WIDTH, dir: 'rtl' };
  const floor = effectiveMinImportance(zoomThreshold(yearsPer1000px(window, WIDTH), SEMANTIC_ZOOM), 0);
  const visible = applySemanticVisibility(items, floor, SEMANTIC_ZOOM.fadeBand);
  const culled = cullToWindow(visible, window, TIMELINE_INTERACTION.bufferScreens, openEndYear);
  const layout = layoutTimeline(culled, scale, openEndYear);
  const rendered = layout.bands.reduce((a, b) => a + b.items.length + b.clusters.length, 0);
  console.log(`[${name}] floor=${Math.round(floor)}  visible=${visible.length}  culled=${culled.length}  rendered nodes=${rendered}`);
  time('applyFilters (empty)', 200, () => applyFilters(items, emptyFilter, dataset.indexes.regionDescendants).length);
  time('semanticVisibility', 200, () => applySemanticVisibility(items, floor, SEMANTIC_ZOOM.fadeBand).length);
  time('full recompute (vis+cull+layout)', 200, () => {
    const v = applySemanticVisibility(items, floor, SEMANTIC_ZOOM.fadeBand);
    const c = cullToWindow(v, window, TIMELINE_INTERACTION.bufferScreens, openEndYear);
    return layoutTimeline(c, scale, openEndYear).bands.length;
  });
  console.log('');
}
