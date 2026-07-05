import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STRINGS } from '../app/strings.he';
import { normalizeDataset } from '../domain/normalize';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { makeFixtureDataset, makeTimelineItem } from '../test/fixtures';
import { ALTITUDE_CONFIG } from '../timeline/altitude';
import { spanYears } from '../timeline/scale';
import type { TimeWindow } from '../timeline/scale';
import { Timeline } from './Timeline';

const dataset = makeFixtureDataset();
const items = normalizeDataset(dataset);
const typeLabels = new Map<string, string>([
  ['event', STRINGS.kindEvent],
  ['person', STRINGS.kindPerson],
  ...dataset.workTypes.map((wt) => [wt.id, wt.name.he] as const),
]);

const FULL: TimeWindow = { start: 1926.5, end: 2003.5 }; // span 77 → century altitude

function initViewport(window: TimeWindow = FULL): void {
  useViewportStore.getState().init({
    window,
    defaultWindow: FULL,
    limits: { minTime: 1880, maxTime: 2030, minSpan: 1 / 12, maxSpan: 200 },
  });
}

const getWindow = (): TimeWindow => useViewportStore.getState().window;

describe('Timeline', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
    useSelectionStore.getState().clear();
    initViewport();
  });

  afterEach(cleanup);

  it('renders the application region, instructions, altitude control and ruler', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const region = screen.getByRole('application', { name: STRINGS.timelineRegionLabel });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(STRINGS.timelineInstructions)).toBeInTheDocument();
    // Altitude segmented control, current altitude pressed.
    const centuryButton = screen.getByRole('button', { name: STRINGS.altitudeNames.century });
    expect(centuryButton).toHaveAttribute('aria-pressed', 'true');
    // Decade ruler labels at this zoom, and the live era-aware readout.
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText(/1926–2003/)).toBeInTheDocument();
  });

  it('presence guarantee: every event renders at every altitude (mark or dot)', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    // Anchors (importance ≥ 80) are labeled marks at century altitude…
    expect(screen.getByRole('button', { name: /מלחמה לדוגמה/ })).toBeInTheDocument();
    // …and the importance-40 sub-event is STILL on screen, as a dot.
    expect(screen.getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
  });

  it('diving to a year window folds sub-events into their parent chapter', async () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    act(() => {
      useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    });
    await waitFor(() => {
      expect(screen.getByText(STRINGS.chapterBadge(1))).toBeInTheDocument();
    });
    // Parent header and its bead both present and selectable.
    expect(screen.getByRole('button', { name: /מלחמה לדוגמה/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
    expect(screen.getByText(/1947–1950/)).toBeInTheDocument();
  });

  it('keyboard: + dives to the decade span, − climbs back to the full range', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');
    surface.focus();

    const before = getWindow();
    fireEvent.keyDown(surface, { key: '+' });
    const dived = getWindow();
    expect(spanYears(dived)).toBeCloseTo(ALTITUDE_CONFIG.decadeSpan, 6);
    expect((dived.start + dived.end) / 2).toBeCloseTo((before.start + before.end) / 2, 6);

    fireEvent.keyDown(surface, { key: '-' });
    expect(getWindow()).toEqual(FULL); // climbing to century = the full default view

    const beforePan = getWindow();
    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    const forward = getWindow();
    expect(forward.start).toBeGreaterThan(beforePan.start); // RTL: future is leftward
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(getWindow().start).toBeCloseTo(beforePan.start, 6);

    fireEvent.keyDown(surface, { key: '+' });
    fireEvent.keyDown(surface, { key: 'Home' });
    expect(getWindow()).toEqual(FULL);
  });

  it('the altitude segmented control jumps straight to a canonical span', async () => {
    const user = userEvent.setup();
    render(<Timeline items={items} typeLabels={typeLabels} />);
    await user.click(screen.getByRole('button', { name: STRINGS.altitudeNames.year }));
    expect(spanYears(getWindow())).toBeCloseTo(ALTITUDE_CONFIG.yearSpan, 6);
    await user.click(screen.getByRole('button', { name: STRINGS.altitudeNames.century }));
    expect(getWindow()).toEqual(FULL);
  });

  it('wheel accumulates to one altitude step; horizontal wheel pans continuously', () => {
    initViewport({ start: 1944, end: 1956 }); // decade altitude
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');

    // One strong vertical tick (≥ threshold) → exactly one climb: decade → century.
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
    });
    expect(getWindow()).toEqual(FULL);

    // Small deltas accumulate without stepping until the threshold is crossed.
    act(() => {
      initViewport({ start: 1944, end: 1956 });
    });
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
    });
    expect(spanYears(getWindow())).toBeCloseTo(12, 6);
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
    });
    expect(spanYears(getWindow())).toBeCloseTo(ALTITUDE_CONFIG.yearSpan, 6); // dive fired once

    const beforePan = getWindow();
    act(() => {
      surface.dispatchEvent(
        new WheelEvent('wheel', { deltaX: 120, deltaY: 4, bubbles: true, cancelable: true }),
      );
    });
    const panned = getWindow();
    expect(spanYears(panned)).toBeCloseTo(spanYears(beforePan), 6);
    expect(panned.start).not.toBeCloseTo(beforePan.start, 6);
  });

  it('ctrl+wheel (trackpad pinch) steps with the lower threshold', () => {
    initViewport({ start: 1944, end: 1956 });
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');
    act(() => {
      surface.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -80, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(spanYears(getWindow())).toBeCloseTo(ALTITUDE_CONFIG.yearSpan, 6);
  });

  it('clicking a mark selects it; Escape clears the selection', async () => {
    const user = userEvent.setup();
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const war = screen.getByRole('button', { name: /מלחמה לדוגמה/ });

    await user.click(war);
    expect(useSelectionStore.getState().selectedId).toBe('fx-war');
    expect(war).toHaveAttribute('aria-current', 'true');

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Escape' });
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });

  it('dots stay selectable too — a click opens the same detail flow', async () => {
    const user = userEvent.setup();
    render(<Timeline items={items} typeLabels={typeLabels} />);
    // At century altitude the importance-40 battle renders as a dot.
    await user.click(screen.getByRole('button', { name: /קרב לדוגמה/ }));
    expect(useSelectionStore.getState().selectedId).toBe('fx-battle');
  });

  it('events expose type + precision-aware dates to AT, chronologically ordered', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    expect(
      screen.getByRole('button', { name: 'אירוע: הכרזה לדוגמה, 14 במאי 1948' }),
    ).toBeInTheDocument();
    // People are NOT on the canvas anymore (docs/14 §5 — they live in the cast strip).
    expect(screen.queryByRole('button', { name: /^אישיות:/ })).not.toBeInTheDocument();
    const marks = screen.getAllByRole('button', { name: /^אירוע:/ });
    expect(marks.map((b) => b.getAttribute('data-item-id'))).toEqual([
      'fx-war',
      'fx-declaration',
      'fx-battle',
    ]);
  });

  it('a dense burst never collapses into chips — overflow degrades to dots', () => {
    const burst = Array.from({ length: 20 }, (_, i) =>
      makeTimelineItem(`burst-${String(i).padStart(2, '0')}`, 1948, 1949.2, { importance: 90 }),
    );
    render(<Timeline items={burst} typeLabels={typeLabels} />);
    // Rows hold the weightiest marks; the co-located rest merge into dot
    // buckets whose accessible names still account for every item.
    const buttons = screen.getAllByRole('button', { name: /^אירוע:/ });
    const accounted = buttons.reduce(
      (n, b) => n + Number(b.getAttribute('data-dot-count') ?? 1),
      0,
    );
    expect(accounted).toBe(20);
    expect(screen.getAllByRole('button', { name: /ועוד \d+ פריטים סמוכים/ }).length).toBeGreaterThan(0);
    // …and no "+N" cluster affordance exists anywhere.
    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
  });

  it('chapter fold: "עוד N" expands children in place without changing the window', async () => {
    const user = userEvent.setup();
    const family = [
      makeTimelineItem('parent', 1947.9, 1949.5, { importance: 95 }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeTimelineItem(`kid-${i}`, 1948.2, 1948.3, { importance: 40, parentId: 'parent' }),
      ),
    ];
    initViewport({ start: 1947, end: 1950 });
    render(<Timeline items={family} typeLabels={typeLabels} />);

    // Collapsed: 2 child rows fit → 3 folded.
    const fold = screen.getByRole('button', { name: STRINGS.chapterMoreAria(3, 'פריט parent') });
    const windowBefore = getWindow();
    await user.click(fold);
    expect(getWindow()).toEqual(windowBefore); // expanding is never a zoom change
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^אירוע: פריט kid/ })).toHaveLength(5);
    });
    expect(screen.getByRole('button', { name: STRINGS.chapterCollapseAria('פריט parent') })).toBeInTheDocument();
  });

  it('shows the empty notice when nothing is in range', () => {
    render(<Timeline items={[]} typeLabels={typeLabels} />);
    expect(screen.getByText(STRINGS.emptyViewNotice)).toBeInTheDocument();
  });
});
