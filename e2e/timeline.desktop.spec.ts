import { test, expect } from '@playwright/test';

// The main desktop journey (docs/09 §3): explore a period, zoom in to reveal
// detail + event hierarchy, apply filters, open an item, follow a source link,
// clear filters, and restore state after refresh. (desktop project only — see config testMatch)

test('main flow: explore → zoom → reveal → filter → open → source → clear → restore', async ({ page }) => {
  await page.goto('/');
  const surface = page.getByRole('application');
  await expect(surface).toBeVisible();
  const items = page.locator('[data-item-id]');

  // Wide view: only the defining items render (semantic zoom + density cap).
  await expect(page.locator('[data-item-id="david-ben-gurion"]')).toBeVisible();
  const wideCount = await items.count();
  expect(wideCount).toBeLessThan(30);
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();

  // Zoom into 1948 → more items are revealed and the War of Independence shows.
  await page.goto('/#t=1948&s=6');
  await expect(page.locator('[data-item-id="war-of-independence"]')).toBeVisible();
  await expect(async () => expect(await items.count()).toBeGreaterThan(wideCount)).toPass();

  // Open the war item → detail panel with its title, its sub-events (event
  // hierarchy), and a clickable external source.
  await page.locator('[data-item-id="war-of-independence"]').click();
  const panel = page.getByRole('complementary', { name: 'פרטי הפריט' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'מלחמת העצמאות' })).toBeVisible();
  await expect(panel.getByText('תתי־אירועים')).toBeVisible();
  await expect(panel.getByRole('button', { name: /הקמת צה/ })).toBeVisible();
  // Follow a source link: it points at a real external https page, new tab.
  const link = panel.getByRole('link').first();
  await expect(link).toHaveAttribute('href', /^https:\/\//);
  await expect(link).toHaveAttribute('target', '_blank');

  // Close with Escape → panel gone.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Apply a content-type filter (people only) → works/events drop out; the
  // results line is exact (40 people of 148).
  await page.getByRole('button', { name: 'אנשים', exact: true }).click();
  await expect(page.getByText(/40\s+מתוך\s+148/)).toBeVisible();
  await expect(page.locator('[data-item-id="yemei-tziklag"]')).toHaveCount(0);

  // Clear all filters → back to the full set.
  await page.getByRole('button', { name: 'נקה הכול' }).click();
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();

  // Restore state after refresh: reset to the full range (so a 1967 item is in
  // view), select it, reload, and confirm the panel is still open.
  await page.getByRole('button', { name: 'טווח מלא' }).click();
  await expect(page.locator('[data-item-id="six-day-war"]')).toBeVisible();
  await page.locator('[data-item-id="six-day-war"]').click();
  await expect(page.getByRole('heading', { name: 'מלחמת ששת הימים' })).toBeVisible();
  await expect(page).toHaveURL(/sel=six-day-war/);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'פרטי הפריט' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'מלחמת ששת הימים' })).toBeVisible();
});

test('invalid URL params degrade to the default view (no crash)', async ({ page }) => {
  await page.goto('/#t=notayear&s=abc&r=atlantis&sel=nobody&imp=xyz');
  await expect(page.getByRole('application')).toBeVisible();
  // garbage selection id is dropped — no detail panel
  await expect(page.getByRole('complementary', { name: 'פרטי הפריט' })).toHaveCount(0);
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();
});
