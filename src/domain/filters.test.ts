import { describe, expect, it } from 'vitest';
import { makeFixtureDataset } from '../test/fixtures';
import { normalizeDataset } from './normalize';
import { EMPTY_FILTER_STATE, applyFilters, isFilterActive } from './filters';
import type { FilterState } from './filters';

const dataset = makeFixtureDataset();
const items = normalizeDataset(dataset);

const ALL_IDS = [
  'fx-autobio',
  'fx-battle',
  'fx-declaration',
  'fx-leader',
  'fx-novel',
  'fx-war',
  'fx-writer-alive',
];

function state(partial: Partial<FilterState>): FilterState {
  return { ...EMPTY_FILTER_STATE, ...partial };
}

function idsFor(f: FilterState): string[] {
  return applyFilters(items, f)
    .map((i) => i.id)
    .sort();
}

describe('EMPTY_FILTER_STATE', () => {
  it('is inactive and passes everything', () => {
    expect(isFilterActive(EMPTY_FILTER_STATE)).toBe(false);
    expect(idsFor(EMPTY_FILTER_STATE)).toEqual(ALL_IDS);
  });

  it('any single dimension activates the filter', () => {
    expect(isFilterActive(state({ personCategoryIds: new Set(['writers']) }))).toBe(true);
    expect(isFilterActive(state({ contentTypes: new Set(['person']) }))).toBe(true);
    expect(isFilterActive(state({ minImportance: 1 }))).toBe(true);
  });
});

describe('person-category dimension', () => {
  it('narrows people only — events and works are unaffected', () => {
    expect(idsFor(state({ personCategoryIds: new Set(['writers']) }))).toEqual([
      'fx-autobio',
      'fx-battle',
      'fx-declaration',
      'fx-novel',
      'fx-war',
      'fx-writer-alive',
    ]);
  });
});

describe('contentTypes dimension', () => {
  it('{person} keeps only people', () => {
    expect(idsFor(state({ contentTypes: new Set(['person']) }))).toEqual([
      'fx-leader',
      'fx-writer-alive',
    ]);
  });

  it('{autobiography} keeps only that work type', () => {
    expect(idsFor(state({ contentTypes: new Set(['autobiography']) }))).toEqual(['fx-autobio']);
  });

  it('{event, historical-novel} is OR within the dimension', () => {
    expect(idsFor(state({ contentTypes: new Set(['event', 'historical-novel']) }))).toEqual([
      'fx-battle',
      'fx-declaration',
      'fx-novel',
      'fx-war',
    ]);
  });
});

describe('minImportance dimension', () => {
  it('item.importance === minImportance passes (inclusive floor)', () => {
    // fx-writer-alive has importance exactly 55; fx-battle 40 and fx-novel 45 drop.
    expect(idsFor(state({ minImportance: 55 }))).toEqual([
      'fx-autobio',
      'fx-declaration',
      'fx-leader',
      'fx-war',
      'fx-writer-alive',
    ]);
  });
});

describe('AND across dimensions', () => {
  it('contentType + minImportance', () => {
    // Events only, importance floor 50: fx-battle (40) drops.
    expect(
      idsFor(state({ contentTypes: new Set(['event']), minImportance: 50 })),
    ).toEqual(['fx-declaration', 'fx-war']);
  });

  it('personCategory + minImportance', () => {
    // fx-leader fails the category, fx-battle/fx-novel fail the floor.
    expect(
      idsFor(state({ personCategoryIds: new Set(['writers']), minImportance: 50 })),
    ).toEqual(['fx-autobio', 'fx-declaration', 'fx-war', 'fx-writer-alive']);
  });
});
