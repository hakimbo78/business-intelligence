import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
    // Integration suites share a single database, so running files in
    // parallel lets one suite's fixtures and cleanup disturb another's.
    // Determinism is worth more here than the few seconds it costs.
    fileParallelism: false,

    // Separate unit and integration test timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': import.meta.dirname + '/src',
    },
  },
});
