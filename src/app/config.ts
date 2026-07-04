/** Application configuration — decisions from docs/02-architecture.md. */
export const APP_CONFIG = {
  /**
   * Decision D5: the time axis flows right-to-left (past on the right),
   * matching the Hebrew RTL UI. The scale function in the timeline stage is
   * the ONLY consumer; flipping to 'ltr' reverses the axis with no other code
   * changes.
   */
  timeDirection: 'rtl' as 'rtl' | 'ltr',

  /** First content scope (docs/01-product.md). Content outside is allowed;
   *  this only seeds the initial viewport in the timeline stage. */
  contentRange: { startYear: 1930, endYear: 2000 },

  /** Relative to import.meta.env.BASE_URL (GitHub Pages-safe, decision D2). */
  datasetUrl: 'data/dataset.json',
} as const;
