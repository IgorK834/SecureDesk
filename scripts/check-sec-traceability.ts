import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const mapping = readFileSync(join(root, 'docs/testing.md'), 'utf8');
const required = new Set(mapping.match(/SEC-\d{2}/g) ?? []);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function testRoot(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return testRoot(expression.expression);
  }
  if (ts.isCallExpression(expression)) return testRoot(expression.expression);
  return undefined;
}

const covered = new Set<string>();
for (const file of filesUnder(root)) {
  if (!/\.(test|spec)\.ts$/.test(file) || extname(file) !== '.ts') continue;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ['describe', 'it', 'test'].includes(testRoot(node.expression) ?? '')
    ) {
      const title = node.arguments[0];
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
        for (const id of title.text.match(/SEC-\d{2}/g) ?? []) covered.add(id);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const missing = [...required].filter((id) => !covered.has(id)).sort();
if (missing.length > 0) {
  console.error(`Missing SEC ids in test titles: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`SEC traceability complete: ${required.size} ids mapped to test titles.`);
}
