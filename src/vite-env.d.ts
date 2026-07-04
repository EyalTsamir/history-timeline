/// <reference types="vite/client" />

/**
 * Injected by vite.config.ts `define`: the dataset artifact URL relative to
 * BASE_URL — the hashed immutable name in production builds, the stable
 * dataset.json in dev/tests (docs/10 caching strategy).
 */
declare const __DATASET_URL__: string;
