import { test, expect } from '@playwright/test';
import { makeSyntheticDataset } from '../scripts/lib/synthetic';

// Performance guardrail (docs/spec/testing.md §4, docs/spec/performance.md): drive the app over a SYNTHETIC
// 10k-item dataset (served via route interception — never production data) and
// assert the two properties that keep it fast at scale: rendered DOM nodes stay
// bounded regardless of dataset size, and a pan/zoom burst stays responsive. (desktop project)

const SYNTHETIC = JSON.stringify(makeSyntheticDataset(10000));

test('10k synthetic items: bounded rendering + responsive pan/zoom', async ({ page }) => {
  await page.route('**/data/dataset*.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: SYNTHETIC }),
  );
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible();
  // the whole 10k set is loaded (results line reflects it)
  await expect(page.getByText(/10000/)).toBeVisible();

  const items = page.locator('[data-item-id]');
  // Core invariant (docs/spec/rendering.md + docs/spec/performance.md): labeled rows are budgeted and dots
  // bucket per pixel cell, so the DOM node count is bounded by SCREEN SIZE,
  // never by dataset size.
  await expect(async () => expect(await items.count()).toBeLessThanOrEqual(1200)).toPass();

  const surface = page.getByRole('application');
  await surface.focus();
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await surface.press(i % 2 === 0 ? '+' : 'ArrowLeft');
  }
  const elapsed = Date.now() - t0;
  // 12 zoom/pan operations over 10k items complete quickly and stay bounded.
  expect(elapsed).toBeLessThan(4000);
  await expect(async () => expect(await items.count()).toBeLessThanOrEqual(1200)).toPass();
});
