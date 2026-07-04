/**
 * Regression (review finding): a person lifespan with `end` omitted used to
 * pass as a point-in-time range and silently render a fabricated 1-year life.
 * LifespanSchema requires `end` — a death date, or null while alive.
 */
import { describe, expect, it } from 'vitest';
import { LifespanSchema, PersonSchema } from './entities';

const basePerson = {
  id: 'test-person',
  type: 'person' as const,
  name: { he: 'אדם לדוגמה' },
  bio: { he: 'ביוגרפיה.' },
  categoryIds: ['leaders'],
  importance: 50,
};

describe('person lifespan end requirement', () => {
  it('rejects a lifespan with the end key omitted', () => {
    const result = PersonSchema.safeParse({ ...basePerson, lifespan: { start: '1939' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'lifespan.end')).toBe(true);
    }
  });

  it('accepts an open lifespan (end: null, living person)', () => {
    expect(
      PersonSchema.safeParse({ ...basePerson, lifespan: { start: '1954-01-25', end: null } }).success,
    ).toBe(true);
  });

  it('accepts a closed lifespan', () => {
    expect(
      PersonSchema.safeParse({
        ...basePerson,
        lifespan: { start: '1886-10-16', end: '1973-12-01' },
      }).success,
    ).toBe(true);
  });

  it('LifespanSchema still enforces range order', () => {
    expect(LifespanSchema.safeParse({ start: '1980', end: '1970' }).success).toBe(false);
  });
});
