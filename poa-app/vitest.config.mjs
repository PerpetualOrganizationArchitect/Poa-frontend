import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { transformWithOxc } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pure-function coverage and server-rendered integration tests. Browser flows use E2E.
export default defineConfig({
  plugins: [{
    name: 'test-jsx-in-js',
    enforce: 'pre',
    transform(code, id) {
      // Next accepts JSX in .js components. Use the same syntax for integration tests.
      if (/\/src\/components\/.*\.js$/.test(id)) {
        return transformWithOxc(code, id, { lang: 'jsx' });
      }
    },
  }],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    environment: 'node',
  },
});
