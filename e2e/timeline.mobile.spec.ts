import { test, expect } from '@playwright/test';

// Dedicated mobile journey (docs/spec/testing.md §3, docs/spec/interaction.md): the vertical chronicle,
// the filter bottom-sheet, and the item-detail bottom-sheet, on a 390px touch
// device. (mobile project only)

test('mobile: chronicle renders; filter sheet narrows; detail sheet opens and restores focus', async ({ page }) => {
  await page.goto('/');
  const chronicle = page.getByRole('region', { name: 'כרוניקת ציר הזמן' });
  await expect(chronicle).toBeVisible();
  // Era sections with sticky year headings — scroll is movement through time.
  await expect(page.getByRole('heading', { name: 'קוממיות' })).toBeVisible();

  // Filters live behind the header button on mobile (no sidebar).
  await page.getByRole('button', { name: 'סינון' }).click();
  const filterSheet = page.getByRole('dialog');
  await expect(filterSheet).toBeVisible();
  await filterSheet.getByRole('button', { name: 'אנשים', exact: true }).click();
  await page.keyboard.press('Escape'); // close the sheet
  await expect(filterSheet).toBeHidden();
  await expect(page.getByText(/40\s+מתוך\s+148/)).toBeVisible();

  // Clear via the results-line button, then open an item detail bottom-sheet
  // from the era cast row (people live there, docs/spec/rendering.md).
  await page.getByRole('button', { name: 'נקה הכול' }).click();
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();

  const item = page.locator('[data-item-id="david-ben-gurion"]').first();
  await item.scrollIntoViewIfNeeded();
  await expect(item).toBeVisible();
  await item.click();
  const detail = page.getByRole('dialog', { name: 'דוד בן-גוריון' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('מקורות וקישורים')).toBeVisible(); // sources section renders

  // Close returns focus to the originating chip (docs/spec/interaction.md focus restoration).
  await detail.getByRole('button', { name: 'סגירה' }).click();
  await expect(detail).toBeHidden();
  await expect(item).toBeFocused();
});

test('mobile: era chips jump the chronicle and the URL window follows the scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'כרוניקת ציר הזמן' })).toBeVisible();

  // Tapping an era chip scrolls the feed to that era; the scroll spy then
  // mirrors the position into the shareable URL (t=<year-ish>).
  await page.getByRole('button', { name: /שנות אוסלו/ }).click();
  await expect(page.getByRole('button', { name: /רצח יצחק רבין/ })).toBeVisible();
  await expect(async () => {
    const t = Number(new URL(page.url()).hash.match(/t=(-?[\d.]+)/)?.[1]);
    expect(t).toBeGreaterThan(1991);
  }).toPass();

  // A shared year-level URL lands the feed on that year.
  await page.goto('/#t=1948&s=2');
  await expect(async () => {
    const heading = page.locator('[data-year="1948"]');
    const box = await heading.boundingBox();
    expect(box, 'the 1948 heading is on screen').not.toBeNull();
    expect(box!.y).toBeGreaterThan(-40);
    expect(box!.y).toBeLessThan(400);
  }).toPass();
});
