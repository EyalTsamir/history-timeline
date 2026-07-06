/**
 * The century strip (docs/spec/rendering.md): the always-visible map of the whole range —
 * neutral decade banding, flag dots for anchor events (importance ≥ 80), and a
 * brush marking the current window. Dragging pans (the window center follows
 * the pointer); a tap jumps. The decade chips underneath are the keyboard/AT
 * path to the same navigation, so the strip surface itself stays a pointer
 * affordance (aria-hidden interactive layer + labeled chips).
 *
 * The strip's domain is the DEFAULT (full-range) window, not the pan bounds —
 * bounds stretch back to the earliest lifespan (D12) and would waste half the
 * strip on empty decades. A window panned outside the domain shows its brush
 * clamped to the edge.
 */
import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { DECADES, decadeAt, decadeWindow } from '../app/decades';
import { STRINGS } from '../app/strings.he';
import { APP_CONFIG } from '../app/config';
import type { TimelineItem } from '../domain/timelineItem';
import { LABEL_FLOORS, altitudeOf } from '../timeline/altitude';
import { spanYears } from '../timeline/scale';
import { useViewportStore } from '../state/viewportStore';
import styles from './CenturyStrip.module.css';

interface CenturyStripProps {
  /** Filtered items — anchor events become flag dots. */
  items: readonly TimelineItem[];
}

export function CenturyStrip({ items }: CenturyStripProps) {
  const dir = APP_CONFIG.timeDirection;
  const window = useViewportStore((s) => s.window);
  const defaultWindow = useViewportStore((s) => s.defaultWindow);
  const setWindow = useViewportStore((s) => s.setWindow);
  const reset = useViewportStore((s) => s.reset);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const domain = defaultWindow;
  const domainSpan = spanYears(domain);

  /** Fraction of the domain between t and the PAST edge (axis-direction aware). */
  const frac = (t: number): number => (t - domain.start) / domainSpan;
  /** Physical CSS inset for the past-side edge: right under rtl, left under ltr. */
  const pastSide = dir === 'rtl' ? 'right' : 'left';

  const flags = useMemo(
    () =>
      items.filter(
        (i) =>
          i.kind === 'event' &&
          i.importance >= LABEL_FLOORS.century &&
          i.start >= domain.start &&
          i.start <= domain.end,
      ),
    [items, domain],
  );

  const altitude = altitudeOf(spanYears(window));
  const activeDecade = decadeAt((window.start + window.end) / 2);

  const brush = useMemo(() => {
    const lo = Math.max(0, Math.min(1, frac(window.start)));
    const hi = Math.max(0, Math.min(1, frac(window.end)));
    return { inset: lo * 100, width: Math.max((hi - lo) * 100, 0.5) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window, domain]);

  const timeAtPointer = (clientX: number): number => {
    const el = stripRef.current;
    if (el === null) return (window.start + window.end) / 2;
    const rect = el.getBoundingClientRect();
    const f = (clientX - rect.left) / Math.max(rect.width, 1);
    const fromPast = dir === 'rtl' ? 1 - f : f;
    return domain.start + fromPast * domainSpan;
  };

  const centerAt = (t: number): void => {
    const span = spanYears(window);
    setWindow({ start: t - span / 2, end: t + span / 2 });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging.current = true;
    stripRef.current?.setPointerCapture(e.pointerId);
    centerAt(timeAtPointer(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragging.current) centerAt(timeAtPointer(e.clientX));
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = false;
    if (stripRef.current?.hasPointerCapture?.(e.pointerId)) {
      stripRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className={styles.wrap}>
      <div
        ref={stripRef}
        className={styles.strip}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {DECADES.map((decade, i) => (
          <span
            key={decade.startYear}
            className={i % 2 === 0 ? `${styles.zone} ${styles.zoneAlt}` : styles.zone}
            style={{
              [pastSide]: `${frac(decade.startYear) * 100}%`,
              width: `${(frac(decade.endYear) - frac(decade.startYear)) * 100}%`,
            }}
          />
        ))}
        {flags.map((f) => (
          <span key={f.id} className={styles.flag} style={{ [pastSide]: `${frac(f.start) * 100}%` }} />
        ))}
        {altitude !== 'century' && (
          <span
            className={styles.brush}
            style={{ [pastSide]: `${brush.inset}%`, width: `${brush.width}%` }}
          />
        )}
      </div>

      <div className={styles.chips} role="group" aria-label={STRINGS.decadeChipsLabel}>
        <button
          type="button"
          className={altitude === 'century' ? `${styles.chip} ${styles.chipActive}` : styles.chip}
          onClick={() => reset()}
        >
          {STRINGS.resetView}
        </button>
        {DECADES.map((decade) => {
          const active = altitude !== 'century' && decade.startYear === activeDecade.startYear;
          return (
            <button
              key={decade.startYear}
              type="button"
              className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              aria-label={STRINGS.decadeChipAria(
                STRINGS.decadeName(decade.startYear),
                decade.startYear,
                decade.endYear,
              )}
              onClick={() => setWindow(decadeWindow(decade))}
            >
              {STRINGS.decadeName(decade.startYear)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
