/**
 * jsdom applies no media queries, so the mobile-only filter button (hidden on
 * desktop purely by CSS) is always present here — the App-level tests rely on
 * that. Backdrop/Tab-wrap mechanics are tested on a directly rendered Sheet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { STRINGS } from '../app/strings.he';
import { InMemoryDataSource } from '../data/InMemoryDataSource';
import { useFilterStore } from '../state/filterStore';
import { makeFixtureDataset } from '../test/fixtures';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
  });

  // vitest globals are off, so RTL cannot auto-register its cleanup.
  afterEach(cleanup);

  it('opens from the mobile filter button, closes on Esc, and returns focus', async () => {
    const user = userEvent.setup();
    render(<App dataSource={new InMemoryDataSource(makeFixtureDataset())} />);
    await screen.findByText('מלחמה לדוגמה');

    const opener = screen.getByRole('button', { name: STRINGS.mobileFilterButton });
    await user.click(opener);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: STRINGS.filtersHeading })).toBeInTheDocument();
    // The sheet contains the same filter groups as the sidebar.
    expect(within(dialog).getByRole('heading', { name: STRINGS.filterRegions })).toBeInTheDocument();
    // Focus moved into the dialog on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes via the close button and the backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open title={STRINGS.filtersHeading} closeLabel={STRINGS.close} onClose={onClose}>
        <button type="button">פנימי</button>
      </Sheet>,
    );

    await user.click(screen.getByRole('button', { name: STRINGS.close }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole('dialog');
    // Clicking inside the panel must NOT close.
    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Clicking the backdrop (the overlay around the panel) closes.
    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus in on open and wraps Tab between first and last focusable', async () => {
    const user = userEvent.setup();
    render(
      <Sheet open title={STRINGS.filtersHeading} closeLabel={STRINGS.close} onClose={() => {}}>
        <button type="button">פנימי</button>
      </Sheet>,
    );

    const closeButton = screen.getByRole('button', { name: STRINGS.close });
    const inner = screen.getByRole('button', { name: 'פנימי' });
    expect(closeButton).toHaveFocus();

    inner.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(inner).toHaveFocus();
  });
});
