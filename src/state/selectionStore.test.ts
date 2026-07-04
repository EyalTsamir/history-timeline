import { describe, expect, it } from 'vitest';
import { useSelectionStore } from './selectionStore';

describe('selectionStore', () => {
  it('selects and clears', () => {
    useSelectionStore.getState().select('war-of-independence');
    expect(useSelectionStore.getState().selectedId).toBe('war-of-independence');
    useSelectionStore.getState().select('golda-meir');
    expect(useSelectionStore.getState().selectedId).toBe('golda-meir');
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });
});
