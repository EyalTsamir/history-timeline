import { describe, expect, it } from 'vitest';
import { makeTimelineItem } from '../test/fixtures';
import { applySemanticVisibility, cullToWindow, layoutEnd } from './visibility';
import type { VisibleItem } from './visibility';

const ids = (v: readonly VisibleItem[]): string[] => v.map((x) => x.item.id);

describe('applySemanticVisibility', () => {
  it('keeps items at/above the floor and fades the band just below it', () => {
    const items = [
      makeTimelineItem('high', 1940, 1941, { importance: 80 }),
      makeTimelineItem('at', 1942, 1943, { importance: 50 }),
      makeTimelineItem('fading', 1944, 1945, { importance: 48 }),
      makeTimelineItem('below', 1946, 1947, { importance: 47 }),
    ];
    const visible = applySemanticVisibility(items, 50, 3);
    expect(ids(visible)).toEqual(['high', 'at', 'fading']);
    expect(visible[0]!.opacity).toBe(1);
    expect(visible[2]!.opacity).toBeCloseTo(1 / 3);
  });

  it('preserves the incoming (chronological) order', () => {
    const items = [
      makeTimelineItem('a', 1930, 1931, { importance: 60 }),
      makeTimelineItem('b', 1935, 1936, { importance: 90 }),
      makeTimelineItem('c', 1940, 1941, { importance: 60 }),
    ];
    expect(ids(applySemanticVisibility(items, 0, 3))).toEqual(['a', 'b', 'c']);
  });

  it('drops a sub-event whose parent fell below the threshold', () => {
    const items = [
      makeTimelineItem('parent', 1947, 1949, { importance: 40 }),
      makeTimelineItem('child', 1948, 1948.5, { importance: 90, parentId: 'parent' }),
    ];
    expect(ids(applySemanticVisibility(items, 50, 3))).toEqual([]);
  });

  it('drops a sub-event whose parent was removed by filters (absent from input)', () => {
    const items = [makeTimelineItem('child', 1948, 1948.5, { importance: 90, parentId: 'parent' })];
    expect(ids(applySemanticVisibility(items, 0, 3))).toEqual([]);
  });

  it('walks the whole ancestor chain (grandchild ↔ grandparent)', () => {
    const grandparent = makeTimelineItem('gp', 1947, 1949, { importance: 95 });
    const parent = makeTimelineItem('p', 1948, 1948.6, { importance: 60, parentId: 'gp' });
    const child = makeTimelineItem('c', 1948.2, 1948.3, { importance: 30, parentId: 'p' });

    expect(ids(applySemanticVisibility([grandparent, parent, child], 20, 3))).toEqual(['gp', 'p', 'c']);
    // Middle link below floor → grandchild disappears with it even though its own score passes.
    expect(ids(applySemanticVisibility([grandparent, parent, child], 65, 3))).toEqual(['gp']);
  });
});

describe('cullToWindow', () => {
  const wrap = (items: ReturnType<typeof makeTimelineItem>[]): VisibleItem[] =>
    items.map((item) => ({ item, opacity: 1 }));

  it('keeps items intersecting the window ± buffer and drops the rest', () => {
    const visible = wrap([
      makeTimelineItem('inside', 1950, 1955, {}),
      makeTimelineItem('straddles', 1938, 1952, {}),
      makeTimelineItem('in-buffer', 1925, 1928, {}), // window span 20 → buffer reaches 1920
      makeTimelineItem('far-past', 1880, 1890, {}),
      makeTimelineItem('far-future', 1995, 1999, {}),
    ]);
    const culled = cullToWindow(visible, { start: 1940, end: 1960 }, 1, 2026);
    expect(ids(culled)).toEqual(['inside', 'straddles', 'in-buffer']);
  });

  it('an open-ended lifespan reaches the window through openEndYear', () => {
    const alive = wrap([makeTimelineItem('alive', 1920, null, { kind: 'person' })]);
    expect(ids(cullToWindow(alive, { start: 1990, end: 2000 }, 0, 2026))).toEqual(['alive']);
    // If "today" predates the window, the open span no longer reaches it.
    expect(ids(cullToWindow(alive, { start: 1990, end: 2000 }, 0, 1985))).toEqual([]);
  });
});

describe('layoutEnd', () => {
  it('closed spans keep their end; open spans borrow openEndYear visually', () => {
    expect(layoutEnd(makeTimelineItem('x', 1940, 1950, {}), 2026)).toBe(1950);
    expect(layoutEnd(makeTimelineItem('y', 1954, null, {}), 2026.5)).toBe(2026.5);
    // Never before the start, even with a weird clock.
    expect(layoutEnd(makeTimelineItem('z', 2030, null, {}), 2026.5)).toBe(2030);
  });
});
