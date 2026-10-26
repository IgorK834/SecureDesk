import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'angular-inline-component-resources',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('.ts')) return;
        const inline = (match: string, property: string, relativePath: string) => {
          const contents = readFileSync(resolve(dirname(id), relativePath), 'utf8');
          return property === 'templateUrl'
            ? `template: ${JSON.stringify(contents)}`
            : `styles: [${JSON.stringify(contents)}]`;
        };
        return source
          .replace(/(templateUrl):\s*['"](.+?)['"]/g, inline)
          .replace(/(styleUrl):\s*['"](.+?)['"]/g, inline);
      },
    },
  ],
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/clean-env.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'apps/backend/src/server/**/*.{test,spec}.ts',
            'apps/frontend/src/**/*.{test,spec}.ts',
            'apps/*/scripts/**/*.{test,spec}.ts',
            'tests/**/*.{test,spec}.ts',
          ],
          exclude: [
            'tests/integration/**',
            'tests/admin-routes-authz.test.ts',
            'tests/route-guard-conformance.test.ts',
            'tests/e2e/**',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'apps/backend/src/app/api/**/*.{test,spec}.ts',
            'tests/integration/**/*.{test,spec}.ts',
            'tests/admin-routes-authz.test.ts',
            'tests/route-guard-conformance.test.ts',
          ],
        },
      },
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
