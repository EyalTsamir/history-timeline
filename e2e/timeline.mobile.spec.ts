import { test, expect } from '@playwright/test';

// Dedicated mobile journey (docs/09 §3, docs/08 mobile): the filter bottom-sheet
// and the item-detail bottom-sheet, on a 390px touch device. (mobile project only)

test('mobile: filter sheet narrows the set; detail sheet opens and restores focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible();

  // Filters live behind the header button on mobile (no sidebar).
  await page.getByRole('button', { name: 'סינון' }).click();
  const filterSheet = page.getByRole('dialog');
  await expect(filterSheet).toBeVisible();
  await filterSheet.getByRole('button', { name: 'אנשים', exact: true }).click();
  await page.keyboard.press('Escape'); // close the sheet
  await expect(filterSheet).toBeHidden();
  await expect(page.getByText(/40\s+מתוך\s+148/)).toBeVisible();

  // Clear via the results-line button, then open an item detail bottom-sheet.
  await page.getByRole('button', { name: 'נקה הכול' }).click();
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();

  const item = page.locator('[data-item-id="david-ben-gurion"]');
  await expect(item).toBeVisible();
  await item.click();
  const detail = page.getByRole('dialog', { name: 'דוד בן-גוריון' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('מקורות')).toBeVisible(); // sources section renders

  // Close returns focus to the originating item (docs/08 focus restoration).
  await detail.getByRole('button', { name: 'סגירה' }).click();
  await expect(detail).toBeHidden();
  await expect(item).toBeFocused();
});

test('mobile: explicit zoom controls change the visible range', async ({ page }) => {
  await page.goto('/#t=1948&s=8');
  await expect(page.locator('[data-item-id="war-of-independence"]')).toBeVisible();
  // The range readout is the live region showing a "YYYY–YYYY" span (distinct
  // from the shown/total count live region).
  const readout = page.locator('[aria-live="polite"]').filter({ hasText: '–' });
  const before = (await readout.textContent())?.trim();
  await page.getByRole('button', { name: 'הגדלת התצוגה' }).click();
  await page.getByRole('button', { name: 'הגדלת התצוגה' }).click();
  // zooming narrows the window → the range readout must change
  await expect(async () => {
    expect((await readout.textContent())?.trim()).not.toBe(before);
  }).toPass();
});
