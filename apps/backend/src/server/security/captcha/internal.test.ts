import { describe, expect, it } from 'vitest';
import { createMigratedDb } from '../../db/__fixtures__/test-db';
import { captchaChallenges } from '../../db/schema';
import {
  INTERNAL_CAPTCHA_INSTRUCTION,
  InternalCaptchaProvider,
  issueInternalChallenge,
} from './internal';

const T0 = new Date('2026-11-04T12:00:00.000Z');
const IP = '203.0.113.7';
const env = { CAPTCHA_HMAC_SECRET: 'unit-test-hmac-secret' };

function issue() {
  const db = createMigratedDb();
  const challenge = issueInternalChallenge(db, { purpose: 'login', ipKey: IP, now: T0 }, env);
  const provider = new InternalCaptchaProvider(db, env);
  return { db, challenge, provider };
}

const proof = (challenge: ReturnType<typeof issue>['challenge'], answer: string) => ({
  challengeId: challenge.publicChallenge.challengeId,
  answer,
});

describe('InternalCaptchaProvider', () => {
  it('stores only an HMAC and renders glyph outlines without plaintext or text nodes', () => {
    const { db, challenge } = issue();
    const svg = Buffer.from(
      challenge.publicChallenge.image.split(',')[1] ?? '',
      'base64',
    ).toString();
    const dump = JSON.stringify(db.select().from(captchaChallenges).all());

    expect(challenge.publicChallenge.instruction).toBe(INTERNAL_CAPTCHA_INSTRUCTION);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain(challenge.source);
    expect(dump).not.toContain(challenge.source);
    expect(dump).not.toContain(challenge.expectedAnswer);
    expect(db.select().from(captchaChallenges).get()?.answerMac).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts the reversed string and refuses its second use (SEC-48)', async () => {
    const { challenge, provider } = issue();
    const context = { purpose: 'login' as const, ipKey: IP, now: T0 };

    await expect(
      provider.verify(proof(challenge, challenge.expectedAnswer), context),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(
      provider.verify(proof(challenge, challenge.expectedAnswer), context),
    ).resolves.toEqual({
      ok: false,
      reason: 'DUPLICATE',
    });
  });

  it('rejects the original order and burns the challenge on that wrong first answer (SEC-46)', async () => {
    const { challenge, provider } = issue();
    const context = { purpose: 'login' as const, ipKey: IP, now: T0 };

    await expect(provider.verify(proof(challenge, challenge.source), context)).resolves.toEqual({
      ok: false,
      reason: 'INVALID',
    });
    await expect(
      provider.verify(proof(challenge, challenge.expectedAnswer), context),
    ).resolves.toEqual({
      ok: false,
      reason: 'DUPLICATE',
    });
  });

  it('passes at 119 seconds and expires at 121 seconds (SEC-47)', async () => {
    const passing = issue();
    await expect(
      passing.provider.verify(proof(passing.challenge, passing.challenge.expectedAnswer), {
        purpose: 'login',
        ipKey: IP,
        now: new Date(T0.getTime() + 119_000),
      }),
    ).resolves.toEqual({ ok: true });

    const expired = issue();
    await expect(
      expired.provider.verify(proof(expired.challenge, expired.challenge.expectedAnswer), {
        purpose: 'login',
        ipKey: IP,
        now: new Date(T0.getTime() + 121_000),
      }),
    ).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('accepts the test answer only in test mode and still enforces one-time use', async () => {
    const { db, challenge } = issue();
    const provider = new InternalCaptchaProvider(db, { ...env, CAPTCHA_TEST_MODE: 'true' });
    const context = { purpose: 'login' as const, ipKey: IP, now: T0 };

    await expect(provider.verify(proof(challenge, 'TEST-SOLVED'), context)).resolves.toEqual({
      ok: true,
    });
    await expect(provider.verify(proof(challenge, 'TEST-SOLVED'), context)).resolves.toEqual({
      ok: false,
      reason: 'DUPLICATE',
    });
  });

  it('distinguishes missing, unknown and expired proofs without accepting any', async () => {
    const { challenge, provider } = issue();
    const context = { purpose: 'login' as const, ipKey: IP, now: T0 };

    await expect(provider.verify(undefined, context)).resolves.toEqual({
      ok: false,
      reason: 'MISSING',
    });
    await expect(
      provider.verify({ challengeId: 'unknown', answer: 'ABC123' }, context),
    ).resolves.toEqual({ ok: false, reason: 'INVALID' });
    await expect(
      provider.verify(proof(challenge, challenge.expectedAnswer), {
        ...context,
        now: new Date(T0.getTime() + 121_000),
      }),
    ).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
  });
});
