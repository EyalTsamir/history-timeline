/**
 * One positioned timeline item (docs/06). A real <button> (decision D6):
 * focusable, labeled in Hebrew, chronological tab order via DOM order.
 *
 * Kind is signaled by SHAPE, never color alone (docs/08#accessibility):
 *   event span → filled bar with a strong start edge
 *   event point → diamond marker + side label
 *   person → name over a thin lifespan line (open ends fade out)
 *   work → outlined "book chip" with a spine motif
 *   container → header bar of a tinted parent-event block
 *
 * Horizontal geometry arrives as physical px from the layout pipeline (the
 * scale already encoded the axis direction); inside the box, flex/logical
 * properties give the correct RTL/LTR reading order for free.
 */
import type { CSSProperties, MouseEvent } from 'react';
import { STRINGS } from '../app/strings.he';
import type { PositionedItem } from '../timeline/laneLayout';
import styles from './Timeline.module.css';

interface TimelineItemMarkProps {
  p: PositionedItem;
  /** Physical top of the item's row, px. */
  topPx: number;
  rowPx: number;
  /** 'rtl' | 'ltr' — only for the open-end fade mask, which needs a physical side. */
  dir: 'rtl' | 'ltr';
  typeLabel: string;
  selected: boolean;
  onSelect: (e: MouseEvent, id: string) => void;
}

export function TimelineItemMark({ p, topPx, rowPx, dir, typeLabel, selected, onSelect }: TimelineItemMarkProps) {
  const { item } = p;
  const style: CSSProperties & Record<'--item-color', string> = {
    left: p.x,
    top: topPx,
    width: Math.max(p.width, 2),
    height: rowPx - 4,
    '--item-color': `var(--cat-${item.styleToken})`,
  };
  if (p.opacity < 1) style.opacity = p.opacity;

  // 'inside'/'above' labels anchor to the span∩viewport box computed by the
  // layout, so names stay readable when a long span runs off-screen.
  const anchoredLabel = (
    <span className={styles.labelAnchor} style={{ left: p.labelX - p.x, width: p.labelWidth }}>
      <span className={styles.itemLabel}>{item.title}</span>
    </span>
  );

  const classNames = [styles.item];
  let inner;
  if (p.isContainer) {
    classNames.push(styles.containerHeader);
    inner = anchoredLabel;
  } else if (item.kind === 'person') {
    classNames.push(styles.person);
    const lineClass = [styles.personLine];
    if (p.openEnded) lineClass.push(dir === 'rtl' ? styles.fadeOutLeft : styles.fadeOutRight);
    inner = (
      <>
        {anchoredLabel}
        <span
          className={lineClass.join(' ')}
          style={{ left: p.spanX - p.x, width: Math.max(p.spanWidth, 6) }}
          aria-hidden="true"
        />
      </>
    );
  } else if (item.isPoint) {
    classNames.push(styles.point);
    inner = (
      <>
        <span className={styles.pointMarker} aria-hidden="true" />
        <span className={styles.itemLabel}>{item.title}</span>
      </>
    );
  } else {
    const isWork = item.kind === 'work';
    if (p.labelPlacement === 'aside') {
      classNames.push(styles.barAside);
      inner = (
        <>
          <span
            className={isWork ? styles.workSpan : styles.barSpan}
            style={{ width: Math.max(p.spanWidth, 4) }}
            aria-hidden="true"
          />
          <span className={styles.itemLabel}>{item.title}</span>
        </>
      );
    } else {
      classNames.push(isWork ? styles.work : styles.bar);
      inner = anchoredLabel;
    }
  }
  if (selected) classNames.push(styles.selected);

  return (
    <button
      type="button"
      className={classNames.join(' ')}
      style={style}
      data-item-id={item.id}
      aria-label={STRINGS.itemAriaLabel(typeLabel, item.title, item.detail.displayDate)}
      aria-current={selected ? 'true' : undefined}
      onClick={(e) => onSelect(e, item.id)}
    >
      {inner}
    </button>
  );
}
