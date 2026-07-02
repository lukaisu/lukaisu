import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ['webapp-tests/**/*.test.ts', 'webapp-tests/**/*.spec.ts'],
    exclude: ['node_modules'],
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./webapp-tests/setup.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['webapp/js/**/*.ts'],
      exclude: [
        'webapp/js/types/**',
      ],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'webapp/js'),
      '@shared': resolve(__dirname, 'webapp/js/shared'),
      '@modules': resolve(__dirname, 'webapp/js/modules'),
      '@css': resolve(__dirname, 'webapp/css'),
      // Use CSP-compliant Alpine.js build (no unsafe-eval needed). Still
      // needed: dictionaries/local_dictionary_panel.ts is Alpine-based until
      // it's ported to Svelte (R6e note, lukaisu-server).
      'alpinejs': '@alpinejs/csp',
    }
  }
});
