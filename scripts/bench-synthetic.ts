/**
 * Performance profiling harness (docs/spec/performance.md). Runs the pure timeline pipeline over
 * a synthetic dataset (never production data) and reports per-stage timings so
 * optimization decisions are measured, not speculative. Run: tsx scripts/bench-synthetic.ts [n]
 */
import { performance } from 'node:perf_hooks';
import { makeSyntheticDataset } from './lib/synthetic';
import { normalizeDataset } from '../src/domain/normalize';
import { currentDecimalYear } from '../src/domain/dates';
import { applyFilters } from '../src/domain/filters';
import type { FilterState } from '../src/domain/filters';
import { spanYears } from '../src/timeline/scale';
import type { Scale, TimeWindow } from '../src/timeline/scale';
import { altitudeOf } from '../src/timeline/altitude';
import { layoutField } from '../src/timeline/fieldLayout';
import { castForWindow, shelfForWindow } from '../src/timeline/presence';
import { cullToWindow } from '../src/timeline/visibility';
import { TIMELINE_INTERACTION } from '../src/timeline/config';

const N = Number(process.argv[2] ?? 10000);
const WIDTH = 1200;
const openEndYear = currentDecimalYear();
const NO_EXPANDED = new Set<string>();
const emptyFilter: FilterState = {
  personCategoryIds: new Set(), contentTypes: new Set(), minImportance: 0,
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
  ['decade 12y', { start: 1963, end: 1975 }],
  ['5y', { start: 1965, end: 1970 }],
  ['2y', { start: 1967, end: 1969 }],
];

for (const [name, window] of windows) {
  const scale: Scale = { window, widthPx: WIDTH, dir: 'rtl' };
  const altitude = altitudeOf(spanYears(window));
  const culled = cullToWindow(items, window, TIMELINE_INTERACTION.bufferScreens, openEndYear);
  const layout = layoutField(culled, scale, altitude, NO_EXPANDED, openEndYear);
  const rendered =
    layout.marks.length +
    layout.dots.length +
    layout.chapters.reduce((a, c) => a + 1 + c.children.length, 0);
  console.log(
    `[${name}] altitude=${altitude}  culled=${culled.length}  rendered nodes=${rendered} ` +
      `(marks=${layout.marks.length} chapters=${layout.chapters.length} dots=${layout.dots.length})`,
  );
  time('applyFilters (empty)', 200, () => applyFilters(items, emptyFilter).length);
  time('cull', 200, () => cullToWindow(items, window, TIMELINE_INTERACTION.bufferScreens, openEndYear).length);
  time('full recompute (cull+field)', 200, () => {
    const c = cullToWindow(items, window, TIMELINE_INTERACTION.bufferScreens, openEndYear);
    return layoutField(c, scale, altitude, NO_EXPANDED, openEndYear).marks.length;
  });
  time('presence (cast+shelf)', 200, () => {
    return (
      castForWindow(items, window, openEndYear, 8).top.length +
      shelfForWindow(items, window, openEndYear, 5).top.length
    );
  });
  console.log('');
}
