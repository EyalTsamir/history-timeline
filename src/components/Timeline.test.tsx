import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STRINGS } from '../app/strings.he';
import { normalizeDataset } from '../domain/normalize';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { makeFixtureDataset, makeTimelineItem } from '../test/fixtures';
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

const FULL: TimeWindow = { start: 1926.5, end: 2003.5 }; // span 77 → threshold 85 @ 960px

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

  it('renders the application region, keyboard instructions, bands and ruler', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const region = screen.getByRole('application', { name: STRINGS.timelineRegionLabel });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(STRINGS.timelineInstructions)).toBeInTheDocument();
    for (const band of [STRINGS.bandEvents, STRINGS.bandPeople, STRINGS.bandWorks]) {
      expect(screen.getByText(band)).toBeInTheDocument();
    }
    // Decade ruler labels at this zoom.
    expect(screen.getByText('1950')).toBeInTheDocument();
    // Live range readout.
    expect(screen.getByText('1926–2003')).toBeInTheDocument();
  });

  it('semantic zoom: the wide view hides secondary items; a narrow window reveals them', () => {
    const wide = render(<Timeline items={items} typeLabels={typeLabels} />);
    expect(screen.getByRole('button', { name: /מלחמה לדוגמה/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /קרב לדוגמה/ })).not.toBeInTheDocument();
    wide.unmount();

    initViewport({ start: 1947, end: 1950 }); // ~3y per screen → low threshold
    render(<Timeline items={items} typeLabels={typeLabels} />);
    expect(screen.getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
    // The parent renders too (container header) — sub-events never orphan.
    expect(screen.getByRole('button', { name: /מלחמה לדוגמה/ })).toBeInTheDocument();
  });

  it('zooming in via the store transitions items in without a remount', async () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    expect(screen.queryByRole('button', { name: /קרב לדוגמה/ })).not.toBeInTheDocument();

    act(() => {
      useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
    });
    expect(screen.getByText('1947–1950')).toBeInTheDocument();
  });

  it('keyboard: +/− zoom around the center, arrows pan (RTL: ← = forward in time), Home resets', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');
    surface.focus();

    const before = getWindow();
    fireEvent.keyDown(surface, { key: '+' });
    const zoomedIn = getWindow();
    expect(spanYears(zoomedIn)).toBeLessThan(spanYears(before));
    expect((zoomedIn.start + zoomedIn.end) / 2).toBeCloseTo((before.start + before.end) / 2, 6);

    fireEvent.keyDown(surface, { key: '-' });
    expect(spanYears(getWindow())).toBeCloseTo(spanYears(before), 6);

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

  it('wheel: vertical zooms at the cursor, horizontal (trackpad) pans', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');

    const before = getWindow();
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
    });
    expect(spanYears(getWindow())).toBeGreaterThan(spanYears(before));

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

  it('ctrl+wheel (trackpad pinch) zooms', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const surface = screen.getByRole('application');
    const before = getWindow();
    act(() => {
      surface.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -200, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(spanYears(getWindow())).toBeLessThan(spanYears(before));
  });

  it('clicking an item selects it; Escape clears the selection', async () => {
    const user = userEvent.setup();
    render(<Timeline items={items} typeLabels={typeLabels} />);
    const war = screen.getByRole('button', { name: /מלחמה לדוגמה/ });

    await user.click(war);
    expect(useSelectionStore.getState().selectedId).toBe('fx-war');
    expect(war).toHaveAttribute('aria-current', 'true');

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Escape' });
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });

  it('items expose type + precision-aware dates to assistive tech, chronologically ordered', () => {
    render(<Timeline items={items} typeLabels={typeLabels} />);
    expect(
      screen.getByRole('button', { name: 'אירוע: הכרזה לדוגמה, 14 במאי 1948' }),
    ).toBeInTheDocument();
    // Person label uses the person kind word and the open-aware date format.
    expect(screen.getByRole('button', { name: /^אישיות: מנהיג לדוגמה/ })).toBeInTheDocument();
    // DOM order within the events band is chronological (tab order).
    const marks = screen.getAllByRole('button', { name: /^אירוע:/ });
    expect(marks.map((b) => b.getAttribute('data-item-id'))).toEqual(['fx-war', 'fx-declaration']);
  });

  it('a dense burst collapses into a cluster chip that zooms to fit on click', async () => {
    const user = userEvent.setup();
    const burst = Array.from({ length: 20 }, (_, i) =>
      makeTimelineItem(`burst-${String(i).padStart(2, '0')}`, 1948, 1949.2, { importance: 90 }),
    );
    render(<Timeline items={burst} typeLabels={typeLabels} />);

    // 20 co-located items: the density cap keeps 8, the row budget places 5 —
    // the remaining 15 collapse into one chip.
    const chip = screen.getByRole('button', { name: STRINGS.clusterAriaLabel(15) });
    expect(chip).toHaveTextContent(STRINGS.clusterChip(15));

    await user.click(chip);
    const window = getWindow();
    expect(spanYears(window)).toBeLessThan(3);
    expect(window.start).toBeLessThanOrEqual(1948);
    expect(window.end).toBeGreaterThanOrEqual(1949.2);
  });

  it('shows the empty notice when nothing is in range', () => {
    render(<Timeline items={[]} typeLabels={typeLabels} />);
    expect(screen.getByText(STRINGS.emptyViewNotice)).toBeInTheDocument();
  });
});
