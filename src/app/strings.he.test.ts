/**
 * Regression (review finding): Hebrew number agreement — n === 1 must use
 * singular forms, not "1 מסננים פעילים".
 */
import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings.he';

describe('Hebrew plural agreement', () => {
  it('shownCount uses the singular form for a single shown item', () => {
    expect(STRINGS.shownCount(1, 7)).toBe('מוצג פריט אחד מתוך 7');
    expect(STRINGS.shownCount(30, 30)).toBe('מוצגים 30 מתוך 30 פריטים');
  });
});
