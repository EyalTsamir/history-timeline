import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTER_STATE } from '../domain/filters';
import type { FilterState } from '../domain/filters';
import { normalizeDataset } from '../domain/normalize';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { makeFixtureDataset } from '../test/fixtures';
import {
  decodeTimelineHash,
  encodeTimelineHash,
  initTimelineStateFromUrl,
  startTimelineUrlSync,
  vocabularyOf,
} from './urlState';

const dataset = makeFixtureDataset();
const items = normalizeDataset(dataset);
const vocabulary = vocabularyOf(items, dataset);

const filters = (over: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER_STATE, ...over });

function resetStores(): void {
  useFilterStore.getState().clearAll();
  useSelectionStore.getState().clear();
  history.replaceState(null, '', window.location.pathname);
}

describe('encodeTimelineHash', () => {
  it('always encodes the window; filter/selection params only when active', () => {
    expect(encodeTimelineHash({ start: 1940, end: 1960 }, EMPTY_FILTER_STATE, null)).toBe('t=1950&s=20');
    expect(
      encodeTimelineHash(
        { start: 1940, end: 1960 },
        filters({
          regionIds: new Set(['jerusalem', 'israel']),
          contentTypes: new Set(['event']),
          minImportance: 40,
        }),
        'fx-war',
      ),
    ).toBe('t=1950&s=20&r=israel,jerusalem&ct=event&imp=40&sel=fx-war');
  });
});

describe('decodeTimelineHash', () => {
  it('round-trips what encode produced', () => {
    const f = filters({
      regionIds: new Set(['israel']),
      personCategoryIds: new Set(['leaders']),
      contentTypes: new Set(['person', 'biography']),
      minImportance: 35,
    });
    const hash = encodeTimelineHash({ start: 1945.25, end: 1953.75 }, f, 'fx-leader');
    const decoded = decodeTimelineHash(`#${hash}`, vocabulary);
    expect(decoded.window?.start).toBeCloseTo(1945.25, 3);
    expect(decoded.window?.end).toBeCloseTo(1953.75, 3);
    expect(decoded.filters).toEqual(f);
    expect(decoded.selectedId).toBe('fx-leader');
  });

  it('drops unknown ids, bad numbers and malformed pairs', () => {
    const decoded = decodeTimelineHash(
      '#t=abc&s=-5&r=israel,atlantis&pc=nope&ct=event,podcast&imp=999&sel=missing-item',
      vocabulary,
    );
    expect(decoded.window).toBeUndefined();
    expect(decoded.selectedId).toBeUndefined();
    expect(decoded.filters).toEqual(
      filters({ regionIds: new Set(['israel']), contentTypes: new Set(['event']), minImportance: 100 }),
    );
  });

  it('returns an empty state for garbage or empty hashes', () => {
    expect(decodeTimelineHash('', vocabulary)).toEqual({});
    expect(decodeTimelineHash('#not-a-param', vocabulary)).toEqual({});
    expect(decodeTimelineHash('#%E0%A4%A', vocabulary)).toEqual({});
  });
});

describe('initTimelineStateFromUrl', () => {
  beforeEach(resetStores);

  it('seeds viewport limits from data and applies a valid hash', () => {
    history.replaceState(null, '', '#t=1948.5&s=3&r=jerusalem&sel=fx-battle');
    initTimelineStateFromUrl(items, dataset);

    const vp = useViewportStore.getState();
    expect(vp.initialized).toBe(true);
    expect(vp.window.start).toBeCloseTo(1947, 2);
    expect(vp.window.end).toBeCloseTo(1950, 2);
    // limits derived from the data: the fixture leader is born 1886
    expect(vp.limits.minTime).toBeLessThan(1886.8);
    expect(useFilterStore.getState().regionIds).toEqual(new Set(['jerusalem']));
    expect(useSelectionStore.getState().selectedId).toBe('fx-battle');
  });

  it('falls back to the default window without a hash and clears stale state', () => {
    useSelectionStore.getState().select('fx-war');
    useFilterStore.getState().setMinImportance(80);
    initTimelineStateFromUrl(items, dataset);

    const vp = useViewportStore.getState();
    expect(vp.window).toEqual(vp.defaultWindow);
    expect(useSelectionStore.getState().selectedId).toBeNull();
    expect(useFilterStore.getState().minImportance).toBe(0);
  });
});

describe('startTimelineUrlSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    initTimelineStateFromUrl(items, dataset);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes store changes to the hash, debounced', () => {
    const stop = startTimelineUrlSync(items, dataset);
    useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    useFilterStore.getState().toggleContentType('event');
    expect(window.location.hash).toBe('');
    vi.advanceTimersByTime(400);
    expect(window.location.hash).toBe('#t=1948.5&s=3&ct=event');
    stop();
  });

  it('applies an externally-changed hash back into the stores', () => {
    const stop = startTimelineUrlSync(items, dataset);
    history.replaceState(null, '', '#t=1948.5&s=3&sel=fx-war');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(useSelectionStore.getState().selectedId).toBe('fx-war');
    expect(useViewportStore.getState().window.start).toBeCloseTo(1947, 2);
    stop();
  });

  it('stops syncing after cleanup', () => {
    const stop = startTimelineUrlSync(items, dataset);
    stop();
    useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    vi.advanceTimersByTime(400);
    expect(window.location.hash).toBe('');
  });
});
