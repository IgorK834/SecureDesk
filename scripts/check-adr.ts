/**
 * Lints the architecture decision records in docs/adr (override with ADR_DIR for tests).
 *
 * Rules: files are named `NNNN-kebab-title.md`, numbers are unique, each record starts with YAML
 * front matter holding a known `status` and an ISO `date`, has a `# Title` heading, and a
 * superseded record links to the existing record that replaces it. `0000-template.md` may keep
 * its placeholders. A missing directory is fine: there is nothing to lint yet.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = process.env.ADR_DIR ? resolve(process.env.ADR_DIR) : join(root, 'docs', 'adr');

const STATUS = /^(proposed|accepted|rejected|deprecated|superseded)\b/;
const NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const problems: string[] = [];

if (!existsSync(dir)) {
  console.log('No docs/adr directory yet: nothing to lint.');
  process.exit(0);
}

const records = readdirSync(dir).filter((file) => file.endsWith('.md') && file !== 'README.md');
const numbers = new Map<string, string>();

for (const file of records) {
  const match = NAME.exec(file);
  if (!match) {
    problems.push(`${file}: name must look like 0001-short-title.md`);
    continue;
  }
  const number = match[1] as string;
  const earlier = numbers.get(number);
  if (earlier) problems.push(`${file}: number ${number} is already used by ${earlier}`);
  numbers.set(number, file);

  const text = readFileSync(join(dir, file), 'utf8');
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!front) {
    problems.push(`${file}: missing YAML front matter (--- status and date ---)`);
    continue;
  }
  const fields = new Map<string, string>();
  for (const line of (front[1] as string).split(/\r?\n/)) {
    const field = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (field)
      fields.set(field[1] as string, (field[2] as string).replace(/^["']|["']$/g, '').trim());
  }

  const template = file === '0000-template.md';
  const status = fields.get('status') ?? '';
  if (!template && !STATUS.test(status)) {
    problems.push(
      `${file}: status must start with proposed, accepted, rejected, deprecated or superseded`,
    );
  }
  const date = fields.get('date') ?? '';
  if (!template && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
    problems.push(`${file}: date must be a valid YYYY-MM-DD`);
  }
  if (!/^# \S/m.test(front[2] as string)) problems.push(`${file}: missing a "# Title" heading`);

  if (status.startsWith('superseded')) {
    const successor = /(\d{4}-[a-z0-9-]+\.md)/.exec(status)?.[1];
    if (!successor || !records.includes(successor)) {
      problems.push(
        `${file}: a superseded record must link to the existing record that replaces it`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'));
  process.exit(1);
}
console.log(`ADR lint passed: ${records.length} record(s).`);
