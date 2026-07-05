/**
 * The interactive timeline surface (docs/06 pipeline, docs/08 interaction).
 *
 * Rendering: pure pipeline output only — filters (upstream) → semantic zoom →
 * cull → lane layout, memoized on the SETTLED window. During a pan gesture
 * the item/ruler layers move by CSS transform alone; layout recomputes when
 * the gesture settles, crosses the cull buffer, or the zoom changes
 * (rAF-throttled) — docs/10's transform-only rule.
 *
 * Input: pointer drag (+ inertia), two-pointer pinch, wheel/trackpad,
 * keyboard (arrows/±/Home), and explicit buttons — every gesture has a
 * non-gesture equivalent. touch-action: pan-y leaves vertical scrolling to
 * the browser so the page never fights the timeline (docs/08).
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { APP_CONFIG } from '../app/config';
import { STRINGS } from '../app/strings.he';
import { currentDecimalYear } from '../domain/dates';
import type { TimelineItem, TimelineKind } from '../domain/timelineItem';
import { TIMELINE_INTERACTION } from '../timeline/config';
import { layoutTimeline } from '../timeline/laneLayout';
import type { PositionedCluster } from '../timeline/laneLayout';
import {
  panOffsetPx,
  panWindowByPx,
  spanYears,
  xOf,
  yearsPer1000px,
  zoomWindowAtPx,
} from '../timeline/scale';
import type { Scale, TimeWindow } from '../timeline/scale';
import { effectiveMinImportance, zoomThreshold } from '../timeline/semanticZoom';
import { SEMANTIC_ZOOM } from '../timeline/semanticZoom.config';
import { formatWindowRange, generateTicks } from '../timeline/ticks';
import { applySemanticVisibility, cullToWindow } from '../timeline/visibility';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { Button } from './Button';
import { TimelineItemMark } from './TimelineItemMark';
import styles from './Timeline.module.css';

/** Row/band metrics (px) — mirrored by the CSS module's fixed sizes. */
const ROW_PX = 32;
const BAND_HEADER_PX = 26;
const BAND_PAD_PX = 10;
/** jsdom / first-paint fallback before ResizeObserver reports. */
const FALLBACK_WIDTH_PX = 960;

const BAND_LABELS: Record<TimelineKind, string> = {
  event: STRINGS.bandEvents,
  person: STRINGS.bandPeople,
  work: STRINGS.bandWorks,
};

interface TimelineProps {
  /** Already user-filtered, time-sorted items (docs/07 flows in above us). */
  items: readonly TimelineItem[];
  /** contentType → Hebrew label, for accessible item names. */
  typeLabels: ReadonlyMap<string, string>;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Live visible-range readout — isolated so per-frame pans re-render only this.
 * aria-live announces the range to screen-reader users; for the primary SR
 * interaction (keyboard arrows/±) each keypress is one discrete change, and
 * `polite` coalesces the rapid updates of a mouse/touch drag.
 */
function RangeReadout() {
  const window = useViewportStore((s) => s.window);
  return (
    <span className={styles.readout} aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{STRINGS.visibleRangeLabel}: </span>
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
  const minImportance = useFilterStore((s) => s.minImportance);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const select = useSelectionStore((s) => s.select);
  const clearSelection = useSelectionStore((s) => s.clear);

  /** The window the current layout was computed for (≠ live window mid-gesture). */
  const [layoutWindow, setLayoutWindow] = useState<TimeWindow>(() => useViewportStore.getState().window);
  const layoutWindowRef = useRef(layoutWindow);
  layoutWindowRef.current = layoutWindow;

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
    const relayout = (): void => setLayoutWindow(useViewportStore.getState().window);
    const unsubscribe = useViewportStore.subscribe((s) => {
      const live = s.window;
      const layout = layoutWindowRef.current;
      const width = widthRef.current;
      const isPan = Math.abs(spanYears(live) - spanYears(layout)) < 1e-9;
      if (isPan) {
        const offset = panOffsetPx(layout, live, width, dir);
        if (Math.abs(offset) < width * TIMELINE_INTERACTION.bufferScreens) {
          applyTransform(offset);
          clearTimeout(settle);
          settle = setTimeout(relayout, TIMELINE_INTERACTION.settleMs);
          return;
        }
      }
      if (raf === 0) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          relayout();
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
  useLayoutEffect(() => {
    applyTransform(panOffsetPx(layoutWindow, useViewportStore.getState().window, widthPx, dir));
  }, [layoutWindow, widthPx, dir, applyTransform]);

  // --- the pure pipeline (docs/06), memoized on the settled window ------------
  const scale = useMemo<Scale>(() => ({ window: layoutWindow, widthPx, dir }), [layoutWindow, widthPx, dir]);

  const layout = useMemo(() => {
    const floor = effectiveMinImportance(
      zoomThreshold(yearsPer1000px(layoutWindow, widthPx), SEMANTIC_ZOOM),
      minImportance,
    );
    const visible = applySemanticVisibility(items, floor, SEMANTIC_ZOOM.fadeBand);
    const culled = cullToWindow(visible, layoutWindow, TIMELINE_INTERACTION.bufferScreens, openEndYear);
    return layoutTimeline(culled, scale, openEndYear);
  }, [items, minImportance, layoutWindow, widthPx, scale, openEndYear]);

  const ticks = useMemo(() => {
    const buffer = spanYears(layoutWindow) * TIMELINE_INTERACTION.bufferScreens;
    return generateTicks(layoutWindow, widthPx, {
      start: layoutWindow.start - buffer,
      end: layoutWindow.end + buffer,
    });
  }, [layoutWindow, widthPx]);

  const bandGeometry = useMemo(() => {
    let top = 0;
    return layout.bands.map((band) => {
      const geometry = { band, top, rowsTop: top + BAND_HEADER_PX };
      top += BAND_HEADER_PX + band.rows * ROW_PX + BAND_PAD_PX;
      return geometry;
    });
  }, [layout]);
  const bandsHeightPx = bandGeometry.reduce((h, g) => h + BAND_HEADER_PX + g.band.rows * ROW_PX + BAND_PAD_PX, 0);
  const isEmpty = layout.bands.every((b) => b.items.length === 0 && b.clusters.length === 0);

  // --- gestures ---------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ lastX: number; lastT: number; velocity: number } | null>(null);
  const movedPx = useRef(0);
  const suppressClick = useRef(false);
  const inertiaRaf = useRef(0);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current !== 0) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = 0;
    }
  }, []);
  useEffect(() => stopInertia, [stopInertia]);

  const liveWindow = (): TimeWindow => useViewportStore.getState().window;
  const surfaceX = (clientX: number): number =>
    clientX - (surfaceRef.current?.getBoundingClientRect().left ?? 0);

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

      let next = panWindowByPx(liveWindow(), widthRef.current, dir, newMidX - prevMidX);
      next = zoomWindowAtPx(next, widthRef.current, dir, prevDist / newDist, surfaceX(newMidX));
      setWindow(next);
      suppressClick.current = true;
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
  useEffect(() => {
    const el = surfaceRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      stopInertia();
      const unit = e.deltaMode === 1 ? 16 : 1; // line-mode deltas (Firefox)
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const anchor = surfaceX(e.clientX);
      if (e.ctrlKey || e.metaKey) {
        // trackpad pinch arrives as ctrl+wheel
        const factor = Math.exp(dy * TIMELINE_INTERACTION.pinchWheelZoomSensitivity);
        setWindow(zoomWindowAtPx(liveWindow(), widthRef.current, dir, factor, anchor));
      } else if (Math.abs(dx) > Math.abs(dy)) {
        setWindow(panWindowByPx(liveWindow(), widthRef.current, dir, -dx));
      } else {
        const factor = Math.exp(dy * TIMELINE_INTERACTION.wheelZoomSensitivity);
        setWindow(zoomWindowAtPx(liveWindow(), widthRef.current, dir, factor, anchor));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dir, setWindow, stopInertia]);

  const zoomStep = useCallback(
    (factor: number, anchorPx?: number) => {
      stopInertia();
      setWindow(
        zoomWindowAtPx(liveWindow(), widthRef.current, dir, factor, anchorPx ?? widthRef.current / 2),
      );
    },
    [dir, setWindow, stopInertia],
  );

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
        zoomStep(TIMELINE_INTERACTION.stepZoomFactor);
        break;
      case '-':
      case '_':
        zoomStep(1 / TIMELINE_INTERACTION.stepZoomFactor);
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

  const onClusterClick = (e: MouseEvent, cluster: PositionedCluster): void => {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // The chip disappears once its contents unfold — park focus on the surface.
    surfaceRef.current?.focus();
    const pad = Math.max(cluster.end - cluster.start, 1e-6) * TIMELINE_INTERACTION.clusterZoomPaddingFraction;
    setWindow({ start: cluster.start - pad, end: cluster.end + pad });
  };

  // --- render -----------------------------------------------------------------
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
          // Double-click on empty canvas zooms in; rapid item clicks don't.
          if (!(e.target instanceof Element && e.target.closest('button'))) {
            zoomStep(0.5, surfaceX(e.clientX));
          }
        }}
      >
        <p id="timeline-instructions" className="visually-hidden">
          {STRINGS.timelineInstructions}
        </p>

        <div className={styles.bandsViewport} style={{ height: bandsHeightPx }}>
          <div ref={bandsLayerRef} className={styles.bandsLayer}>
            {ticks.map((tick) => (
              <span
                key={`grid-${tick.t}`}
                className={tick.major ? styles.gridlineMajor : styles.gridline}
                style={{ left: xOf(scale, tick.t), height: bandsHeightPx }}
                aria-hidden="true"
              />
            ))}
            {bandGeometry.map(({ band, rowsTop }) => (
              <Fragment key={band.kind}>
                {band.items.map((p) => (
                  <Fragment key={p.item.id}>
                    {p.isContainer && (
                      <span
                        className={styles.containerTint}
                        style={
                          {
                            left: p.x,
                            top: rowsTop + p.row * ROW_PX,
                            width: p.width,
                            height: p.heightRows * ROW_PX - 4,
                            '--item-color': `var(--cat-${p.item.styleToken})`,
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      />
                    )}
                    <TimelineItemMark
                      p={p}
                      topPx={rowsTop + p.row * ROW_PX}
                      rowPx={ROW_PX}
                      dir={dir}
                      typeLabel={typeLabels.get(p.item.contentType) ?? p.item.contentType}
                      selected={p.item.id === selectedId}
                      onSelect={onSelectItem}
                    />
                  </Fragment>
                ))}
                {band.clusters.map((cluster) => (
                  <button
                    key={`cluster-${cluster.ids[0]}`}
                    type="button"
                    className={styles.clusterChip}
                    style={{ left: cluster.x, top: rowsTop + cluster.row * ROW_PX, width: cluster.width }}
                    aria-label={STRINGS.clusterAriaLabel(cluster.ids.length)}
                    onClick={(e) => onClusterClick(e, cluster)}
                  >
                    {STRINGS.clusterChip(cluster.ids.length)}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
          <div className={styles.bandTitles}>
            {bandGeometry.map(({ band, top }) => (
              <span key={band.kind} className={styles.bandTitle} style={{ top }}>
                {BAND_LABELS[band.kind]}
              </span>
            ))}
          </div>
          {isEmpty && (
            <p className={styles.emptyNotice} role="status">
              {STRINGS.emptyViewNotice}
            </p>
          )}
        </div>

        <div className={styles.ruler}>
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
        <div className={styles.zoomButtons}>
          <Button aria-label={STRINGS.zoomIn} onClick={() => zoomStep(TIMELINE_INTERACTION.stepZoomFactor)}>
            <span aria-hidden="true">+</span>
          </Button>
          <Button aria-label={STRINGS.zoomOut} onClick={() => zoomStep(1 / TIMELINE_INTERACTION.stepZoomFactor)}>
            <span aria-hidden="true">−</span>
          </Button>
          <Button onClick={() => resetView()}>{STRINGS.resetView}</Button>
        </div>
        <RangeReadout />
      </div>
    </section>
  );
}
