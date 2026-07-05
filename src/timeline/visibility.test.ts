import { describe, expect, it } from 'vitest';
import { makeTimelineItem } from '../test/fixtures';
import type { TimelineItem } from '../domain/timelineItem';
import { cullToWindow, layoutEnd } from './visibility';

const ids = (v: readonly TimelineItem[]): string[] => v.map((x) => x.id);

describe('cullToWindow', () => {
  it('keeps items intersecting the window ± buffer and drops the rest', () => {
    const items = [
      makeTimelineItem('inside', 1950, 1955, {}),
      makeTimelineItem('straddles', 1938, 1952, {}),
      makeTimelineItem('in-buffer', 1925, 1928, {}), // window span 20 → buffer reaches 1920
      makeTimelineItem('far-past', 1880, 1890, {}),
      makeTimelineItem('far-future', 1995, 1999, {}),
    ];
    const culled = cullToWindow(items, { start: 1940, end: 1960 }, 1, 2026);
    expect(ids(culled)).toEqual(['inside', 'straddles', 'in-buffer']);
  });

  it('an open-ended lifespan reaches the window through openEndYear', () => {
    const alive = [makeTimelineItem('alive', 1920, null, { kind: 'person' })];
    expect(ids(cullToWindow(alive, { start: 1990, end: 2000 }, 0, 2026))).toEqual(['alive']);
    // If "today" predates the window, the open span no longer reaches it.
    expect(ids(cullToWindow(alive, { start: 1990, end: 2000 }, 0, 1985))).toEqual([]);
  });

  it('preserves the incoming (chronological) order', () => {
    const items = [
      makeTimelineItem('a', 1941, 1942, {}),
      makeTimelineItem('b', 1945, 1946, {}),
      makeTimelineItem('c', 1950, 1951, {}),
    ];
    expect(ids(cullToWindow(items, { start: 1930, end: 1960 }, 0, 2026))).toEqual(['a', 'b', 'c']);
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
