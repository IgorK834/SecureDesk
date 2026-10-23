import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/clean-env.ts'],
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
        // The root component uses `templateUrl`/`styleUrl`, which need the Angular compiler;
        // it is exercised by `ng build` rather than the plain-Vitest root run. The app config
        // and routes are not excluded: app.routes.spec.ts runs them for real.
        'apps/frontend/src/app/app.ts',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
