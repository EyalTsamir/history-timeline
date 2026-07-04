import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { STRINGS } from '../app/strings.he';
import { InMemoryDataSource } from '../data/InMemoryDataSource';
import { useFilterStore } from '../state/filterStore';
import { useSelectionStore } from '../state/selectionStore';
import { makeFixtureDataset } from '../test/fixtures';

async function renderReadyApp() {
  render(<App dataSource={new InMemoryDataSource(makeFixtureDataset())} />);
  await screen.findByRole('button', { name: /מלחמה לדוגמה/ });
}

describe('FilterBar', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
    useSelectionStore.getState().clear();
    history.replaceState(null, '', window.location.pathname);
  });

  // vitest globals are off, so RTL cannot auto-register its cleanup.
  afterEach(cleanup);

  it('toggling the person content-type chip narrows the timeline to people', async () => {
    const user = userEvent.setup();
    await renderReadyApp();

    const chip = screen.getByRole('button', { name: STRINGS.contentTypePeople });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Events vanish from the timeline; the high-importance person remains.
    expect(screen.queryByRole('button', { name: /מלחמה לדוגמה/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /מנהיג לדוגמה/ })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.shownCount(2, 7))).toBeInTheDocument();
  });

  it('clear-all resets chips and restores the full timeline', async () => {
    const user = userEvent.setup();
    await renderReadyApp();

    const chip = screen.getByRole('button', { name: STRINGS.contentTypePeople });
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: STRINGS.clearAll }));

    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('button', { name: /מלחמה לדוגמה/ })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.shownCount(7, 7))).toBeInTheDocument();
    // Clear-all button disappears once no filter is active.
    expect(screen.queryByRole('button', { name: STRINGS.clearAll })).not.toBeInTheDocument();
  });

  it('renders labelled chip groups from the dataset taxonomies', async () => {
    await renderReadyApp();

    const sidebar = screen.getByRole('complementary', { name: STRINGS.filtersHeading });
    for (const heading of [
      STRINGS.filterRegions,
      STRINGS.filterContentTypes,
      STRINGS.filterPersonCategories,
    ]) {
      expect(within(sidebar).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    // Region hierarchy: parent and children all present as toggle chips.
    // Sub-region names carry hidden "בתוך <parent>" context for screen
    // readers (review fix), so child chips match by name prefix.
    for (const name of [/^ארץ ישראל וישראל$/, /^ירושלים בתוך/, /^תל אביב בתוך/]) {
      expect(within(sidebar).getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    // Min-importance range input is properly labelled and visible-valued.
    const range = within(sidebar).getByLabelText(STRINGS.filterMinImportance);
    expect(range).toHaveValue('0');
  });
});
