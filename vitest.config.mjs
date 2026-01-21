import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['app/**/*.js', 'server/**/*.js'],
      exclude: [
        '**/*.test.js',
        '**/test/**',
        'scripts/**',
        'server/index.js' // dev server entry
      ]
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['**/*.test.js'],
          exclude: ['app/**/*.test.js', 'node_modules/**'],
          environment: 'node',
          restoreMocks: true
        }
      },
      {
        test: {
          name: 'jsdom',
          setupFiles: ['test/setup-vitest.js'],
          include: ['app/**/*.test.js'],
          environment: 'jsdom',
          restoreMocks: true
        }
      }
    ]
  }
});
