/**
 * The cast strip ("מי בתמונה") and period shelf ("מדף התקופה") — docs/14 §5.
 * People and works stopped being geometry on the axis; these strips answer
 * "who is active in the visible window" and "what documents it", updating
 * live as the window moves. Chips are real buttons carrying data-item-id
 * (selection, focus restore, e2e) and open the existing detail surface.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { STRINGS } from '../app/strings.he';
import { currentDecimalYear } from '../domain/dates';
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import type { Presence } from '../timeline/presence';
import { castForWindow, shelfForWindow } from '../timeline/presence';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import styles from './PresenceStrips.module.css';

const CAST_TOP_N = 8;
const SHELF_TOP_N = 5;

interface StripProps {
  items: readonly TimelineItem[];
  /** Selection entry point — the workspace decides what opening an item does. */
  onSelect: (id: EntityId) => void;
}

interface PresenceStripProps {
  title: string;
  presence: Presence;
  chip: (item: TimelineItem, selected: boolean) => ReactNode;
}

/** Shared shell: title, top chips, "+N" toggle revealing the rest. */
function PresenceStrip({ title, presence, chip }: PresenceStripProps) {
  const [expanded, setExpanded] = useState(false);
  const selectedId = useSelectionStore((s) => s.selectedId);

  // A window move can shrink the list — drop the expansion when it becomes moot.
  useEffect(() => {
    if (presence.rest.length === 0) setExpanded(false);
  }, [presence.rest.length]);

  if (presence.top.length === 0) return null;
  const shown = expanded ? [...presence.top, ...presence.rest] : presence.top;

  return (
    <div className={styles.strip}>
      <span className={styles.title}>{title}</span>
      <div className={styles.chips}>
        {shown.map((item) => chip(item, item.id === selectedId))}
        {presence.rest.length > 0 && (
          <button
            type="button"
            className={styles.moreChip}
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={expanded ? STRINGS.presenceCollapse : STRINGS.presenceMoreAria(presence.rest.length)}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? STRINGS.presenceCollapse : STRINGS.presenceMore(presence.rest.length)}
          </button>
        )}
      </div>
    </div>
  );
}

const itemColor = (item: TimelineItem): CSSProperties =>
  ({ '--item-color': `var(--cat-${item.styleToken})` }) as CSSProperties;

/** People active in the visible window, weightiest first. */
export function CastStrip({ items, onSelect }: StripProps) {
  const window = useViewportStore((s) => s.window);
  const openEndYear = useMemo(() => currentDecimalYear(), []);
  const cast = useMemo(
    () => castForWindow(items, window, openEndYear, CAST_TOP_N),
    [items, window, openEndYear],
  );

  return (
    <PresenceStrip
      title={STRINGS.castTitle}
      presence={cast}
      chip={(item, selected) => (
        <button
          key={item.id}
          type="button"
          className={selected ? `${styles.person} ${styles.selectedChip}` : styles.person}
          style={itemColor(item)}
          data-item-id={item.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <i className={styles.avatar} aria-hidden="true">
            {item.title.slice(0, 1)}
          </i>
          <span className={styles.chipLabel}>{item.title}</span>
        </button>
      )}
    />
  );
}

/** Works documenting the visible window (coveredPeriod, D7), weightiest first. */
export function PeriodShelf({ items, onSelect }: StripProps) {
  const window = useViewportStore((s) => s.window);
  const openEndYear = useMemo(() => currentDecimalYear(), []);
  const shelf = useMemo(
    () => shelfForWindow(items, window, openEndYear, SHELF_TOP_N),
    [items, window, openEndYear],
  );

  return (
    <PresenceStrip
      title={STRINGS.shelfTitle}
      presence={shelf}
      chip={(item, selected) => (
        <button
          key={item.id}
          type="button"
          className={selected ? `${styles.book} ${styles.selectedChip}` : styles.book}
          style={itemColor(item)}
          data-item-id={item.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <i className={styles.spine} aria-hidden="true" />
          <span className={styles.chipLabel}>{item.title}</span>
          {item.detail.authorNames?.[0] !== undefined && (
            <span className={styles.author}>{item.detail.authorNames[0]}</span>
          )}
        </button>
      )}
    />
  );
}
