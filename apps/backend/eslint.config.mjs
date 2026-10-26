import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // Passwords, tokens and identifiers come from crypto.randomInt / randomBytes / randomUUID.
    // Math.random is predictable, so a secret built from it would be guessable.
    files: ['src/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is not cryptographically secure. Use node:crypto (randomInt, randomBytes).',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/server/db/migrations/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
          message: 'Raw SQL fragments are forbidden outside database migrations.',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(prepare|exec)$/] > TemplateLiteral[expressions.length>0]',
          message: 'Do not interpolate values into SQL. Use bound parameters.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(prepare|exec)$/] > BinaryExpression[operator='+']",
          message: 'Do not concatenate SQL strings. Use bound parameters.',
        },
      ],
    },
  },
]);

export default eslintConfig;
