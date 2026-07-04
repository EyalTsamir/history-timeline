import { describe, expect, it } from 'vitest';
import type { SafeParseReturnType } from 'zod';
import {
  EventSchema,
  PersonSchema,
  RegionSchema,
  RelationSchema,
  WorkSchema,
} from './entities';

/** Dotted issue paths of a failed safeParse; throws if the parse succeeded. */
function pathsOf(result: SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) throw new Error('expected the parse to fail');
  return result.error.issues.map((i) => i.path.join('.'));
}

function codesOf(result: SafeParseReturnType<unknown, unknown>): string[] {
  if (result.success) throw new Error('expected the parse to fail');
  return result.error.issues.map((i) => i.code);
}

const minimalEvent = () => ({
  id: 'test-event',
  type: 'event' as const,
  title: { he: 'כותרת' },
  description: { he: 'תיאור' },
  dates: { start: '1948' },
  importance: 50,
});

const minimalPerson = () => ({
  id: 'test-person',
  type: 'person' as const,
  name: { he: 'שם' },
  bio: { he: 'ביוגרפיה' },
  lifespan: { start: '1900', end: '1980' },
  categoryIds: ['leaders'],
  importance: 50,
});

const minimalWork = () => ({
  id: 'test-work',
  type: 'work' as const,
  workType: 'biography',
  title: { he: 'ספר' },
  description: { he: 'תיאור' },
  authorName: { he: 'מחבר' },
  publicationDate: '1975',
  coveredPeriod: { start: '1900', end: '1950' },
  importance: 50,
});

describe('EventSchema', () => {
  it('parses a minimal event and applies array defaults', () => {
    const parsed = EventSchema.parse(minimalEvent());
    expect(parsed.categoryIds).toEqual([]);
    expect(parsed.regionIds).toEqual([]);
    expect(parsed.links).toEqual([]);
  });

  it('rejects a non-slug id at path id', () => {
    const result = EventSchema.safeParse({ ...minimalEvent(), id: 'Bad_ID' });
    expect(pathsOf(result)).toContain('id');
  });

  it('rejects empty Hebrew text at path title.he', () => {
    const result = EventSchema.safeParse({ ...minimalEvent(), title: { he: '' } });
    expect(pathsOf(result)).toContain('title.he');
  });

  it('rejects an invalid date string at path dates.start', () => {
    const result = EventSchema.safeParse({ ...minimalEvent(), dates: { start: '1948-13' } });
    expect(pathsOf(result)).toContain('dates.start');
  });

  it('rejects a closed range whose end precedes its start at path dates', () => {
    const result = EventSchema.safeParse({ ...minimalEvent(), dates: { start: '1949', end: '1948' } });
    expect(pathsOf(result)).toContain('dates');
  });

  it.each([0, 101, 3.5])('rejects importance %p at path importance', (importance) => {
    const result = EventSchema.safeParse({ ...minimalEvent(), importance });
    expect(pathsOf(result)).toContain('importance');
  });

  it('rejects an unknown extra key (strict)', () => {
    const result = EventSchema.safeParse({ ...minimalEvent(), surprise: true });
    expect(codesOf(result)).toContain('unrecognized_keys');
  });

  it('rejects a bad link URL at path links.0.url', () => {
    const result = EventSchema.safeParse({
      ...minimalEvent(),
      links: [{ label: { he: 'קישור' }, url: 'not-a-url' }],
    });
    expect(pathsOf(result)).toContain('links.0.url');
  });
});

describe('PersonSchema', () => {
  it('parses a minimal person and applies array defaults', () => {
    const parsed = PersonSchema.parse(minimalPerson());
    expect(parsed.regionIds).toEqual([]);
    expect(parsed.links).toEqual([]);
  });

  it('accepts an open lifespan (end null)', () => {
    const parsed = PersonSchema.parse({ ...minimalPerson(), lifespan: { start: '1954', end: null } });
    expect(parsed.lifespan.end).toBeNull();
  });

  it('rejects empty categoryIds at path categoryIds', () => {
    const result = PersonSchema.safeParse({ ...minimalPerson(), categoryIds: [] });
    expect(pathsOf(result)).toContain('categoryIds');
  });

  it('rejects an unknown extra key (strict)', () => {
    const result = PersonSchema.safeParse({ ...minimalPerson(), nickname: 'x' });
    expect(codesOf(result)).toContain('unrecognized_keys');
  });
});

describe('WorkSchema', () => {
  it('parses a minimal work (authorName only) and applies array defaults', () => {
    const parsed = WorkSchema.parse(minimalWork());
    expect(parsed.authorPersonIds).toEqual([]);
    expect(parsed.subjectPersonIds).toEqual([]);
    expect(parsed.subjectEventIds).toEqual([]);
    expect(parsed.regionIds).toEqual([]);
    expect(parsed.links).toEqual([]);
  });

  it('accepts authorPersonIds without authorName', () => {
    const { authorName: _omitted, ...rest } = minimalWork();
    const parsed = WorkSchema.parse({ ...rest, authorPersonIds: ['test-person'] });
    expect(parsed.authorPersonIds).toEqual(['test-person']);
  });

  it('rejects a work with neither authorPersonIds nor authorName at path authorName', () => {
    const { authorName: _omitted, ...rest } = minimalWork();
    const result = WorkSchema.safeParse(rest);
    expect(pathsOf(result)).toContain('authorName');
  });

  it('rejects a coveredPeriod whose end precedes its start at path coveredPeriod', () => {
    const result = WorkSchema.safeParse({
      ...minimalWork(),
      coveredPeriod: { start: '1950', end: '1900' },
    });
    expect(pathsOf(result)).toContain('coveredPeriod');
  });

  it('rejects an unknown extra key (strict)', () => {
    const result = WorkSchema.safeParse({ ...minimalWork(), isbn: '000' });
    expect(codesOf(result)).toContain('unrecognized_keys');
  });
});

describe('RelationSchema', () => {
  it('parses a minimal relation', () => {
    const parsed = RelationSchema.parse({ from: 'a', to: 'b', type: 'led' });
    expect(parsed.type).toBe('led');
  });

  it('rejects an unknown relation type at path type', () => {
    const result = RelationSchema.safeParse({ from: 'a', to: 'b', type: 'married-to' });
    expect(pathsOf(result)).toContain('type');
  });
});

describe('RegionSchema', () => {
  it('parses a minimal region', () => {
    const parsed = RegionSchema.parse({ id: 'israel', name: { he: 'ישראל' }, kind: 'country' });
    expect(parsed.kind).toBe('country');
  });

  it('rejects an unknown geo kind at path kind', () => {
    const result = RegionSchema.safeParse({ id: 'mars', name: { he: 'מאדים' }, kind: 'planet' });
    expect(pathsOf(result)).toContain('kind');
  });
});
