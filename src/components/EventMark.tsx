/**
 * One positioned event mark on the field (docs/14 §4). A real <button>
 * (decision D6): focusable, labeled in Hebrew, chronological tab order.
 *
 * Weight is carried by SHAPE + SIZE, never color alone (docs/08#accessibility):
 *   seal   → brass medal + serif headline (importance ≥ 95) over a span underline
 *   bar    → filled span bar, strong start edge; label inside when wide enough
 *   point  → diamond marker sized by tier + side label
 * Chapter children render the same shapes in a compact "bead" style.
 *
 * Horizontal geometry arrives as physical px from the layout pipeline (the
 * scale already encoded the axis direction); inside the box, flex/logical
 * properties give the correct RTL/LTR reading order for free.
 */
import type { CSSProperties, MouseEvent } from 'react';
import { STRINGS } from '../app/strings.he';
import type { FieldMark } from '../timeline/fieldLayout';
import styles from './Timeline.module.css';

interface EventMarkProps {
  mark: FieldMark;
  /** Physical top of the mark's row, px. */
  topPx: number;
  rowPx: number;
  typeLabel: string;
  selected: boolean;
  onSelect: (e: MouseEvent, id: string) => void;
}

export function EventMark({ mark, topPx, rowPx, typeLabel, selected, onSelect }: EventMarkProps) {
  const { item, tier } = mark;
  const style: CSSProperties & Record<'--item-color', string> = {
    left: mark.x,
    top: topPx,
    width: Math.max(mark.width, 2),
    height: rowPx - 4,
    '--item-color': `var(--cat-${item.styleToken})`,
  };

  const classNames = [styles.mark, styles[`tier-${tier}`]];
  if (mark.inChapter) classNames.push(styles.bead);
  if (selected) classNames.push(styles.selected);

  let inner;
  if (mark.shape === 'seal') {
    classNames.push(styles.seal);
    inner = (
      <>
        {mark.spanWidth > 30 && (
          <span
            className={styles.sealSpan}
            style={{ left: mark.spanX - mark.x, width: mark.spanWidth }}
            aria-hidden="true"
          />
        )}
        <span className={styles.sealMedal} aria-hidden="true" />
        <span className={styles.markLabel}>{item.title}</span>
      </>
    );
  } else if (mark.shape === 'point') {
    classNames.push(styles.point);
    inner = (
      <>
        <span className={styles.pointMarker} aria-hidden="true" />
        <span className={styles.markLabel}>{item.title}</span>
      </>
    );
  } else if (mark.labelInside) {
    classNames.push(styles.barInside);
    inner = (
      <span className={styles.labelAnchor} style={{ left: mark.labelX - mark.x, width: mark.labelWidth }}>
        <span className={styles.markLabel}>{item.title}</span>
      </span>
    );
  } else {
    classNames.push(styles.barAside);
    inner = (
      <>
        <span
          className={styles.barSpan}
          style={{ width: Math.max(mark.spanWidth, 4) }}
          aria-hidden="true"
        />
        <span className={styles.markLabel}>{item.title}</span>
      </>
    );
  }

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
