// Flat ESLint config (docs/12). TypeScript-aware linting on top of the strict
// tsconfig gate — recommended (non-type-checked) rules for speed, plus the
// react-hooks rules that catch the class of bug tsc can't (stale deps, hooks
// order). Pure-layer boundaries are documented, not lint-enforced yet.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/data/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // The two classic, high-value hook rules only. react-hooks v7 also ships
      // experimental React-Compiler rules (refs/immutability) that flag this
      // codebase's deliberate ref-sync-during-render and local-accumulator
      // patterns (documented in Timeline.tsx) — those are not enabled here.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
);
