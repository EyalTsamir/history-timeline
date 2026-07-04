import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../domain/timelineItem';
import { makeTimelineItem } from '../test/fixtures';
import { BAND_ORDER, DEFAULT_LAYOUT_CONFIG, layoutTimeline } from './laneLayout';
import type { BandLayout, PositionedItem } from './laneLayout';
import type { Scale } from './scale';
import type { VisibleItem } from './visibility';

const RTL: Scale = { window: { start: 1930, end: 2000 }, widthPx: 1400, dir: 'rtl' }; // 20 px/yr
const LTR: Scale = { ...RTL, dir: 'ltr' };
const OPEN_END = 2026.5;

const wrap = (items: TimelineItem[]): VisibleItem[] => items.map((item) => ({ item, opacity: 1 }));
const band = (layout: { bands: BandLayout[] }, kind: string): BandLayout =>
  layout.bands.find((b) => b.kind === kind)!;
const byId = (b: BandLayout, id: string): PositionedItem => b.items.find((p) => p.item.id === id)!;

/** No two boxes on the same row of a band may overlap. */
function expectNoRowCollisions(b: BandLayout): void {
  const all = [
    ...b.items.map((p) => ({ x: p.x, width: p.width, row: p.row, h: 1 })),
    ...b.clusters.map((c) => ({ x: c.x, width: c.width, row: c.row, h: 1 })),
  ];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const c = all[j]!;
      if (a.row !== c.row) continue;
      const overlap = a.x < c.x + c.width && c.x < a.x + a.width;
      expect(overlap, `row ${a.row}: [${a.x},${a.x + a.width}] vs [${c.x},${c.x + c.width}]`).toBe(false);
    }
  }
}

describe('layoutTimeline — bands', () => {
  it('separates kinds into the fixed band order', () => {
    const layout = layoutTimeline(
      wrap([
        makeTimelineItem('w', 1950, 1960, { kind: 'work', contentType: 'biography' }),
        makeTimelineItem('e', 1950, 1960, {}),
        makeTimelineItem('p', 1950, 1960, { kind: 'person' }),
      ]),
      RTL,
      OPEN_END,
    );
    expect(layout.bands.map((b) => b.kind)).toEqual([...BAND_ORDER]);
    expect(band(layout, 'event').items.map((p) => p.item.id)).toEqual(['e']);
    expect(band(layout, 'person').items.map((p) => p.item.id)).toEqual(['p']);
    expect(band(layout, 'work').items.map((p) => p.item.id)).toEqual(['w']);
  });

  it('is deterministic: identical input → identical output', () => {
    const items = wrap([
      makeTimelineItem('a', 1940, 1948, {}),
      makeTimelineItem('b', 1945, 1953, {}),
      makeTimelineItem('c', 1946, 1947, { importance: 30 }),
      makeTimelineItem('d', 1960, null, { kind: 'person' }),
    ]);
    expect(layoutTimeline(items, RTL, OPEN_END)).toEqual(layoutTimeline(items, RTL, OPEN_END));
  });
});

describe('layoutTimeline — packing', () => {
  it('overlapping spans go to different rows; disjoint spans share a row', () => {
    const layout = layoutTimeline(
      wrap([
        makeTimelineItem('a', 1940, 1950, {}),
        makeTimelineItem('b', 1945, 1955, {}), // overlaps a
        makeTimelineItem('c', 1970, 1980, {}), // far away → back to row 0
      ]),
      RTL,
      OPEN_END,
    );
    const events = band(layout, 'event');
    expect(byId(events, 'a').row).not.toBe(byId(events, 'b').row);
    expect(byId(events, 'c').row).toBe(0);
    expectNoRowCollisions(events);
  });

  it('produces no collisions under dense random-ish load (both directions)', () => {
    const items = wrap(
      Array.from({ length: 40 }, (_, i) =>
        makeTimelineItem(`e${i}`, 1930 + ((i * 7) % 60), 1930 + ((i * 7) % 60) + 1 + (i % 9), {
          importance: 100, // keep density-cap out of this test's way (capacity 12 < 40 → clusters too)
        }),
      ),
    );
    for (const scale of [RTL, LTR]) {
      const layout = layoutTimeline(items, scale, OPEN_END);
      expectNoRowCollisions(band(layout, 'event'));
    }
  });

  it('respects the row budget: rows never exceed maxRows + cluster row', () => {
    // 30 items all overlapping the same span → rows are the binding constraint.
    const items = wrap(
      Array.from({ length: 30 }, (_, i) => makeTimelineItem(`e${i}`, 1948, 1949, { importance: 100 })),
    );
    const layout = layoutTimeline(items, RTL, OPEN_END);
    const events = band(layout, 'event');
    const maxRows = DEFAULT_LAYOUT_CONFIG.bands.event.maxRows;
    expect(events.rows).toBeLessThanOrEqual(maxRows + 1);
    expect(events.items.every((p) => p.row < maxRows)).toBe(true);
    expect(events.clusters.length).toBeGreaterThan(0);
  });
});

describe('layoutTimeline — density cap & clusters', () => {
  it('collapses the least important overflow into cluster chips with a zoom span', () => {
    // capacity = ceil(8 × 1400/1000) = 12 → 15 items ⇒ 3 clustered.
    const items = wrap(
      Array.from({ length: 15 }, (_, i) =>
        makeTimelineItem(`e${i}`, 1935 + i * 4, 1936 + i * 4, { importance: i < 3 ? 10 + i : 90 }),
      ),
    );
    const layout = layoutTimeline(items, RTL, OPEN_END);
    const events = band(layout, 'event');
    expect(events.items).toHaveLength(12);
    const clusteredIds = events.clusters.flatMap((c) => c.ids).sort();
    expect(clusteredIds).toEqual(['e0', 'e1', 'e2']);
    for (const c of events.clusters) {
      expect(c.end).toBeGreaterThan(c.start); // usable zoom-to-fit target
    }
    expectNoRowCollisions(events);
  });

  it('merges chips that would overlap into one', () => {
    // 20 identical-time low-importance items at one instant → exactly one chip.
    const items = wrap([
      ...Array.from({ length: 20 }, (_, i) =>
        makeTimelineItem(`x${i}`, 1948, 1948.1, { importance: 5 }),
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        makeTimelineItem(`keep${i}`, 1932 + i * 5, 1933 + i * 5, { importance: 95 }),
      ),
    ]);
    const layout = layoutTimeline(items, RTL, OPEN_END);
    const events = band(layout, 'event');
    expect(events.clusters).toHaveLength(1);
    expect(events.clusters[0]!.ids).toHaveLength(20);
  });
});

describe('layoutTimeline — event hierarchy', () => {
  const war = makeTimelineItem('war', 1947.9, 1949.5, { importance: 95 });
  const battleA = makeTimelineItem('battle-a', 1948.3, 1948.6, { importance: 40, parentId: 'war' });
  const battleB = makeTimelineItem('battle-b', 1948.4, 1948.9, { importance: 35, parentId: 'war' });

  it('a parent with visible children becomes a container with children inside', () => {
    const layout = layoutTimeline(wrap([war, battleA, battleB]), RTL, OPEN_END);
    const events = band(layout, 'event');
    const parent = byId(events, 'war');
    expect(parent.isContainer).toBe(true);
    expect(parent.heightRows).toBeGreaterThanOrEqual(2);
    for (const id of ['battle-a', 'battle-b']) {
      const child = byId(events, id);
      expect(child.row).toBeGreaterThan(parent.row);
      expect(child.row).toBeLessThan(parent.row + parent.heightRows);
      // horizontally inside the container box
      expect(child.x).toBeGreaterThanOrEqual(parent.x - 1e-6);
      expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width + 1e-6);
    }
    expectNoRowCollisions(events);
  });

  it('without visible children the same parent is a plain single-row item', () => {
    const layout = layoutTimeline(wrap([war]), RTL, OPEN_END);
    const parent = byId(band(layout, 'event'), 'war');
    expect(parent.isContainer).toBe(false);
    expect(parent.heightRows).toBe(1);
  });

  it('a grandchild flattens into the topmost visible ancestor container', () => {
    const sub = makeTimelineItem('sub', 1948.35, 1948.5, { importance: 20, parentId: 'battle-a' });
    const layout = layoutTimeline(wrap([war, battleA, sub]), RTL, OPEN_END);
    const events = band(layout, 'event');
    const parent = byId(events, 'war');
    const grandchild = byId(events, 'sub');
    expect(parent.isContainer).toBe(true);
    expect(byId(events, 'battle-a').isContainer).toBe(false);
    expect(grandchild.row).toBeGreaterThan(parent.row);
    expect(grandchild.row).toBeLessThan(parent.row + parent.heightRows);
  });
});

describe('layoutTimeline — item shapes', () => {
  it('open-ended lifespan: span reaches openEndYear, flagged openEnded, source end stays null', () => {
    const alive = makeTimelineItem('alive', 1954, null, { kind: 'person', title: 'סופר חי' });
    const layout = layoutTimeline(wrap([alive]), RTL, OPEN_END);
    const p = byId(band(layout, 'person'), 'alive');
    expect(p.openEnded).toBe(true);
    expect(p.item.end).toBeNull(); // the original item is untouched
    // RTL: later time = smaller x → the span's left edge sits at openEndYear.
    expect(p.spanX).toBeCloseTo((2000 - OPEN_END) * 20, 6);
    expect(p.spanWidth).toBeCloseTo((OPEN_END - 1954) * 20, 6);
  });

  it('point items get a centered marker and an aside label box', () => {
    const point = makeTimelineItem('pt', 1948.3671, 1948.3699, { isPoint: true, title: 'הכרזה' });
    const layout = layoutTimeline(wrap([point]), RTL, OPEN_END);
    const p = byId(band(layout, 'event'), 'pt');
    expect(p.labelPlacement).toBe('aside');
    expect(p.markerX).toBeDefined();
    expect(p.markerX!).toBeGreaterThanOrEqual(p.x);
    expect(p.markerX!).toBeLessThanOrEqual(p.x + p.width);
    expect(p.width).toBeGreaterThan(DEFAULT_LAYOUT_CONFIG.pointMarkerPx);
  });

  it('wide bars label inside; narrow bars label aside', () => {
    const layout = layoutTimeline(
      wrap([
        makeTimelineItem('wide', 1940, 1950, {}), // 200px
        makeTimelineItem('narrow', 1960, 1961, {}), // 20px < labelAsideBelowPx
      ]),
      RTL,
      OPEN_END,
    );
    const events = band(layout, 'event');
    expect(byId(events, 'wide').labelPlacement).toBe('inside');
    expect(byId(events, 'narrow').labelPlacement).toBe('aside');
  });

  it('person boxes reserve label width beyond a short lifespan', () => {
    const shortLife = makeTimelineItem('short', 1948, 1950, {
      kind: 'person',
      title: 'שם ארוך מאוד לדמות היסטורית כלשהי',
    });
    const layout = layoutTimeline(wrap([shortLife]), RTL, OPEN_END);
    const p = byId(band(layout, 'person'), 'short');
    expect(p.labelPlacement).toBe('above');
    expect(p.width).toBeGreaterThan(p.spanWidth);
  });

  it('anchors the label inside the viewport when a long span runs off-screen', () => {
    // Born well before the window start: in RTL the birth edge is far off-screen right.
    const person = makeTimelineItem('elder', 1880, 1970, { kind: 'person', title: 'דמות ותיקה' });
    const event = makeTimelineItem('era', 1900, 2010, { title: 'תקופה ארוכה' });
    const layout = layoutTimeline(wrap([person, event]), RTL, OPEN_END);
    for (const positioned of [byId(band(layout, 'person'), 'elder'), byId(band(layout, 'event'), 'era')]) {
      expect(positioned.labelX).toBeGreaterThanOrEqual(0);
      expect(positioned.labelX + positioned.labelWidth).toBeLessThanOrEqual(RTL.widthPx);
      expect(positioned.labelWidth).toBeGreaterThan(0);
    }
  });

  it('RTL and LTR mirror the same span rect', () => {
    const item = makeTimelineItem('m', 1940, 1950, {});
    const rtl = byId(band(layoutTimeline(wrap([item]), RTL, OPEN_END), 'event'), 'm');
    const ltr = byId(band(layoutTimeline(wrap([item]), LTR, OPEN_END), 'event'), 'm');
    expect(rtl.spanWidth).toBeCloseTo(ltr.spanWidth, 6);
    expect(rtl.spanX).toBeCloseTo(RTL.widthPx - (ltr.spanX + ltr.spanWidth), 6);
  });
});
