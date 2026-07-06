/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build relocatable — it works on GitHub Pages at any repo
// path without knowing the repo name (decision D2, docs/spec/architecture.md).
//
// __DATASET_URL__: production bundles fetch the content-addressed
// dataset.<hash>.json (immutable caching, docs/spec/performance.md); dev and tests use the
// stable dataset.json so content rebuilds don't require a server restart.
// build-content.ts (a pre-step of both dev and build) emits both names + meta.
function hashedDatasetUrl(): string {
  try {
    const meta = JSON.parse(readFileSync('public/data/dataset.meta.json', 'utf8')) as {
      fileName?: string;
    };
    if (typeof meta.fileName === 'string') return `data/${meta.fileName}`;
  } catch {
    // fall through — content not built yet; the stable name still works.
  }
  return 'data/dataset.json';
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react()],
  define: {
    __DATASET_URL__: JSON.stringify(command === 'build' ? hashedDatasetUrl() : 'data/dataset.json'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    globals: false,
  },
}));
