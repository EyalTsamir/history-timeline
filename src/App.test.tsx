import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STRINGS } from './app/strings.he';
import { DatasetLoadError } from './data/DataSource';
import type { DataSource } from './data/DataSource';
import { InMemoryDataSource } from './data/InMemoryDataSource';
import type { Dataset } from './domain/dataset';
import { useFilterStore } from './state/filterStore';
import { useSelectionStore } from './state/selectionStore';
import { makeFixtureDataset } from './test/fixtures';

function makeEmptyDataset(): Dataset {
  return {
    ...makeFixtureDataset(),
    events: [],
    people: [],
    works: [],
    relations: [],
    indexes: { childrenByEvent: {}, worksByPerson: {}, worksByAuthor: {}, regionDescendants: {} },
  };
}

/** Rejects on the first call, serves the fixture afterwards — for retry tests. */
class FailingOnceDataSource implements DataSource {
  calls = 0;
  private readonly inner = new InMemoryDataSource(makeFixtureDataset());

  loadDataset(): Promise<Dataset> {
    this.calls += 1;
    if (this.calls === 1) {
      return Promise.reject(new DatasetLoadError('http', 'HTTP 404 loading dataset'));
    }
    return this.inner.loadDataset();
  }
}

describe('App', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
    useSelectionStore.getState().clear();
    history.replaceState(null, '', window.location.pathname);
  });

  // vitest globals are off, so RTL cannot auto-register its cleanup.
  afterEach(cleanup);

  it('renders loading, then the interactive timeline with the visible fixture items', async () => {
    render(<App dataSource={new InMemoryDataSource(makeFixtureDataset())} />);

    expect(screen.getByText(STRINGS.loading)).toBeInTheDocument();

    // Item buttons carry "<type>: <title>, <precision-aware date>" names.
    expect(
      await screen.findByRole('button', { name: 'אירוע: מלחמה לדוגמה, 30 בנובמבר 1947 – 20 ביולי 1949' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: STRINGS.appTitle })).toBeInTheDocument();
    expect(screen.getByRole('application', { name: STRINGS.timelineRegionLabel })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.shownCount(7, 7))).toBeInTheDocument();

    // Presence guarantee (docs/spec/rendering.md): anchors are labeled marks AND the
    // low-importance sub-event is still on screen as a selectable dot.
    expect(
      screen.getByRole('button', { name: 'אירוע: הכרזה לדוגמה, 14 במאי 1948' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /קרב לדוגמה/ })).toBeInTheDocument();
    // People live in the cast strip, works in the period shelf (docs/spec/rendering.md).
    expect(screen.getByText(STRINGS.castTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מנהיג לדוגמה' })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.shelfTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /אוטוביוגרפיה לדוגמה/ })).toBeInTheDocument();

    // Explicit navigation controls (gesture alternatives): altitude control,
    // step buttons, and the full-range era chip.
    expect(screen.getByRole('group', { name: STRINGS.altitudeControlLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STRINGS.zoomIn })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STRINGS.zoomOut })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: STRINGS.resetView })).toBeInTheDocument();
  });

  it('shows a kind-specific Hebrew message and retry re-invokes the source', async () => {
    const user = userEvent.setup();
    const source = new FailingOnceDataSource();
    render(<App dataSource={source} />);

    expect(await screen.findByText(STRINGS.errors.http)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(STRINGS.errorTitle);

    await user.click(screen.getByRole('button', { name: STRINGS.retry }));

    expect(await screen.findByText('מלחמה לדוגמה')).toBeInTheDocument();
    expect(source.calls).toBe(2);
  });

  it('maps each DatasetLoadError kind to its own message', async () => {
    const source: DataSource = {
      loadDataset: () =>
        Promise.reject(new DatasetLoadError('schema-version', 'found 0, expected 1')),
    };
    render(<App dataSource={source} />);
    expect(await screen.findByText(STRINGS.errors['schema-version'])).toBeInTheDocument();
  });

  it('falls back to the unknown message for non-DatasetLoadError failures', async () => {
    const source: DataSource = { loadDataset: () => Promise.reject(new Error('boom')) };
    render(<App dataSource={source} />);
    expect(await screen.findByText(STRINGS.errors.unknown)).toBeInTheDocument();
  });

  it('renders the empty state for a dataset with zero timeline items', async () => {
    render(<App dataSource={new InMemoryDataSource(makeEmptyDataset())} />);
    expect(await screen.findByText(STRINGS.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.emptyBody)).toBeInTheDocument();
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
  });
});
