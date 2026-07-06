import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_FILTER_STATE } from '../domain/filters';
import { selectFilterState, useFilterStore } from './filterStore';

beforeEach(() => {
  useFilterStore.setState({
    personCategoryIds: new Set(),
    contentTypes: new Set(),
    minImportance: 0,
  });
});

describe('useFilterStore', () => {
  it('togglePersonCategory adds then removes, producing a new Set each time', () => {
    const { togglePersonCategory } = useFilterStore.getState();
    const before = useFilterStore.getState().personCategoryIds;

    togglePersonCategory('leaders');
    const added = useFilterStore.getState().personCategoryIds;
    expect(added).not.toBe(before);
    expect([...added]).toEqual(['leaders']);

    togglePersonCategory('leaders');
    const removed = useFilterStore.getState().personCategoryIds;
    expect(removed).not.toBe(added);
    expect(removed.size).toBe(0);
  });

  it('toggleContentType adds then removes', () => {
    const { toggleContentType } = useFilterStore.getState();
    toggleContentType('biography');
    expect(useFilterStore.getState().contentTypes.has('biography')).toBe(true);
    toggleContentType('biography');
    expect(useFilterStore.getState().contentTypes.has('biography')).toBe(false);
  });

  it('dimensions are independent', () => {
    const { togglePersonCategory, toggleContentType, setMinImportance } = useFilterStore.getState();
    togglePersonCategory('writers');
    toggleContentType('event');
    setMinImportance(40);

    const s = useFilterStore.getState();
    expect([...s.personCategoryIds]).toEqual(['writers']);
    expect([...s.contentTypes]).toEqual(['event']);
    expect(s.minImportance).toBe(40);

    togglePersonCategory('writers');
    const after = useFilterStore.getState();
    expect(after.personCategoryIds.size).toBe(0);
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
    const { togglePersonCategory, toggleContentType, setMinImportance, clearAll } =
      useFilterStore.getState();
    togglePersonCategory('leaders');
    toggleContentType('person');
    setMinImportance(55);

    clearAll();
    const s = selectFilterState(useFilterStore.getState());
    expect(s.personCategoryIds.size).toBe(EMPTY_FILTER_STATE.personCategoryIds.size);
    expect(s.contentTypes.size).toBe(EMPTY_FILTER_STATE.contentTypes.size);
    expect(s.minImportance).toBe(EMPTY_FILTER_STATE.minImportance);
  });

  it('action references are stable across state updates', () => {
    const before = useFilterStore.getState();
    before.togglePersonCategory('leaders');
    const after = useFilterStore.getState();
    expect(after.togglePersonCategory).toBe(before.togglePersonCategory);
    expect(after.clearAll).toBe(before.clearAll);
  });
});
