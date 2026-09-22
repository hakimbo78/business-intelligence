// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * ESLint flat config.
 *
 * `npm run lint` previously failed outright because no config existed, so the
 * CI job named "Lint & Type Check" only ever type-checked.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'dashboard/**', 'prisma/migrations/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Unused values are usually a mistake, but an underscore prefix is the
      // conventional way to say "deliberately ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // `any` is still used where Prisma's Json columns meet agent payloads.
      // Warn so it stays visible without blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',

      // The product must not ship stray debug output: logging goes through
      // lib/logger.ts so it stays structured and secret-free
      // (DEVELOPMENT_RULES.md §19).
      'no-console': 'error',

      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    // Operator-facing scripts print to the terminal by design.
    files: ['src/scripts/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  }
);
