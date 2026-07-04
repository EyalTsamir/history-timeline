import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STRINGS } from './app/strings.he';
import { DatasetLoadError } from './data/DataSource';
import type { DataSource } from './data/DataSource';
import { InMemoryDataSource } from './data/InMemoryDataSource';
import type { Dataset } from './domain/dataset';
import { useFilterStore } from './state/filterStore';
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
  });

  // vitest globals are off, so RTL cannot auto-register its cleanup.
  afterEach(cleanup);

  it('renders loading, then the ready layout with fixture rows', async () => {
    render(<App dataSource={new InMemoryDataSource(makeFixtureDataset())} />);

    expect(screen.getByText(STRINGS.loading)).toBeInTheDocument();

    expect(await screen.findByText('מלחמה לדוגמה')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: STRINGS.appTitle })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.placeholderTitle)).toBeInTheDocument();
    expect(screen.getByText(STRINGS.shownCount(7, 7))).toBeInTheDocument();

    const list = screen.getByRole('list', { name: STRINGS.previewListLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    // Chronological: the work covering 1886– (start 1886.0) precedes the
    // person born 1886-10-16 (≈1886.79) — D7 positioning by covered period.
    expect(rows[0]).toHaveTextContent('אוטוביוגרפיה לדוגמה');
    expect(rows[1]).toHaveTextContent('מנהיג לדוגמה');
    // Precision-aware display date from the day-precision fixture event.
    expect(screen.getByText('14 במאי 1948')).toBeInTheDocument();
    // Work-type label resolves through the taxonomy name.
    expect(screen.getByText('רומן היסטורי לדוגמה')).toBeInTheDocument();
    expect(within(list).getAllByText('רומן היסטורי').length).toBeGreaterThan(0);
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
    expect(screen.queryByText(STRINGS.placeholderTitle)).not.toBeInTheDocument();
  });
});
