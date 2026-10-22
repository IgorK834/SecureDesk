// Test helper (excluded from coverage, see __fixtures__): records everything the code under test
// writes through console.* or directly to stdout/stderr, so a test can prove a secret never
// reached any log output.
import { vi } from 'vitest';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

export interface CapturedOutput {
  /** Everything written so far, one entry per call, arguments joined by a space. */
  lines(): string[];
  restore(): void;
}

export function captureOutput(): CapturedOutput {
  const lines: string[] = [];
  const spies = [
    ...CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      }),
    ),
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }),
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }),
  ];
  return {
    lines: () => [...lines],
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
