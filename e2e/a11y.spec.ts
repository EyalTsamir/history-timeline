import { test, expect } from '@playwright/test';

// Accessibility-critical interactions (docs/spec/interaction.md, docs/spec/rendering.md): keyboard operation of
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

test('keyboard on the surface steps altitudes and pans; Home returns to century', async ({ page }) => {
  await page.goto('/');
  const surface = page.getByRole('application');
  const pressed = page.locator('[aria-pressed="true"]');
  await surface.focus();
  await expect(pressed).toHaveText('מאה');
  await surface.press('+');
  await expect(pressed).toHaveText('עשור');
  await surface.press('+');
  await expect(pressed).toHaveText('שנה');
  // Arrows pan without changing the altitude.
  await surface.press('ArrowLeft');
  await expect(pressed).toHaveText('שנה');
  await surface.press('Home');
  await expect(pressed).toHaveText('מאה');
});

test('every timeline item exposes an accessible name; the surface is described', async ({ page }) => {
  await page.goto('/#t=1948&s=8');
  const surface = page.getByRole('application');
  await expect(surface).toHaveAttribute('aria-describedby', /.+/);
  const buttons = page.locator('[data-item-id]');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    // Marks/dots carry aria-label; cast & shelf chips are named by content —
    // both must yield a non-empty accessible name.
    await expect(buttons.nth(i), `item ${i} accessible name`).toHaveAccessibleName(/\S/);
  }
});
