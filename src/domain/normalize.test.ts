import { describe, expect, it } from 'vitest';
import { makeFixtureDataset } from '../test/fixtures';
import { normalizeDataset } from './normalize';
import type { TimelineItem } from './timelineItem';

const items = normalizeDataset(makeFixtureDataset());

function item(id: string): TimelineItem {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`fixture item "${id}" missing from normalized output`);
  return found;
}

describe('event normalization', () => {
  it('closed-range event spans start-edge to end-edge in decimal years', () => {
    const war = item('fx-war');
    // 1947-11-30 is day 334 of 365; 1949-07-20 is day 201 of 365, end edge exclusive.
    expect(war.start).toBe(1947 + 333 / 365);
    expect(war.end).toBe(1949 + 201 / 365);
    expect(war.isPoint).toBe(false);
  });

  it('day-precision point event is a point with a one-day sliver span', () => {
    const declaration = item('fx-declaration');
    expect(declaration.isPoint).toBe(true);
    // day-of-year of 1948-05-14 is 135 (1948 is a leap year).
    expect(declaration.start).toBe(1948 + 134 / 366);
    expect(declaration.end).toBe(1948 + 135 / 366);
  });

  it('sub-event keeps its parentId', () => {
    expect(item('fx-battle').parentId).toBe('fx-war');
  });

  it('parent event carries childEventIds from the index', () => {
    expect(item('fx-war').detail.childEventIds).toEqual(['fx-battle']);
    expect(item('fx-battle').detail.childEventIds).toBeUndefined();
  });
});

describe('person normalization', () => {
  it('open lifespan → end null and never a point', () => {
    const alive = item('fx-writer-alive');
    expect(alive.start).toBe(1954);
    expect(alive.end).toBeNull();
    expect(alive.isPoint).toBe(false);
  });

  it('person carries workIds (works about them) from the index', () => {
    expect(item('fx-leader').detail.workIds).toEqual(['fx-autobio']);
    expect(item('fx-writer-alive').detail.workIds).toBeUndefined();
  });

  it('carries the entity sources through to detail', () => {
    const sources = item('fx-leader').detail.sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]!.publisher).toBe('Encyclopædia Britannica');
  });
});

describe('work normalization — D7 regression', () => {
  it('positions the work by coveredPeriod, NOT publicationDate', () => {
    const novel = item('fx-novel');
    // coveredPeriod 1947-11 .. 1949: Nov 1 1947 is day 305 of 365; end edge of "1949" is 1950.
    expect(novel.start).toBe(1947 + 304 / 365);
    expect(novel.end).toBe(1950);
    expect(novel.start).not.toBe(2010);
  });

  it('publication data survives in detail', () => {
    const novel = item('fx-novel');
    expect(novel.detail.publicationDateRaw).toBe('2010');
    expect(novel.detail.publicationDate).toBe('2010');
  });
});

describe('styleToken resolution', () => {
  it('event resolves its first category color', () => {
    expect(item('fx-war').styleToken).toBe('war-security');
  });

  it('work resolves its workType color', () => {
    expect(item('fx-autobio').styleToken).toBe('autobiography');
  });

  it('person resolves its first category color', () => {
    expect(item('fx-leader').styleToken).toBe('leaders');
  });

  it('entity with no category falls back to the kind default', () => {
    expect(item('fx-declaration').styleToken).toBe('event');
  });
});

describe('authorNames resolution', () => {
  it('resolves person authors through the people map', () => {
    expect(item('fx-autobio').detail.authorNames).toEqual(['מנהיג לדוגמה']);
  });

  it('falls back to the plain authorName', () => {
    expect(item('fx-novel').detail.authorNames).toEqual(['מחבר חיצוני']);
  });
});

describe('contentType mapping', () => {
  it('maps event / person / workType slug', () => {
    expect(item('fx-war').contentType).toBe('event');
    expect(item('fx-leader').contentType).toBe('person');
    expect(item('fx-autobio').contentType).toBe('autobiography');
    expect(item('fx-novel').contentType).toBe('historical-novel');
  });
});

describe('normalizeDataset ordering', () => {
  it('sorts by start ascending', () => {
    expect(items.map((i) => i.id)).toEqual([
      'fx-autobio',
      'fx-leader',
      'fx-novel',
      'fx-war',
      'fx-battle',
      'fx-declaration',
      'fx-writer-alive',
    ]);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.start).toBeGreaterThanOrEqual(items[i - 1]!.start);
    }
  });

  it('breaks start ties by importance desc, then id asc', () => {
    const dataset = makeFixtureDataset();
    const tie = (id: string, importance: number) => ({
      id,
      type: 'event' as const,
      title: { he: 'שוויון' },
      description: { he: 'שובר שוויון' },
      dates: { start: '1950' },
      importance,
      categoryIds: [],
      regionIds: [],
      links: [],
      sources: [{ title: { he: 'מקור' } }],
    });
    dataset.events.push(tie('fx-tie-b', 50), tie('fx-tie-a', 50), tie('fx-tie-c', 80));
    const tied = normalizeDataset(dataset)
      .filter((i) => i.start === 1950)
      .map((i) => i.id);
    expect(tied).toEqual(['fx-tie-c', 'fx-tie-a', 'fx-tie-b']);
  });
});
