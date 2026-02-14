import { defineConfig } from 'vitest/config';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: __dirname,
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
  },
});
