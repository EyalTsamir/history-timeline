import { beforeEach, describe, expect, it } from 'vitest';
import { useViewportStore } from './viewportStore';
import type { ViewportDefaults } from '../timeline/scale';

const DEFAULTS: ViewportDefaults = {
  window: { start: 1926.5, end: 2003.5 },
  defaultWindow: { start: 1926.5, end: 2003.5 },
  limits: { minTime: 1880, maxTime: 2030, minSpan: 1 / 12, maxSpan: 150 },
};

describe('viewportStore', () => {
  beforeEach(() => {
    useViewportStore.getState().init(DEFAULTS);
  });

  it('init applies window, default and limits', () => {
    const s = useViewportStore.getState();
    expect(s.window).toEqual(DEFAULTS.window);
    expect(s.initialized).toBe(true);
  });

  it('setWindow clamps to the limits', () => {
    useViewportStore.getState().setWindow({ start: 1700, end: 1701 });
    const w = useViewportStore.getState().window;
    expect(w.start).toBeGreaterThanOrEqual(DEFAULTS.limits.minTime);
    useViewportStore.getState().setWindow({ start: 1950, end: 1950.001 });
    expect(useViewportStore.getState().window.end - useViewportStore.getState().window.start).toBeCloseTo(1 / 12);
  });

  it('setWindow with an equivalent window keeps the same reference (no re-render churn)', () => {
    useViewportStore.getState().setWindow({ start: 1940, end: 1960 });
    const before = useViewportStore.getState().window;
    useViewportStore.getState().setWindow({ start: 1940, end: 1960 });
    expect(useViewportStore.getState().window).toBe(before);
  });

  it('reset returns to the default window', () => {
    useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    useViewportStore.getState().reset();
    expect(useViewportStore.getState().window).toEqual(DEFAULTS.defaultWindow);
  });
});
