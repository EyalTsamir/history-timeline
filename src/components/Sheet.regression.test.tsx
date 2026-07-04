/**
 * Regression (review finding): Escape/Tab handling used to live on the
 * overlay's React onKeyDown, so it died the moment focus left the overlay
 * subtree (e.g. after a click on non-interactive sheet content). Handlers are
 * now document-level: Esc closes and Tab is contained regardless of where
 * focus currently is.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Sheet } from './Sheet';

afterEach(cleanup);

function renderOpenSheet(onClose: () => void) {
  return render(
    <Sheet open title="סינון" closeLabel="סגירה" onClose={onClose}>
      <button type="button">פעולה</button>
    </Sheet>,
  );
}

describe('Sheet document-level key handling', () => {
  it('Escape closes even when focus is outside the panel (on body)', () => {
    const onClose = vi.fn();
    renderOpenSheet(onClose);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab from outside the panel pulls focus back into the dialog', () => {
    const onClose = vi.fn();
    const { container } = renderOpenSheet(onClose);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
  });

  it('locks page scroll while open and restores it on close', () => {
    const onClose = vi.fn();
    const { unmount } = renderOpenSheet(onClose);
    expect(document.documentElement.style.overflow).toBe('hidden');
    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
