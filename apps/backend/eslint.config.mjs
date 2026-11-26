import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const sqlRestrictions = [
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
];

const sqlGap = String.raw`(?:\s|\/\*[\s\S]*?\*\/|--[^\r\n]*(?:\r?\n|$))+`;
const auditMutation = String.raw`\b(?:update(?:${sqlGap}or${sqlGap}\w+)?|delete${sqlGap}from)${sqlGap}(?:[\w"\[\]\x60]+\s*\.\s*)?(?:audit_log\b|"audit_log"|\[audit_log\]|\x60audit_log\x60)`;

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
    rules: { 'no-restricted-syntax': ['error', ...sqlRestrictions] },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: [
      'src/server/db/migrations/**',
      'scripts/audit-tamper-demo/**',
      '**/*.{test,spec}.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sqlRestrictions,
        {
          selector:
            'CallExpression[callee.property.name=/^(update|delete)$/][arguments.0.name="auditLog"], CallExpression[callee.property.value=/^(update|delete)$/][arguments.0.name="auditLog"], CallExpression[callee.property.name=/^(update|delete)$/][arguments.0.property.name="auditLog"]',
          message: 'audit_log is append-only. Updates and deletes are forbidden.',
        },
        {
          selector: `Literal[value=/${auditMutation}/i], TemplateElement[value.cooked=/${auditMutation}/i]`,
          message: 'audit_log is append-only. Updates and deletes are forbidden.',
        },
        {
          selector: `TaggedTemplateExpression[quasi.quasis.0.value.cooked=/\\b(?:update|delete${sqlGap}from)${sqlGap}$/i]:has(Identifier[name="auditLog"])`,
          message: 'audit_log is append-only. Updates and deletes are forbidden.',
        },
      ],
    },
  },
]);

export default eslintConfig;
