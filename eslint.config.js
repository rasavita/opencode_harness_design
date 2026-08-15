'use strict';

// Minimal harness-dogfood lint: prove Style pillar + catch real undef bugs.
// Not a style guide — no formatting rules. Scoped to product control-plane JS.

const globals = require('globals');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.opencode/state/**',
      '**/.opencode/runs/**',
      '**/.opencode/worktrees/**',
      '**/test/e2e/**-output/**',
      '**/test/e2e/screenshots/**',
      '**/test/e2e/results/**',
      '**/test/evals/results/**',
      '**/symphony_clone/**',
      '**/dist/**',
      '**/build/**',
      '**/__pycache__/**',
      // Generated / vendor-adjacent fixtures
      '**/test/fixtures/**',
      '**/test/evals/fixtures/**',
    ],
  },
  {
    files: [
      '.opencode/hooks/**/*.{js,cjs}',
      '.opencode/scripts/**/*.{js,cjs}',
      '.opencode/git-hooks/**/*',
      'test/**/*.{js,cjs}',
      'eslint.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Hard fails: real bugs
      'no-undef': 'error',
      // Soft: debt to clean over time; do not block CI on legacy unused locals
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['.opencode/plugins/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      eqeqeq: ['warn', 'smart'],
    },
  },
];
