/**
 * The timeline workspace: existing filtered data flow → interactive Timeline;
 * selection → detail surface (desktop side panel / mobile bottom sheet,
 * docs/08); URL-hash sync for shareable state (docs/02). Filter changes only
 * swap the item list — the user's period and zoom are never reset.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { STRINGS } from '../app/strings.he';
import { startTimelineUrlSync } from '../app/urlState';
import type { Dataset } from '../domain/dataset';
import type { EntityId } from '../domain/entities';
import { currentDecimalYear } from '../domain/dates';
import { applyFilters, isFilterActive } from '../domain/filters';
import type { TimelineItem } from '../domain/timelineItem';
import { spanYears } from '../timeline/scale';
import { layoutEnd } from '../timeline/visibility';
import { selectFilterState, useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { Button } from './Button';
import { DetailPanel } from './DetailPanel';
import { Sheet } from './Sheet';
import { Timeline } from './Timeline';
import styles from './TimelineWorkspace.module.css';

/** Single breakpoint (docs/08): side panel ↔ bottom sheet. jsdom → desktop. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 900px)').matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = (e: MediaQueryListEvent): void => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

interface TimelineWorkspaceProps {
  items: readonly TimelineItem[];
  dataset: Dataset;
}

export function TimelineWorkspace({ items, dataset }: TimelineWorkspaceProps) {
  const filters = useFilterStore(selectFilterState);
  const clearAll = useFilterStore((s) => s.clearAll);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const select = useSelectionStore((s) => s.select);
  const clearSelection = useSelectionStore((s) => s.clear);
  const setWindow = useViewportStore((s) => s.setWindow);
  const isDesktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const filtered = useMemo(
    () => applyFilters(items, filters, dataset.indexes.regionDescendants),
    [items, filters, dataset],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);
  const typeLabels = useMemo(() => {
    const labels = new Map<string, string>([
      ['event', STRINGS.kindEvent],
      ['person', STRINGS.kindPerson],
    ]);
    for (const wt of dataset.workTypes) labels.set(wt.id, wt.name.he);
    return labels;
  }, [dataset]);
  const openEndYear = useMemo(() => currentDecimalYear(), []);

  const selected = selectedId !== null ? itemById.get(selectedId) : undefined;

  // Mirror viewport/filters/selection into the URL hash (and back).
  useEffect(() => startTimelineUrlSync(items, dataset), [items, dataset]);

  // Keyboard flow (docs/08): Enter on an item moves focus into the desktop
  // panel; skip the mount-time value so a URL-restored selection doesn't yank
  // focus on load.
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    if (selectedId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedId;
    if (selectedId !== null && isDesktop) panelRef.current?.focus();
  }, [selectedId, isDesktop]);

  const closeDetail = (): void => {
    const id = selectedId;
    clearSelection();
    if (id !== null) rootRef.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`)?.focus();
  };

  /** Bring an item into view without changing zoom unless it doesn't fit. */
  const panIntoView = (item: TimelineItem): void => {
    const window = useViewportStore.getState().window;
    const end = layoutEnd(item, openEndYear);
    const itemSpan = Math.max(end - item.start, 1e-6);
    const span = itemSpan > spanYears(window) * 0.9 ? itemSpan * 1.5 : spanYears(window);
    const center = (item.start + end) / 2;
    setWindow({ start: center - span / 2, end: center + span / 2 });
  };

  const onSelectRelated = (id: EntityId): void => {
    const item = itemById.get(id);
    if (item === undefined) return;
    select(id);
    panIntoView(item);
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDetail();
    }
  };

  const detailBody = selected !== undefined && (
    <DetailPanel
      item={selected}
      dataset={dataset}
      typeLabels={typeLabels}
      itemById={itemById}
      onSelectRelated={onSelectRelated}
    />
  );

  return (
    <div className={styles.workspace} ref={rootRef}>
      <div className={styles.resultsLine}>
        <span>{STRINGS.shownCount(filtered.length, items.length)}</span>
        {isFilterActive(filters) && <Button onClick={clearAll}>{STRINGS.clearAll}</Button>}
      </div>

      <div className={isDesktop && selected !== undefined ? `${styles.stage} ${styles.stageWithPanel}` : styles.stage}>
        <Timeline items={filtered} typeLabels={typeLabels} />

        {isDesktop && selected !== undefined && (
          <aside
            ref={panelRef}
            tabIndex={-1}
            className={styles.detailPanel}
            aria-label={STRINGS.detailPanelLabel}
            onKeyDown={onPanelKeyDown}
          >
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{selected.title}</h2>
              <Button aria-label={STRINGS.close} onClick={closeDetail}>
                <span aria-hidden="true">✕</span>
              </Button>
            </div>
            {detailBody}
          </aside>
        )}
      </div>

      {!isDesktop && (
        <Sheet
          open={selected !== undefined}
          side="bottom"
          title={selected?.title ?? ''}
          closeLabel={STRINGS.close}
          onClose={closeDetail}
        >
          {detailBody}
        </Sheet>
      )}
    </div>
  );
}
