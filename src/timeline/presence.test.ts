import { describe, expect, it } from 'vitest';
import { makeTimelineItem } from '../test/fixtures';
import { castForWindow, shelfForWindow } from './presence';

const WINDOW = { start: 1945, end: 1957 };

describe('castForWindow', () => {
  it('keeps only people whose lifespan intersects the window, weightiest first', () => {
    const items = [
      makeTimelineItem('leader', 1886, 1973, { kind: 'person', importance: 98 }),
      makeTimelineItem('poet-died-early', 1873, 1934, { kind: 'person', importance: 70 }),
      makeTimelineItem('later-writer', 1960, null, { kind: 'person', importance: 60 }),
      makeTimelineItem('general', 1915, 1981, { kind: 'person', importance: 78 }),
      makeTimelineItem('some-event', 1948, 1949, { kind: 'event', importance: 99 }),
    ];
    const cast = castForWindow(items, WINDOW, 2026, 8);
    expect(cast.top.map((i) => i.id)).toEqual(['leader', 'general']);
    expect(cast.rest).toEqual([]);
  });

  it('an open lifespan reaches the window through openEndYear', () => {
    const alive = [makeTimelineItem('alive', 1930, null, { kind: 'person', importance: 50 })];
    expect(castForWindow(alive, { start: 2000, end: 2002 }, 2026, 4).top).toHaveLength(1);
    expect(castForWindow(alive, { start: 2000, end: 2002 }, 1990, 4).top).toHaveLength(0);
  });

  it('splits top/rest at topN with a deterministic order', () => {
    const items = [
      makeTimelineItem('a', 1940, 1990, { kind: 'person', importance: 60 }),
      makeTimelineItem('b', 1940, 1990, { kind: 'person', importance: 80 }),
      makeTimelineItem('c', 1940, 1990, { kind: 'person', importance: 70 }),
    ];
    const cast = castForWindow(items, WINDOW, 2026, 2);
    expect(cast.top.map((i) => i.id)).toEqual(['b', 'c']);
    expect(cast.rest.map((i) => i.id)).toEqual(['a']);
  });
});

describe('shelfForWindow', () => {
  it('membership tests the covered period (D7), not anything else', () => {
    const items = [
      makeTimelineItem('covers-war', 1947.9, 1949, { kind: 'work', importance: 45 }),
      makeTimelineItem('covers-later', 1967, 1974, { kind: 'work', importance: 90 }),
      makeTimelineItem('covers-decades', 1886, 1973, { kind: 'work', importance: 40 }),
      makeTimelineItem('person-not-work', 1900, 1980, { kind: 'person', importance: 99 }),
    ];
    const shelf = shelfForWindow(items, WINDOW, 2026, 8);
    expect(shelf.top.map((i) => i.id)).toEqual(['covers-war', 'covers-decades']);
  });
});
