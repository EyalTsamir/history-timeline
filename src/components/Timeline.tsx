/**
 * The event-field canvas (docs/spec/rendering.md): weighted event marks +
 * chapter bands + the always-present dot band, over the adaptive ruler.
 *
 * Rendering: pure pipeline output only — filters (upstream) → cull →
 * layoutField, memoized on the SETTLED window. During a pan gesture the
 * item/ruler layers move by CSS transform alone; layout recomputes when the
 * gesture settles, crosses the cull buffer, or the window span changes
 * (rAF-throttled) — docs/spec/performance.md's transform-only rule.
 *
 * Zoom is ALTITUDE STEPPING (docs/spec/zoom.md): wheel/pinch deltas accumulate to a
 * threshold and step century↔decade↔year anchored at the pointer; panning
 * stays continuous. Every gesture keeps a non-gesture equivalent (buttons,
 * segmented control, keyboard).
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, UIEvent } from 'react';
import { APP_CONFIG } from '../app/config';
import { decadeAt } from '../app/decades';
import { STRINGS } from '../app/strings.he';
import { currentDecimalYear } from '../domain/dates';
import type { EntityId } from '../domain/entities';
import type { TimelineItem } from '../domain/timelineItem';
import type { Altitude } from '../timeline/altitude';
import { altitudeOf, canonicalSpan, stepAltitude } from '../timeline/altitude';
import { TIMELINE_INTERACTION } from '../timeline/config';
import { FIELD_CONFIGS, layoutField } from '../timeline/fieldLayout';
import type { FieldChapter } from '../timeline/fieldLayout';
import {
  panOffsetPx,
  panWindowByPx,
  spanYears,
  xOf,
  zoomWindowAtPx,
} from '../timeline/scale';
import type { Scale, TimeWindow } from '../timeline/scale';
import { formatWindowRange, generateTicks } from '../timeline/ticks';
import { cullToWindow } from '../timeline/visibility';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { Button } from './Button';
import { EventMark } from './EventMark';
import styles from './Timeline.module.css';

/** Row metrics (px) per altitude — mirrored by the CSS module's sizes. */
const ROW_PX: Record<Altitude, number> = { century: 46, decade: 36, year: 34 };
const FIELD_PAD_TOP_PX = 10;
const DOT_ROW_PX = 13;
const DOT_BAND_PAD_PX = 8;
/** jsdom / first-paint fallback before ResizeObserver reports. */
const FALLBACK_WIDTH_PX = 960;
/** Wheel accumulation resets after this idle gap (a new gesture intent). */
const WHEEL_IDLE_MS = 400;
/** No-transition modifier toggled on the field layer during pan re-anchors (see CSS). */
const INSTANT_CLASS = styles.instant!;

interface TimelineProps {
  /** Already user-filtered, time-sorted items (docs/spec/filtering.md flows in above us). */
  items: readonly TimelineItem[];
  /** contentType → Hebrew label, for accessible item names. */
  typeLabels: ReadonlyMap<string, string>;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Live "where am I" readout — decade name + visible range; isolated so per-frame
 * pans re-render only this. aria-live announces changes politely.
 */
function RangeReadout() {
  const window = useViewportStore((s) => s.window);
  const wholeRange = altitudeOf(spanYears(window)) === 'century';
  const decade = decadeAt((window.start + window.end) / 2);
  return (
    <span className={styles.readout} aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{STRINGS.visibleRangeLabel}: </span>
      <strong>{wholeRange ? STRINGS.readoutWholeRange : STRINGS.decadeName(decade.startYear)}</strong> ·{' '}
      {formatWindowRange(window)}
    </span>
  );
}

export function Timeline({ items, typeLabels }: TimelineProps) {
  const dir = APP_CONFIG.timeDirection;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const bandsLayerRef = useRef<HTMLDivElement | null>(null);
  const rulerLayerRef = useRef<HTMLDivElement | null>(null);

  const [widthPx, setWidthPx] = useState(FALLBACK_WIDTH_PX);
  const widthRef = useRef(widthPx);
  widthRef.current = widthPx;

  const setWindow = useViewportStore((s) => s.setWindow);
  const resetView = useViewportStore((s) => s.reset);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const select = useSelectionStore((s) => s.select);
  const clearSelection = useSelectionStore((s) => s.clear);

  /** The window the current layout was computed for (≠ live window mid-gesture). */
  const [layoutWindow, setLayoutWindow] = useState<TimeWindow>(() => useViewportStore.getState().window);
  const layoutWindowRef = useRef(layoutWindow);
  layoutWindowRef.current = layoutWindow;

  /** Chapters the user opened in place ("עוד N") — never a zoom change. */
  const [expandedChapters, setExpandedChapters] = useState<ReadonlySet<EntityId>>(new Set());

  const openEndYear = useMemo(() => currentDecimalYear(), []);

  // --- width tracking --------------------------------------------------------
  useEffect(() => {
    const el = surfaceRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0 && Math.abs(w - widthRef.current) > 0.5) setWidthPx(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- live-window subscription: transform fast-path, settle/zoom relayout ---
  const applyTransform = useCallback((px: number) => {
    const transform = `translateX(${px}px)`;
    if (bandsLayerRef.current) bandsLayerRef.current.style.transform = transform;
    if (rulerLayerRef.current) rulerLayerRef.current.style.transform = transform;
  }, []);

  useEffect(() => {
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let pendingInstant = false;
    /**
     * `instant` relayouts re-anchor a pan: the transform reset restores every
     * item to the exact same screen position, so their `left`/`top` transition
     * must be off for this commit or they slide by the accumulated offset
     * (Timeline.module.css `.instant`). Zoom/filter relayouts animate.
     */
    const relayout = (instant: boolean): void => {
      if (instant) bandsLayerRef.current?.classList.add(INSTANT_CLASS);
      setLayoutWindow(useViewportStore.getState().window);
    };
    const unsubscribe = useViewportStore.subscribe((s) => {
      const live = s.window;
      const layout = layoutWindowRef.current;
      const width = widthRef.current;
      const isPan = Math.abs(spanYears(live) - spanYears(layout)) < 1e-9;
      if (isPan) {
        // Keep the sheet glued to the live window at ALL times — the transform
        // tracks even past the buffer, so a pan never freezes and then snaps to
        // catch up. The buffer only decides when to relayout to refill items.
        const offset = panOffsetPx(layout, live, width, dir);
        applyTransform(offset);
        if (Math.abs(offset) < width * TIMELINE_INTERACTION.bufferScreens) {
          clearTimeout(settle);
          settle = setTimeout(() => relayout(true), TIMELINE_INTERACTION.settleMs);
          return;
        }
        // Panned past the laid-out buffer: refill via an instant relayout below.
        // The transform above already re-anchored, so the refill is seamless.
      }
      pendingInstant = isPan; // pan past the buffer re-anchors instantly; zoom morphs
      if (raf === 0) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          relayout(pendingInstant);
        });
      }
    });
    return () => {
      unsubscribe();
      if (raf !== 0) cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [dir, applyTransform]);

  // After a relayout commits, re-anchor the transform to wherever "live" is now.
  // A pan relayout ran with item transitions suppressed (`.instant`); now that
  // the new left/top have painted at the anchored position, re-enable them one
  // frame later so the next zoom/filter relayout animates.
  useLayoutEffect(() => {
    applyTransform(panOffsetPx(layoutWindow, useViewportStore.getState().window, widthPx, dir));
    const layer = bandsLayerRef.current;
    if (layer === null || !layer.classList.contains(INSTANT_CLASS)) return undefined;
    const id = requestAnimationFrame(() => layer.classList.remove(INSTANT_CLASS));
    return () => cancelAnimationFrame(id);
  }, [layoutWindow, widthPx, dir, applyTransform]);

  // --- the pure pipeline (docs/spec/rendering.md), memoized on the settled window ---------
  const altitude = altitudeOf(spanYears(layoutWindow));
  const scale = useMemo<Scale>(() => ({ window: layoutWindow, widthPx, dir }), [layoutWindow, widthPx, dir]);

  const layout = useMemo(() => {
    const culled = cullToWindow(items, layoutWindow, TIMELINE_INTERACTION.bufferScreens, openEndYear);
    return layoutField(culled, scale, altitude, expandedChapters, openEndYear);
  }, [items, layoutWindow, scale, altitude, expandedChapters, openEndYear]);

  const ticks = useMemo(() => {
    const buffer = spanYears(layoutWindow) * TIMELINE_INTERACTION.bufferScreens;
    return generateTicks(layoutWindow, widthPx, {
      start: layoutWindow.start - buffer,
      end: layoutWindow.end + buffer,
    });
  }, [layoutWindow, widthPx]);

  const rowPx = ROW_PX[altitude];
  const dotSubRows = FIELD_CONFIGS[altitude].dotSubRows;
  // Reserve the altitude's full row budget so the field height depends only on
  // altitude, never on which items happen to be in view. Otherwise `rowsUsed`
  // fluctuates as content pans in/out, resizing the field and shoving the ruler
  // and the cast/works strips below it — a vertical jump on every pan.
  const rowsPx = FIELD_CONFIGS[altitude].maxRows * rowPx;
  const dotBandTop = FIELD_PAD_TOP_PX + rowsPx + DOT_BAND_PAD_PX;
  const fieldHeightPx = dotBandTop + dotSubRows * DOT_ROW_PX + DOT_BAND_PAD_PX;
  const isEmpty = layout.marks.length === 0 && layout.chapters.length === 0 && layout.dots.length === 0;

  const rowTop = (row: number): number => FIELD_PAD_TOP_PX + row * rowPx;

  const toggleChapter = (id: EntityId): void => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- altitude stepping (docs/spec/zoom.md) ----------------------------------------
  const liveWindow = (): TimeWindow => useViewportStore.getState().window;
  const surfaceX = (clientX: number): number =>
    clientX - (surfaceRef.current?.getBoundingClientRect().left ?? 0);

  /** One altitude step: +1 dives in, −1 climbs out, anchored at anchorPx. */
  const stepTo = useCallback(
    (direction: 1 | -1, anchorPx?: number) => {
      const live = liveWindow();
      const span = spanYears(live);
      const current = altitudeOf(span);
      const next = stepAltitude(current, direction);
      if (next === 'century') {
        resetView();
        return;
      }
      if (next === current && direction === 1) return; // already at year — nowhere deeper
      const defaultSpan = spanYears(useViewportStore.getState().defaultWindow);
      const factor = canonicalSpan(next, defaultSpan) / span;
      setWindow(zoomWindowAtPx(live, widthRef.current, dir, factor, anchorPx ?? widthRef.current / 2));
    },
    [dir, setWindow, resetView],
  );

  /** Jump straight to an altitude (segmented control), centered. */
  const goToAltitude = useCallback(
    (target: Altitude) => {
      if (target === 'century') {
        resetView();
        return;
      }
      const live = liveWindow();
      const defaultSpan = spanYears(useViewportStore.getState().defaultWindow);
      const factor = canonicalSpan(target, defaultSpan) / spanYears(live);
      setWindow(zoomWindowAtPx(live, widthRef.current, dir, factor, widthRef.current / 2));
    },
    [dir, setWindow, resetView],
  );

  // --- gestures ---------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ lastX: number; lastT: number; velocity: number } | null>(null);
  const movedPx = useRef(0);
  const suppressClick = useRef(false);
  const inertiaRaf = useRef(0);
  const pinchRatio = useRef(1);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current !== 0) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = 0;
    }
  }, []);
  useEffect(() => stopInertia, [stopInertia]);

  const startInertia = useCallback(
    (initialVelocity: number) => {
      if (prefersReducedMotion()) return;
      let velocity = initialVelocity;
      let last = performance.now();
      const step = (now: number): void => {
        const dt = Math.min(now - last, 64);
        last = now;
        const before = liveWindow();
        setWindow(panWindowByPx(before, widthRef.current, dir, velocity * dt));
        const after = liveWindow();
        velocity *= Math.pow(TIMELINE_INTERACTION.inertiaFriction, dt / 16);
        const blocked = after.start === before.start && after.end === before.end;
        if (Math.abs(velocity) < TIMELINE_INTERACTION.inertiaMinVelocityPxMs || blocked) {
          inertiaRaf.current = 0;
          return;
        }
        inertiaRaf.current = requestAnimationFrame(step);
      };
      inertiaRaf.current = requestAnimationFrame(step);
    },
    [dir, setWindow],
  );

  /**
   * Capture is deferred until a drag actually starts: capturing on
   * pointerdown would retarget pointerup to the surface, so the resulting
   * click lands on the surface instead of the pressed item button.
   */
  const capturePointers = (): void => {
    const surface = surfaceRef.current;
    if (surface?.setPointerCapture === undefined) return;
    for (const id of pointers.current.keys()) {
      try {
        surface.setPointerCapture(id);
      } catch {
        // pointer already gone — nothing to capture
      }
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopInertia();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
      movedPx.current = 0;
      // Fresh gesture: clear any suppress left set by a prior pan/pinch that
      // never emitted a trailing click, so this tap's click isn't swallowed.
      suppressClick.current = false;
    } else {
      drag.current = null; // two pointers → pinch, never a click
      pinchRatio.current = 1;
      suppressClick.current = true;
      capturePointers();
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const tracked = pointers.current.get(e.pointerId);
    if (tracked === undefined) return;

    if (pointers.current.size === 1 && drag.current !== null) {
      const dx = e.clientX - drag.current.lastX;
      if (dx !== 0) {
        setWindow(panWindowByPx(liveWindow(), widthRef.current, dir, dx));
        movedPx.current += Math.abs(dx);
        if (movedPx.current > TIMELINE_INTERACTION.clickDragThresholdPx && !suppressClick.current) {
          suppressClick.current = true;
          capturePointers();
        }
        const dt = e.timeStamp - drag.current.lastT;
        if (dt > 0) drag.current.velocity = 0.8 * (dx / dt) + 0.2 * drag.current.velocity;
        drag.current.lastX = e.clientX;
        drag.current.lastT = e.timeStamp;
      }
      tracked.x = e.clientX;
      tracked.y = e.clientY;
      return;
    }

    if (pointers.current.size === 2) {
      const entries = [...pointers.current.entries()];
      const other = entries.find(([id]) => id !== e.pointerId)?.[1];
      if (other === undefined) return;
      const prevMidX = (tracked.x + other.x) / 2;
      const prevDist = Math.max(1, Math.hypot(tracked.x - other.x, tracked.y - other.y));
      tracked.x = e.clientX;
      tracked.y = e.clientY;
      const newMidX = (tracked.x + other.x) / 2;
      const newDist = Math.max(1, Math.hypot(tracked.x - other.x, tracked.y - other.y));

      // Pan follows the midpoint continuously; the zoom component accumulates
      // into an altitude step (docs/spec/zoom.md) instead of scaling freely.
      setWindow(panWindowByPx(liveWindow(), widthRef.current, dir, newMidX - prevMidX));
      pinchRatio.current *= prevDist / newDist;
      const anchor = surfaceX(newMidX);
      if (pinchRatio.current >= TIMELINE_INTERACTION.pinchStepRatio) {
        stepTo(-1, anchor);
        pinchRatio.current = 1;
      } else if (pinchRatio.current <= 1 / TIMELINE_INTERACTION.pinchStepRatio) {
        stepTo(1, anchor);
        pinchRatio.current = 1;
      }
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (surfaceRef.current?.hasPointerCapture?.(e.pointerId)) {
      surfaceRef.current.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size === 1) {
      // pinch → drag handoff with the remaining pointer
      const remaining = [...pointers.current.values()][0]!;
      drag.current = { lastX: remaining.x, lastT: e.timeStamp, velocity: 0 };
      return;
    }
    if (pointers.current.size === 0 && drag.current !== null) {
      const { velocity } = drag.current;
      drag.current = null;
      if (e.type !== 'pointercancel' && Math.abs(velocity) > TIMELINE_INTERACTION.inertiaMinVelocityPxMs) {
        startInertia(velocity);
      }
    }
  };

  // Wheel must preventDefault (page scroll/zoom), so it needs a non-passive
  // native listener — React's synthetic wheel handlers can't guarantee that.
  // Vertical wheel accumulates into altitude steps; horizontal wheel pans.
  useEffect(() => {
    const el = surfaceRef.current;
    if (el === null) return;
    let accum = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      stopInertia();
      const unit = e.deltaMode === 1 ? 16 : 1; // line-mode deltas (Firefox)
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (Math.abs(dx) > Math.abs(dy)) {
        setWindow(panWindowByPx(liveWindow(), widthRef.current, dir, -dx));
        return;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        accum = 0;
      }, WHEEL_IDLE_MS);
      const threshold =
        e.ctrlKey || e.metaKey ? TIMELINE_INTERACTION.ctrlWheelStepPx : TIMELINE_INTERACTION.wheelStepPx;
      accum += dy;
      const anchor = surfaceX(e.clientX);
      if (accum <= -threshold) {
        stepTo(1, anchor); // wheel up / pinch-out → dive
        accum = 0;
      } else if (accum >= threshold) {
        stepTo(-1, anchor); // wheel down / pinch-in → climb
        accum = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(idleTimer);
    };
  }, [dir, setWindow, stopInertia, stepTo]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const width = widthRef.current;
    const panStep = width * TIMELINE_INTERACTION.keyPanFraction;
    switch (e.key) {
      case 'ArrowLeft': // reveal what lies to the left, whatever the direction
        stopInertia();
        setWindow(panWindowByPx(liveWindow(), width, dir, panStep));
        break;
      case 'ArrowRight':
        stopInertia();
        setWindow(panWindowByPx(liveWindow(), width, dir, -panStep));
        break;
      case '+':
      case '=':
        stopInertia();
        stepTo(1);
        break;
      case '-':
      case '_':
        stopInertia();
        stepTo(-1);
        break;
      case 'Home':
        stopInertia();
        resetView();
        break;
      case 'Escape':
        clearSelection();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onSurfaceClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.target === e.currentTarget || e.target === bandsLayerRef.current) clearSelection();
  };

  const onSelectItem = (e: MouseEvent, id: string): void => {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    select(id);
  };

  /**
   * Focusing/clicking a partially-clipped item makes browsers auto-scroll an
   * overflow:hidden container to reveal it, silently displacing every layer
   * off the ruler. Position is owned by the transform pipeline — pin the
   * scroll origin.
   */
  const pinScroll = (e: UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  };

  // --- render -----------------------------------------------------------------
  const foldButtonStyle = (chapter: FieldChapter): CSSProperties =>
    dir === 'rtl'
      ? { left: chapter.x + 4, top: rowTop(chapter.row) + 4 }
      : { left: chapter.x + chapter.width - 4, top: rowTop(chapter.row) + 4, transform: 'translateX(-100%)' };

  return (
    <section className={styles.timeline} aria-label={STRINGS.timelineRegionLabel}>
      <div
        ref={surfaceRef}
        role="application"
        aria-label={STRINGS.timelineRegionLabel}
        aria-describedby="timeline-instructions"
        tabIndex={0}
        className={styles.surface}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onClick={onSurfaceClick}
        onDoubleClick={(e) => {
          // Double-click on empty canvas dives one altitude; item clicks don't.
          if (!(e.target instanceof Element && e.target.closest('button'))) {
            stepTo(1, surfaceX(e.clientX));
          }
        }}
      >
        <p id="timeline-instructions" className="visually-hidden">
          {STRINGS.timelineInstructions}
        </p>

        <div className={styles.bandsViewport} style={{ height: fieldHeightPx }} onScroll={pinScroll}>
          <div ref={bandsLayerRef} className={styles.bandsLayer}>
            {ticks.map((tick) => (
              <span
                key={`grid-${tick.t}`}
                className={tick.major ? styles.gridlineMajor : styles.gridline}
                style={{ left: xOf(scale, tick.t), height: fieldHeightPx }}
                aria-hidden="true"
              />
            ))}

            {layout.chapters.map((chapter) => (
              <Fragment key={chapter.item.id}>
                <span
                  className={styles.chapterTint}
                  style={
                    {
                      left: chapter.x - 6,
                      top: rowTop(chapter.row),
                      width: chapter.width + 12,
                      height: chapter.rows * rowPx - 4,
                      '--item-color': `var(--cat-${chapter.item.styleToken})`,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={
                    chapter.item.id === selectedId
                      ? `${styles.chapterHeader} ${styles.selected}`
                      : styles.chapterHeader
                  }
                  style={
                    {
                      left: chapter.x,
                      top: rowTop(chapter.row),
                      width: chapter.width,
                      height: rowPx - 6,
                      '--item-color': `var(--cat-${chapter.item.styleToken})`,
                    } as CSSProperties
                  }
                  data-item-id={chapter.item.id}
                  aria-label={STRINGS.itemAriaLabel(
                    typeLabels.get(chapter.item.contentType) ?? chapter.item.contentType,
                    chapter.item.title,
                    chapter.item.detail.displayDate,
                  )}
                  aria-current={chapter.item.id === selectedId ? 'true' : undefined}
                  onClick={(e) => onSelectItem(e, chapter.item.id)}
                >
                  <span className={styles.labelAnchor} style={{ left: chapter.labelX - chapter.x, width: chapter.labelWidth }}>
                    <span className={styles.markLabel}>{chapter.item.title}</span>
                    <span className={styles.chapterBadge}>
                      {STRINGS.chapterBadge(chapter.children.length + chapter.hiddenCount)}
                    </span>
                  </span>
                </button>
                {chapter.children.map((child) => (
                  <EventMark
                    key={child.item.id}
                    mark={child}
                    topPx={rowTop(child.row)}
                    rowPx={rowPx}
                    typeLabel={typeLabels.get(child.item.contentType) ?? child.item.contentType}
                    selected={child.item.id === selectedId}
                    onSelect={onSelectItem}
                  />
                ))}
                {(chapter.hiddenCount > 0 || chapter.expanded) && (
                  <button
                    type="button"
                    className={styles.chapterFold}
                    style={foldButtonStyle(chapter)}
                    aria-label={
                      chapter.expanded
                        ? STRINGS.chapterCollapseAria(chapter.item.title)
                        : STRINGS.chapterMoreAria(chapter.hiddenCount, chapter.item.title)
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChapter(chapter.item.id);
                    }}
                  >
                    {chapter.expanded ? STRINGS.chapterCollapse : STRINGS.chapterMore(chapter.hiddenCount)}
                  </button>
                )}
              </Fragment>
            ))}

            {layout.marks.map((mark) => (
              <EventMark
                key={mark.item.id}
                mark={mark}
                topPx={rowTop(mark.row)}
                rowPx={rowPx}
                typeLabel={typeLabels.get(mark.item.contentType) ?? mark.item.contentType}
                selected={mark.item.id === selectedId}
                onSelect={onSelectItem}
              />
            ))}

            {layout.dots.map((dot) => {
              const baseLabel = STRINGS.itemAriaLabel(
                typeLabels.get(dot.item.contentType) ?? dot.item.contentType,
                dot.item.title,
                dot.item.detail.displayDate,
              );
              const label =
                dot.count > 1 ? baseLabel + STRINGS.dotAggregateSuffix(dot.count - 1) : baseLabel;
              return (
                <button
                  key={dot.item.id}
                  type="button"
                  className={dot.item.id === selectedId ? `${styles.dot} ${styles.selected}` : styles.dot}
                  style={
                    {
                      left: dot.x - 8,
                      top: dotBandTop + dot.subRow * DOT_ROW_PX,
                      '--item-color': `var(--cat-${dot.item.styleToken})`,
                    } as CSSProperties
                  }
                  data-item-id={dot.item.id}
                  data-dot-count={dot.count}
                  title={label}
                  aria-label={label}
                  aria-current={dot.item.id === selectedId ? 'true' : undefined}
                  onClick={(e) => onSelectItem(e, dot.item.id)}
                />
              );
            })}
          </div>
          {isEmpty && (
            <p className={styles.emptyNotice} role="status">
              {STRINGS.emptyViewNotice}
            </p>
          )}
        </div>

        <div className={styles.ruler} onScroll={pinScroll}>
          <div ref={rulerLayerRef} className={styles.rulerLayer}>
            {ticks.map((tick) => (
              <span
                key={tick.t}
                className={tick.major ? styles.tickMajor : styles.tick}
                style={{ left: xOf(scale, tick.t) }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlCluster}>
          <div className={styles.altitudeSeg} role="group" aria-label={STRINGS.altitudeControlLabel}>
            {(['century', 'decade', 'year'] as const).map((alt) => (
              <button
                key={alt}
                type="button"
                className={alt === altitude ? `${styles.segButton} ${styles.segActive}` : styles.segButton}
                aria-pressed={alt === altitude ? 'true' : 'false'}
                onClick={() => goToAltitude(alt)}
              >
                {STRINGS.altitudeNames[alt]}
              </button>
            ))}
          </div>
          <Button aria-label={STRINGS.zoomIn} onClick={() => stepTo(1)}>
            <span aria-hidden="true">+</span>
          </Button>
          <Button aria-label={STRINGS.zoomOut} onClick={() => stepTo(-1)}>
            <span aria-hidden="true">−</span>
          </Button>
        </div>
        <RangeReadout />
      </div>
    </section>
  );
}
