import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_FILTER_STATE } from '../domain/filters';
import { selectFilterState, useFilterStore } from './filterStore';

beforeEach(() => {
  useFilterStore.setState({
    regionIds: new Set(),
    personCategoryIds: new Set(),
    contentTypes: new Set(),
    minImportance: 0,
  });
});

describe('useFilterStore', () => {
  it('toggleRegion adds then removes, producing a new Set each time', () => {
    const { toggleRegion } = useFilterStore.getState();
    const before = useFilterStore.getState().regionIds;

    toggleRegion('israel');
    const added = useFilterStore.getState().regionIds;
    expect(added).not.toBe(before);
    expect([...added]).toEqual(['israel']);

    toggleRegion('israel');
    const removed = useFilterStore.getState().regionIds;
    expect(removed).not.toBe(added);
    expect(removed.size).toBe(0);
  });

  it('togglePersonCategory adds then removes', () => {
    const { togglePersonCategory } = useFilterStore.getState();
    togglePersonCategory('leaders');
    expect(useFilterStore.getState().personCategoryIds.has('leaders')).toBe(true);
    togglePersonCategory('leaders');
    expect(useFilterStore.getState().personCategoryIds.has('leaders')).toBe(false);
  });

  it('toggleContentType adds then removes', () => {
    const { toggleContentType } = useFilterStore.getState();
    toggleContentType('biography');
    expect(useFilterStore.getState().contentTypes.has('biography')).toBe(true);
    toggleContentType('biography');
    expect(useFilterStore.getState().contentTypes.has('biography')).toBe(false);
  });

  it('dimensions are independent', () => {
    const { toggleRegion, togglePersonCategory, toggleContentType, setMinImportance } =
      useFilterStore.getState();
    toggleRegion('jerusalem');
    togglePersonCategory('writers');
    toggleContentType('event');
    setMinImportance(40);

    const s = useFilterStore.getState();
    expect([...s.regionIds]).toEqual(['jerusalem']);
    expect([...s.personCategoryIds]).toEqual(['writers']);
    expect([...s.contentTypes]).toEqual(['event']);
    expect(s.minImportance).toBe(40);

    toggleRegion('jerusalem');
    const after = useFilterStore.getState();
    expect(after.regionIds.size).toBe(0);
    expect([...after.personCategoryIds]).toEqual(['writers']);
    expect([...after.contentTypes]).toEqual(['event']);
    expect(after.minImportance).toBe(40);
  });

  it('setMinImportance updates the floor', () => {
    useFilterStore.getState().setMinImportance(70);
    expect(useFilterStore.getState().minImportance).toBe(70);
    useFilterStore.getState().setMinImportance(0);
    expect(useFilterStore.getState().minImportance).toBe(0);
  });

  it('clearAll resets every dimension to EMPTY_FILTER_STATE values', () => {
    const { toggleRegion, togglePersonCategory, toggleContentType, setMinImportance, clearAll } =
      useFilterStore.getState();
    toggleRegion('israel');
    togglePersonCategory('leaders');
    toggleContentType('person');
    setMinImportance(55);

    clearAll();
    const s = selectFilterState(useFilterStore.getState());
    expect(s.regionIds.size).toBe(EMPTY_FILTER_STATE.regionIds.size);
    expect(s.personCategoryIds.size).toBe(EMPTY_FILTER_STATE.personCategoryIds.size);
    expect(s.contentTypes.size).toBe(EMPTY_FILTER_STATE.contentTypes.size);
    expect(s.minImportance).toBe(EMPTY_FILTER_STATE.minImportance);
  });

  it('action references are stable across state updates', () => {
    const before = useFilterStore.getState();
    before.toggleRegion('israel');
    const after = useFilterStore.getState();
    expect(after.toggleRegion).toBe(before.toggleRegion);
    expect(after.clearAll).toBe(before.clearAll);
  });
});
