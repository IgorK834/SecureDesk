// Prints the Vitest coverage totals as a Markdown table for the GitHub Actions job summary.
import { existsSync, readFileSync } from 'node:fs';

const file = 'coverage/coverage-summary.json';
if (!existsSync(file)) {
  console.log('### Coverage\n\nNo coverage summary was produced.');
} else {
  const { total } = JSON.parse(readFileSync(file, 'utf8'));
  const rows = ['lines', 'statements', 'functions', 'branches'].map(
    (metric) =>
      `| ${metric} | ${total[metric].pct}% | ${total[metric].covered} / ${total[metric].total} |`,
  );
  console.log(
    ['### Coverage', '', '| Metric | Covered | Count |', '| --- | --- | --- |', ...rows].join('\n'),
  );
}
