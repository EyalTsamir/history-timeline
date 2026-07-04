import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STRINGS } from '../app/strings.he';
import { initTimelineStateFromUrl } from '../app/urlState';
import { normalizeDataset } from '../domain/normalize';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { useViewportStore } from '../state/viewportStore';
import { makeFixtureDataset } from '../test/fixtures';
import { spanYears } from '../timeline/scale';
import { TimelineWorkspace } from './TimelineWorkspace';

const dataset = makeFixtureDataset();
const items = normalizeDataset(dataset);

function setup(): void {
  history.replaceState(null, '', window.location.pathname);
  useFilterStore.getState().clearAll();
  useSelectionStore.getState().clear();
  initTimelineStateFromUrl(items, dataset);
}

/** Pretend to be a phone: min-width media queries don't match. */
function mockMobileMatchMedia(): void {
  (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

describe('TimelineWorkspace — desktop detail panel', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('selecting an item opens the panel with its details and moves focus in', async () => {
    const user = userEvent.setup();
    render(<TimelineWorkspace items={items} dataset={dataset} />);

    await user.click(screen.getByRole('button', { name: /מלחמה לדוגמה/ }));

    const panel = await screen.findByRole('complementary', { name: STRINGS.detailPanelLabel });
    expect(within(panel).getByRole('heading', { name: 'מלחמה לדוגמה' })).toBeInTheDocument();
    expect(within(panel).getByText('אירוע-על עם תתי-אירועים.')).toBeInTheDocument();
    expect(within(panel).getByText(STRINGS.importanceValue(95))).toBeInTheDocument();
    expect(within(panel).getByText(STRINGS.kindEvent)).toBeInTheDocument();
    expect(document.activeElement).toBe(panel);
    // Sub-events are listed as traversal targets.
    expect(within(panel).getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
  });

  it('Escape inside the panel closes it and returns focus to the item', async () => {
    const user = userEvent.setup();
    render(<TimelineWorkspace items={items} dataset={dataset} />);
    const war = screen.getByRole('button', { name: /מלחמה לדוגמה/ });

    await user.click(war);
    const panel = await screen.findByRole('complementary', { name: STRINGS.detailPanelLabel });
    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(screen.queryByRole('complementary', { name: STRINGS.detailPanelLabel })).not.toBeInTheDocument();
    expect(useSelectionStore.getState().selectedId).toBeNull();
    expect(document.activeElement).toBe(war);
  });

  it('person → work traversal re-selects and pans the viewport to fit the work', async () => {
    const user = userEvent.setup();
    render(<TimelineWorkspace items={items} dataset={dataset} />);

    await user.click(screen.getByRole('button', { name: /^אישיות: מנהיג לדוגמה/ }));
    const panel = await screen.findByRole('complementary', { name: STRINGS.detailPanelLabel });
    expect(within(panel).getByText(STRINGS.detailWorksAbout)).toBeInTheDocument();

    const before = useViewportStore.getState().window;
    await user.click(within(panel).getByRole('button', { name: /אוטוביוגרפיה לדוגמה/ }));

    expect(useSelectionStore.getState().selectedId).toBe('fx-autobio');
    expect(
      within(screen.getByRole('complementary', { name: STRINGS.detailPanelLabel })).getByRole('heading', {
        name: 'אוטוביוגרפיה לדוגמה',
      }),
    ).toBeInTheDocument();
    // The 88-year covered period doesn't fit the 77-year default window → zoom out to fit.
    const after = useViewportStore.getState().window;
    expect(spanYears(after)).toBeGreaterThan(spanYears(before));
    expect(after.start).toBeLessThan(1886.5);

    // Works publication metadata is shown but never used for positioning (D7).
    const workPanel = screen.getByRole('complementary', { name: STRINGS.detailPanelLabel });
    expect(within(workPanel).getByText(STRINGS.detailPublished('1975'))).toBeInTheDocument();
    expect(within(workPanel).getByText('1886–1973')).toBeInTheDocument();
  });

  it('an open-ended lifespan is labeled ongoing, never with an end date', async () => {
    const user = userEvent.setup();
    // Zoom into a window where the living writer (importance 55) is visible.
    useViewportStore.getState().setWindow({ start: 1950, end: 1965 });
    render(<TimelineWorkspace items={items} dataset={dataset} />);

    await user.click(await screen.findByRole('button', { name: /סופר חי לדוגמה/ }));
    const panel = await screen.findByRole('complementary', { name: STRINGS.detailPanelLabel });
    expect(within(panel).getByText(/1954–/)).toBeInTheDocument();
    expect(within(panel).getByText(new RegExp(STRINGS.ongoingLifespan))).toBeInTheDocument();
  });

  it('mirrors selection and viewport into the URL hash (shareable state)', async () => {
    const user = userEvent.setup();
    render(<TimelineWorkspace items={items} dataset={dataset} />);

    await user.click(screen.getByRole('button', { name: /מלחמה לדוגמה/ }));
    await waitFor(() => {
      expect(window.location.hash).toContain('sel=fx-war');
    });
    expect(window.location.hash).toMatch(/t=-?[\d.]+/);
    expect(window.location.hash).toMatch(/s=[\d.]+/);
  });

  it('filter changes never reset the user’s period or zoom', async () => {
    render(<TimelineWorkspace items={items} dataset={dataset} />);
    useViewportStore.getState().setWindow({ start: 1947, end: 1950 });
    const before = useViewportStore.getState().window;

    useFilterStore.getState().toggleContentType('person');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /מלחמה לדוגמה/ })).not.toBeInTheDocument();
    });
    expect(useViewportStore.getState().window).toEqual(before);
  });
});

describe('TimelineWorkspace — mobile bottom sheet', () => {
  beforeEach(() => {
    mockMobileMatchMedia();
    setup();
  });

  afterEach(() => {
    cleanup();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('selecting an item opens a modal bottom sheet; closing clears the selection', async () => {
    const user = userEvent.setup();
    render(<TimelineWorkspace items={items} dataset={dataset} />);

    await user.click(screen.getByRole('button', { name: /מלחמה לדוגמה/ }));

    const sheet = await screen.findByRole('dialog', { name: 'מלחמה לדוגמה' });
    expect(within(sheet).getByText('אירוע-על עם תתי-אירועים.')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: STRINGS.detailPanelLabel })).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: STRINGS.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });
});
