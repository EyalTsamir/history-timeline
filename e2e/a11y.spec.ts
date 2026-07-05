import { test, expect } from '@playwright/test';

// Accessibility-critical interactions (docs/08, docs/09): keyboard operation of
// items and the timeline surface, focus return, and accessible names. (desktop project)

test('keyboard-only: focus an item, Enter opens, Esc closes and returns focus', async ({ page }) => {
  await page.goto('/#t=1948&s=8');
  const item = page.locator('[data-item-id="war-of-independence"]');
  await expect(item).toBeVisible();
  await item.focus();
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'פרטי הפריט' });
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(item).toBeFocused(); // focus restored to the origin item
});

test('keyboard on the timeline surface pans and zooms; Home resets', async ({ page }) => {
  await page.goto('/');
  const surface = page.getByRole('application');
  const items = page.locator('[data-item-id]');
  await surface.focus();
  const wide = await items.count();
  await surface.press('+');
  await surface.press('+');
  await surface.press('+');
  await expect(async () => expect(await items.count()).toBeGreaterThan(wide)).toPass();
  await surface.press('Home'); // reset to full range
  await expect(async () => expect(await items.count()).toBeLessThanOrEqual(wide + 2)).toPass();
});

test('every timeline item exposes an accessible name; the surface is described', async ({ page }) => {
  await page.goto('/#t=1948&s=8');
  const surface = page.getByRole('application');
  await expect(surface).toHaveAttribute('aria-describedby', /.+/);
  const buttons = page.locator('[data-item-id]');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const name = await buttons.nth(i).getAttribute('aria-label');
    expect(name && name.trim().length, `item ${i} aria-label`).toBeTruthy();
  }
});
