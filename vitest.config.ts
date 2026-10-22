import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/*/src/**/*.{test,spec}.ts',
      'apps/*/scripts/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/backend/src/**/*.ts', 'apps/frontend/src/app/**/*.ts'],
      exclude: [
        '**/*.{test,spec}.ts',
        '**/__fixtures__/**',
        // Pure Angular wiring/bootstrap; needs the Angular compiler to run, so it is
        // exercised by `ng build` / `ng test` rather than the plain-Vitest root run.
        'apps/frontend/src/app/app.ts',
        'apps/frontend/src/app/app.config.ts',
        'apps/frontend/src/app/app.routes.ts',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
