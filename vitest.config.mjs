import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    reporters: 'default',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
