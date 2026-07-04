/**
 * Item selection (docs/08-interaction.md#selection--detail). Just the id —
 * the detail surface resolves it against the normalized items. No React.
 */
import { create } from 'zustand';
import type { EntityId } from '../domain/entities';

export interface SelectionStore {
  selectedId: EntityId | null;
  select(id: EntityId): void;
  clear(): void;
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  clear: () => set({ selectedId: null }),
}));
