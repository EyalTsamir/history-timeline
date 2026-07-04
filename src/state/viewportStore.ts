/**
 * The timeline viewport: the visible date range in decimal years plus its
 * pan/zoom limits (docs/06 pipeline, docs/08 zoom bounds). Window math lives
 * in timeline/scale.ts — components compute a candidate window with those
 * pure functions and hand it here; setWindow clamps, so no gesture can
 * escape the bounds. No React imports (docs/02 layering).
 */
import { create } from 'zustand';
import type { TimeWindow, ViewportDefaults, WindowLimits } from '../timeline/scale';
import { clampWindow } from '../timeline/scale';

export interface ViewportStore {
  window: TimeWindow;
  defaultWindow: TimeWindow;
  limits: WindowLimits;
  /** True once init() ran with real data — guards rendering before bounds exist. */
  initialized: boolean;
  init(defaults: ViewportDefaults): void;
  /** Clamped write — the single mutation path for pan/zoom/restore. */
  setWindow(next: TimeWindow): void;
  /** Back to the full configured range ("טווח מלא"). */
  reset(): void;
}

/** Pre-init placeholder; init() replaces it before the timeline renders. */
const PLACEHOLDER: ViewportDefaults = {
  window: { start: 1900, end: 2000 },
  defaultWindow: { start: 1900, end: 2000 },
  limits: { minTime: 1800, maxTime: 2100, minSpan: 1 / 12, maxSpan: 300 },
};

export const useViewportStore = create<ViewportStore>()((set, get) => ({
  window: PLACEHOLDER.window,
  defaultWindow: PLACEHOLDER.defaultWindow,
  limits: PLACEHOLDER.limits,
  initialized: false,
  init: (defaults) =>
    set({
      window: clampWindow(defaults.window, defaults.limits),
      defaultWindow: defaults.defaultWindow,
      limits: defaults.limits,
      initialized: true,
    }),
  setWindow: (next) => {
    const clamped = clampWindow(next, get().limits);
    const current = get().window;
    if (clamped.start !== current.start || clamped.end !== current.end) set({ window: clamped });
  },
  reset: () => set((s) => ({ window: clampWindow(s.defaultWindow, s.limits) })),
}));
