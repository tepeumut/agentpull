// ESLint v9 flat config for agentpull.
//
// Goals:
//   1. Catch real bugs (unused symbols, dead branches, type misuse).
//   2. Enforce a consistent module shape (no `require`, no `var`).
//   3. Stay out of the way of stylistic choices — Prettier/tsup handle layout.
//
// We deliberately do NOT enable type-checked rules (`typeChecked` configs)
// because they add ~5–10s to every lint run and most of what they catch is
// already caught by `npx tsc --noEmit`. If we ever want them they can be
// added selectively without restructuring this file.

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    // Files we never lint. Mirrors the test runner's exclusions plus the
    // build output and any vendored or generated artifacts.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
    ],
  },

  // Base JS recommended rules — applies to every linted file.
  eslint.configs.recommended,

  // TypeScript recommended rules — non-type-checked variant for speed.
  ...tseslint.configs.recommended,

  {
    // Project-wide TypeScript source.
    files: ['src/**/*.ts', 'bin/**/*.ts'],
    rules: {
      // TypeScript already enforces this via `noUnusedLocals`/`noUnusedParameters`,
      // and the no-unused-vars ESLint rule double-flags catch parameters and
      // intentionally-prefixed `_args`. Defer to tsc.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // We use `any` deliberately in a couple of HTTP-response shaping spots
      // where the API returns untyped JSON; downgrade to a warning instead
      // of a hard error so the build doesn't fail on those.
      '@typescript-eslint/no-explicit-any': 'warn',

      // `require()` has no place in an ESM-only project.
      '@typescript-eslint/no-require-imports': 'error',
    },
  },

  {
    // Tests can be a bit looser — vitest spies and mocks legitimately use
    // `any` and `non-null-assertion` patterns that would be noisy elsewhere.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
