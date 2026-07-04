import { describe, expect, it } from 'vitest';
import { makeFixtureDataset } from '../test/fixtures';
import { normalizeDataset } from './normalize';
import {
  EMPTY_FILTER_STATE,
  applyFilters,
  expandSelectedRegions,
  isFilterActive,
} from './filters';
import type { FilterState } from './filters';

const dataset = makeFixtureDataset();
const items = normalizeDataset(dataset);
const regionDescendants = dataset.indexes.regionDescendants;

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
  return applyFilters(items, f, regionDescendants)
    .map((i) => i.id)
    .sort();
}

describe('EMPTY_FILTER_STATE', () => {
  it('is inactive and passes everything', () => {
    expect(isFilterActive(EMPTY_FILTER_STATE)).toBe(false);
    expect(idsFor(EMPTY_FILTER_STATE)).toEqual(ALL_IDS);
  });

  it('any single dimension activates the filter', () => {
    expect(isFilterActive(state({ regionIds: new Set(['israel']) }))).toBe(true);
    expect(isFilterActive(state({ personCategoryIds: new Set(['writers']) }))).toBe(true);
    expect(isFilterActive(state({ contentTypes: new Set(['person']) }))).toBe(true);
    expect(isFilterActive(state({ minImportance: 1 }))).toBe(true);
  });
});

describe('region dimension', () => {
  it('selecting a parent includes descendants (israel → jerusalem sub-event too)', () => {
    expect(idsFor(state({ regionIds: new Set(['israel']) }))).toEqual(ALL_IDS);
  });

  it('selecting a leaf excludes israel-only items', () => {
    expect(idsFor(state({ regionIds: new Set(['jerusalem']) }))).toEqual([
      'fx-battle',
      'fx-writer-alive',
    ]);
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
  it('region + contentType', () => {
    expect(
      idsFor(state({ regionIds: new Set(['jerusalem']), contentTypes: new Set(['event']) })),
    ).toEqual(['fx-battle']);
  });

  it('personCategory + minImportance', () => {
    // fx-leader fails the category, fx-battle/fx-novel fail the floor.
    expect(
      idsFor(state({ personCategoryIds: new Set(['writers']), minImportance: 50 })),
    ).toEqual(['fx-autobio', 'fx-declaration', 'fx-war', 'fx-writer-alive']);
  });
});

describe('expandSelectedRegions', () => {
  it('expands a parent to self + all descendants', () => {
    expect([...expandSelectedRegions(new Set(['israel']), regionDescendants)].sort()).toEqual([
      'israel',
      'jerusalem',
      'tel-aviv',
    ]);
  });

  it('an id missing from the index falls back to itself', () => {
    expect([...expandSelectedRegions(new Set(['atlantis']), regionDescendants)]).toEqual([
      'atlantis',
    ]);
  });
});
