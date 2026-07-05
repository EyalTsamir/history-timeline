import { describe, expect, it } from 'vitest';
import { makeTimelineItem } from '../test/fixtures';
import type { TimelineItem } from '../domain/timelineItem';
import type { Scale } from './scale';
import type { FieldConfig, FieldLayout } from './fieldLayout';
import { FIELD_CONFIGS, layoutField } from './fieldLayout';

const OPEN_END = 2026;
const NONE = new Set<string>();

/** window 1945–1957 over 1200px → 100 px/year; rtl (past on the right). */
const SCALE: Scale = { window: { start: 1945, end: 1957 }, widthPx: 1200, dir: 'rtl' };

/** Every event id, wherever it landed (mark / chapter head / bead / fold / dot). */
function allIds(layout: FieldLayout): Set<string> {
  const ids = new Set<string>();
  for (const m of layout.marks) ids.add(m.item.id);
  for (const d of layout.dots) ids.add(d.item.id);
  for (const c of layout.chapters) {
    ids.add(c.item.id);
    for (const child of c.children) ids.add(child.item.id);
  }
  return ids;
}

describe('layoutField — presence guarantee (docs/14 principle 2)', () => {
  it('every event is represented; below-floor items become dots, not nothing', () => {
    const items = [
      makeTimelineItem('labeled', 1948, 1949, { importance: 60 }),
      makeTimelineItem('dot-worthy', 1950, 1951, { importance: 20 }),
      makeTimelineItem('person', 1900, 1980, { kind: 'person', importance: 99 }),
    ];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    expect(layout.marks.map((m) => m.item.id)).toEqual(['labeled']);
    expect(layout.dots.map((d) => d.item.id)).toEqual(['dot-worthy']);
    // People never reach the field — they live in the cast strip.
    expect(allIds(layout).has('person')).toBe(false);
  });

  it('century altitude labels only importance ≥ 80; the rest are dots', () => {
    const items = [
      makeTimelineItem('anchor', 1948, 1949, { importance: 80 }),
      makeTimelineItem('major', 1952, 1953, { importance: 79 }),
    ];
    const layout = layoutField(items, SCALE, 'century', NONE, OPEN_END);
    expect(layout.marks.map((m) => m.item.id)).toEqual(['anchor']);
    expect(layout.dots.map((d) => d.item.id)).toEqual(['major']);
  });

  it('row overflow degrades the weakest to dots — never drops them', () => {
    // Same span → same box → each needs its own row; maxRows 2 → one falls out.
    const tight: FieldConfig = { ...FIELD_CONFIGS.decade, maxRows: 2 };
    const items = [
      makeTimelineItem('strong', 1948, 1949, { importance: 90 }),
      makeTimelineItem('middle', 1948, 1949, { importance: 70 }),
      makeTimelineItem('weak', 1948, 1949, { importance: 50 }),
    ];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END, tight);
    expect(layout.marks.map((m) => m.item.id).sort()).toEqual(['middle', 'strong']);
    expect(layout.dots.map((d) => d.item.id)).toEqual(['weak']);
    expect(allIds(layout).size).toBe(3);
  });
});

describe('layoutField — shapes and weight', () => {
  it('importance ≥ 95 renders as a seal with the true span kept as underline', () => {
    const items = [makeTimelineItem('war', 1947.9, 1949.5, { importance: 95 })];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    const seal = layout.marks[0]!;
    expect(seal.shape).toBe('seal');
    expect(seal.markerX).toBeDefined();
    // rtl: span left edge maps from the END of the span.
    expect(seal.spanX).toBeCloseTo((1957 - 1949.5) * 100, 5);
    expect(seal.spanWidth).toBeCloseTo(1.6 * 100, 3);
  });

  it('point events get a marker + side label; wide spans get inside labels', () => {
    const items = [
      makeTimelineItem('point', 1950.5, null, { isPoint: true, importance: 60, end: 1950.5 }),
      makeTimelineItem('wide', 1948, 1951, { importance: 60 }),
    ];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    const point = layout.marks.find((m) => m.item.id === 'point')!;
    const wide = layout.marks.find((m) => m.item.id === 'wide')!;
    expect(point.shape).toBe('point');
    expect(point.labelInside).toBe(false);
    expect(wide.shape).toBe('bar');
    expect(wide.labelInside).toBe(true);
    // Inside labels clamp to the viewport (D14).
    expect(wide.labelX).toBeGreaterThanOrEqual(0);
    expect(wide.labelX + wide.labelWidth).toBeLessThanOrEqual(SCALE.widthPx);
  });

  it('overlapping labeled marks land on different rows deterministically', () => {
    const items = [
      makeTimelineItem('a', 1948, 1950, { importance: 70 }),
      makeTimelineItem('b', 1948.5, 1950.5, { importance: 60 }),
    ];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    const rows = new Map(layout.marks.map((m) => [m.item.id, m.row]));
    expect(rows.get('a')).toBe(0); // packed first (heavier)
    expect(rows.get('b')).toBe(1);
  });
});

describe('layoutField — chapters', () => {
  const family = (): TimelineItem[] => [
    makeTimelineItem('war', 1947.9, 1949.5, { importance: 95 }),
    makeTimelineItem('op-a', 1948.2, 1948.3, { importance: 40, parentId: 'war' }),
    makeTimelineItem('op-b', 1948.2, 1948.3, { importance: 38, parentId: 'war' }),
    makeTimelineItem('op-c', 1948.2, 1948.3, { importance: 36, parentId: 'war' }),
    makeTimelineItem('op-d', 1948.2, 1948.3, { importance: 34, parentId: 'war' }),
    makeTimelineItem('op-e', 1948.2, 1948.3, { importance: 32, parentId: 'war' }),
  ];

  it('a wide labeled parent with in-set children becomes a chapter band', () => {
    const layout = layoutField(family(), SCALE, 'decade', NONE, OPEN_END);
    expect(layout.chapters).toHaveLength(1);
    const chapter = layout.chapters[0]!;
    expect(chapter.item.id).toBe('war');
    expect(chapter.expanded).toBe(false);
    // Identical child boxes: one per row; 2 collapsed rows → 2 shown, 3 folded.
    expect(chapter.children).toHaveLength(2);
    expect(chapter.hiddenCount).toBe(3);
    expect(chapter.rows).toBe(3); // header + 2 child rows
    // Children carry absolute rows under the header.
    expect(chapter.children.map((c) => c.row).sort()).toEqual([chapter.row + 1, chapter.row + 2]);
  });

  it('expanding reveals more children in place (component state, not zoom)', () => {
    const layout = layoutField(family(), SCALE, 'decade', new Set(['war']), OPEN_END);
    const chapter = layout.chapters[0]!;
    expect(chapter.expanded).toBe(true);
    expect(chapter.children).toHaveLength(4); // decade chapterMaxChildRows
    expect(chapter.hiddenCount).toBe(1);
  });

  it('century altitude has no chapters: parent is a mark, children are dots', () => {
    const layout = layoutField(family(), SCALE, 'century', NONE, OPEN_END);
    expect(layout.chapters).toHaveLength(0);
    expect(layout.marks.map((m) => m.item.id)).toEqual(['war']);
    // Co-located children bucket into fewer dot elements, but the merged
    // counts still account for every one of the 5.
    expect(layout.dots.reduce((n, d) => n + d.count, 0)).toBe(5);
  });

  it('a too-narrow parent stays a plain mark; labeled children stand alone', () => {
    const items = [
      makeTimelineItem('short-op', 1948.0, 1948.2, { importance: 60 }),
      makeTimelineItem('sub', 1948.05, 1948.1, { importance: 50, parentId: 'short-op' }),
    ];
    // 0.2y × 100px = 20px < chapterMinSpanPx → no chapter.
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    expect(layout.chapters).toHaveLength(0);
    expect(layout.marks.map((m) => m.item.id).sort()).toEqual(['short-op', 'sub']);
  });
});

describe('layoutField — dots', () => {
  it('a long span crossing the window keeps its dot on-screen (clamped midpoint)', () => {
    // 1949–1979: raw midpoint (1964) is outside the 1945–1957 window.
    const items = [makeTimelineItem('austerity', 1949, 1979, { importance: 20 })];
    const layout = layoutField(items, SCALE, 'decade', NONE, OPEN_END);
    const dot = layout.dots[0]!;
    expect(dot.x).toBeGreaterThanOrEqual(0);
    expect(dot.x).toBeLessThanOrEqual(SCALE.widthPx);
  });

  it('sub-row jitter is deterministic per id', () => {
    const items = [makeTimelineItem('stable', 1950, 1951, { importance: 10 })];
    const a = layoutField(items, SCALE, 'decade', NONE, OPEN_END).dots[0]!;
    const b = layoutField(items, SCALE, 'decade', NONE, OPEN_END).dots[0]!;
    expect(a.subRow).toBe(b.subRow);
    expect(a.subRow).toBeGreaterThanOrEqual(0);
    expect(a.subRow).toBeLessThan(FIELD_CONFIGS.decade.dotSubRows);
  });

  it('same-cell dots merge into one element led by the weightiest item', () => {
    // Enough same-time items to guarantee collisions across the 3 sub-rows.
    const items = [
      makeTimelineItem('w-heavy', 1950.0, 1950.1, { importance: 29 }),
      ...Array.from({ length: 8 }, (_, i) =>
        makeTimelineItem(`w-${i}`, 1950.0, 1950.1, { importance: 10 }),
      ),
    ];
    const layout = layoutField(items, SCALE, 'century', NONE, OPEN_END);
    expect(layout.dots.length).toBeLessThanOrEqual(FIELD_CONFIGS.century.dotSubRows);
    expect(layout.dots.reduce((n, d) => n + d.count, 0)).toBe(9);
    // The bucket containing the heavier item is represented by it.
    const heavyDot = layout.dots.find((d) => d.count > 1 || d.item.id === 'w-heavy');
    expect(heavyDot).toBeDefined();
    const bucketOfHeavy = layout.dots.find((d) => d.item.id === 'w-heavy');
    expect(bucketOfHeavy).toBeDefined(); // importance 29 outranks the 10s in its cell
  });
});
