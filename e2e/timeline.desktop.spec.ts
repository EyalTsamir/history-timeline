import { test, expect } from '@playwright/test';

// The main desktop journey (docs/spec/testing.md §3, docs/spec/rendering.md): orient on the century view,
// jump to an era, dive to a decade, open a chapter item, follow a source link,
// filter, clear, and restore state after refresh. (desktop project only)

test('main flow: orient → era jump → dive → open → source → filter → clear → restore', async ({ page }) => {
  await page.goto('/');
  const surface = page.getByRole('application');
  await expect(surface).toBeVisible();
  const items = page.locator('[data-item-id]');

  // Century view, presence guarantee (docs/spec/rendering.md): every event is on
  // screen as a mark or dot, plus the cast/shelf strips — never an empty museum.
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();
  expect(await items.count()).toBeGreaterThan(80);
  await expect(page.locator('[data-item-id="david-ben-gurion"]')).toBeVisible(); // cast strip chip
  await expect(page.locator('[data-item-id="war-of-independence"]')).toBeVisible(); // seal mark

  // Era chips are first-class navigation: one tap flies to קוממיות.
  await page.getByRole('button', { name: /קוממיות/ }).click();
  await expect(page.locator('[data-item-id="declaration-of-independence"]')).toBeVisible();

  // Decade altitude via URL: the war folds its sub-events into a chapter band.
  await page.goto('/#t=1948&s=6');
  await expect(page.locator('[data-item-id="war-of-independence"]')).toBeVisible();
  await expect(page.getByText(/פרקים/).first()).toBeVisible();

  // Open the war → detail panel with its title, its sub-events (event
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

  // Restore state after refresh: back to the century view (so a 1967 anchor is
  // in view), select it, reload, and confirm the panel is still open.
  await page.getByRole('button', { name: 'טווח מלא' }).click();
  await expect(page.locator('[data-item-id="six-day-war"]')).toBeVisible();
  await page.locator('[data-item-id="six-day-war"]').click();
  await expect(page.getByRole('heading', { name: 'מלחמת ששת הימים' })).toBeVisible();
  await expect(page).toHaveURL(/sel=six-day-war/);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'פרטי הפריט' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'מלחמת ששת הימים' })).toBeVisible();
});

test('altitude stepping: wheel and buttons move century ↔ decade ↔ year', async ({ page }) => {
  await page.goto('/');
  const pressed = page.locator('[aria-pressed="true"]');
  await expect(pressed).toHaveText('מאה');

  // One + step → decade; another → year; Home → century.
  await page.getByRole('button', { name: 'התקרבות' }).click();
  await expect(pressed).toHaveText('עשור');
  await page.getByRole('button', { name: 'התקרבות' }).click();
  await expect(pressed).toHaveText('שנה');
  await page.getByRole('application').focus();
  await page.keyboard.press('Home');
  await expect(pressed).toHaveText('מאה');
});

test('invalid URL params degrade to the default view (no crash)', async ({ page }) => {
  await page.goto('/#t=notayear&s=abc&r=atlantis&sel=nobody&imp=xyz');
  await expect(page.getByRole('application')).toBeVisible();
  // garbage selection id is dropped — no detail panel
  await expect(page.getByRole('complementary', { name: 'פרטי הפריט' })).toHaveCount(0);
  await expect(page.getByText(/148\s+מתוך\s+148/)).toBeVisible();
});
