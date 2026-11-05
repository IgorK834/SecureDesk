import { describe, expect, it, vi } from 'vitest';
import type { ScenarioStore } from '../scripts/bot-sim/database.ts';
import { runScenarios } from '../scripts/bot-sim/runner.ts';

describe('bot simulator scenario runner', () => {
  it('resets before every scenario and attaches the events observed after it', async () => {
    const reset = vi.fn();
    const close = vi.fn();
    const eventTypes = vi
      .fn<ScenarioStore['eventTypes']>()
      .mockReturnValueOnce(['CAPTCHA_FAILED'])
      .mockReturnValueOnce(['HONEYTOKEN_TRIGGERED']);
    const store: ScenarioStore = { reset, close, eventTypes };

    const results = await runScenarios(
      [
        {
          id: '1',
          name: 'missing proof',
          execute: async () => [{ label: 'attempt', status: 400, code: 'CAPTCHA_REQUIRED' }],
        },
        {
          id: '2',
          name: 'trap',
          execute: async () => [{ label: 'attempt', status: 401 }],
        },
      ],
      store,
    );

    expect(reset).toHaveBeenCalledTimes(2);
    expect(eventTypes).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({
      events: ['CAPTCHA_FAILED'],
      protections: { captcha: true },
    });
    expect(results[1]).toMatchObject({
      events: ['HONEYTOKEN_TRIGGERED'],
      protections: { honeytoken: true },
    });
    expect(close).not.toHaveBeenCalled();
  });
});
