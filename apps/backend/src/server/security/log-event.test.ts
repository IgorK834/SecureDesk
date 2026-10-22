import { afterEach, describe, expect, it } from 'vitest';
import { captureOutput } from '../__fixtures__/capture-output';
import { logEvent } from './log-event';

describe('logEvent', () => {
  let output: ReturnType<typeof captureOutput>;
  afterEach(() => output.restore());

  it('writes one JSON line holding the event name and the request id, and nothing else', () => {
    output = captureOutput();

    logEvent('auth.login.failure', 'req-123');

    const lines = output.lines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toStrictEqual({
      event: 'auth.login.failure',
      requestId: 'req-123',
    });
  });
});
