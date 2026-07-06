/**
 * The timeline workspace: existing filtered data flow → interactive Timeline;
 * selection → detail side panel (docs/spec/interaction.md); URL-hash sync for
 * shareable state (docs/spec/architecture.md). Filter changes only swap the
 * item list — the user's period and zoom are never reset. Desktop-only.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
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
import { CenturyStrip } from './CenturyStrip';
import { DetailPanel } from './DetailPanel';
import { CastStrip, PeriodShelf } from './PresenceStrips';
import { Timeline } from './Timeline';
import styles from './TimelineWorkspace.module.css';

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  /** The timeline surface — focus fallback when a selected item is culled off-screen. */
  const surfaceRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    surfaceRef.current = rootRef.current?.querySelector<HTMLElement>('[role="application"]') ?? null;
  });

  const filtered = useMemo(() => applyFilters(items, filters), [items, filters]);
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

  // Keyboard flow (docs/spec/interaction.md): Enter on an item moves focus into the
  // panel; skip the mount-time value so a URL-restored selection doesn't yank
  // focus on load.
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    if (selectedId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedId;
    if (selectedId !== null) panelRef.current?.focus();
  }, [selectedId]);

  const closeDetail = (): void => {
    const id = selectedId;
    clearSelection();
    // The side panel has no focus owner of its own, so restore focus here: to
    // the originating item, or the surface if it was culled off-screen while
    // the panel was open.
    const origin = id !== null ? rootRef.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`) : null;
    if (origin) origin.focus();
    else surfaceRef.current?.focus();
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
    // Only events live on the canvas (docs/spec/rendering.md) — people/works open their
    // detail from the strips, and panning the window at them shows nothing.
    if (item.kind === 'event') panIntoView(item);
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
        <span role="status" aria-live="polite">
          {STRINGS.shownCount(filtered.length, items.length)}
        </span>
        {isFilterActive(filters) && <Button onClick={clearAll}>{STRINGS.clearAll}</Button>}
      </div>

      <CenturyStrip items={filtered} />

      <div className={selected !== undefined ? `${styles.stage} ${styles.stageWithPanel}` : styles.stage}>
        <div className={styles.canvasColumn}>
          <Timeline items={filtered} typeLabels={typeLabels} />
          <CastStrip items={filtered} onSelect={onSelectRelated} />
          <PeriodShelf items={filtered} onSelect={onSelectRelated} />
        </div>

        {selected !== undefined && (
          <aside
            ref={panelRef}
            tabIndex={-1}
            className={styles.detailPanel}
            style={{ '--item-color': `var(--cat-${selected.styleToken})` } as CSSProperties}
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
    </div>
  );
}
