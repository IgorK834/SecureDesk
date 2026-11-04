import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gt, isNull, lte } from 'drizzle-orm';
import * as opentype from 'opentype.js';
import type { AppDb } from '../../db/connection';
import { captchaChallenges } from '../../db/schema';
import { ATKINSON_HYPERLEGIBLE_BOLD_LATIN_WOFF_BASE64 } from './atkinson-hyperlegible-font';
import type {
  CaptchaFailure,
  CaptchaProvider,
  CaptchaPurpose,
  CaptchaVerificationResult,
} from './provider';

export const INTERNAL_CAPTCHA_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INTERNAL_CAPTCHA_LENGTH = 6;
export const INTERNAL_CAPTCHA_TTL_MS = 120_000;
export const INTERNAL_CAPTCHA_GLOBAL_CAP = 1_000;
export const INTERNAL_CAPTCHA_INSTRUCTION = 'Type the characters in reverse order';

type Env = Readonly<Record<string, string | undefined>>;

export interface InternalCaptchaPublicChallenge {
  challengeId: string;
  image: string;
  expiresAt: string;
  instruction: string;
}

export class InternalCaptchaCapacityError extends Error {
  constructor() {
    super('Too many unconsumed internal CAPTCHA challenges.');
    this.name = 'InternalCaptchaCapacityError';
  }
}

let cachedFont: opentype.Font | undefined;

function font(): opentype.Font {
  if (cachedFont) return cachedFont;
  const bytes = Buffer.from(ATKINSON_HYPERLEGIBLE_BOLD_LATIN_WOFF_BASE64, 'base64');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  cachedFont = opentype.parse(buffer);
  return cachedFont;
}

function randomChallenge(): string {
  let value: string;
  do {
    value = Array.from(
      { length: INTERNAL_CAPTCHA_LENGTH },
      () => INTERNAL_CAPTCHA_ALPHABET[randomInt(INTERNAL_CAPTCHA_ALPHABET.length)] as string,
    ).join('');
  } while (value === [...value].reverse().join(''));
  return value;
}

function answerMac(secret: string, challengeId: string, answer: string): Buffer {
  return createHmac('sha256', secret)
    .update(challengeId + answer)
    .digest();
}

function renderImage(challenge: string): string {
  const face = font();
  const glyphs = [...challenge].map((glyph, index) => {
    const x = 22 + index * 34;
    const y = 57 + randomInt(-5, 6);
    const rotation = randomInt(-18, 19);
    const path = face.getPath(glyph, x, y, 45).toPathData(1);
    return `<g transform="rotate(${rotation} ${x + 15} 40)"><path d="${path}"/></g>`;
  });
  const noise = Array.from({ length: 5 }, () => {
    const startY = randomInt(8, 73);
    const endY = randomInt(8, 73);
    const middleY = randomInt(8, 73);
    return `<path d="M 4 ${startY} Q 120 ${middleY} 236 ${endY}" fill="none"/>`;
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">` +
    `<rect width="240" height="80" rx="8" fill="#f3f5f7"/>` +
    `<g fill="#16202a" stroke="#16202a" stroke-width="1.2">${glyphs.join('')}</g>` +
    `<g stroke="#607080" stroke-width="1.5" opacity="0.55">${noise.join('')}</g>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function normalizedAnswer(input: unknown): { challengeId: string; answer: string } | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const { challengeId, answer } = input as { challengeId?: unknown; answer?: unknown };
  if (typeof challengeId !== 'string' || !challengeId || typeof answer !== 'string' || !answer) {
    return undefined;
  }
  return { challengeId, answer: answer.trim().toUpperCase() };
}

export interface IssuedInternalChallenge {
  publicChallenge: InternalCaptchaPublicChallenge;
  /** Test-only in-process evidence; callers serving HTTP must discard it. */
  expectedAnswer: string;
  source: string;
}

/** Issues and stores one challenge; plaintext exists only in this stack frame and the test result. */
export function issueInternalChallenge(
  db: AppDb,
  input: { purpose: CaptchaPurpose; ipKey: string; now: Date },
  env: Env = process.env,
): IssuedInternalChallenge {
  const secret = env.CAPTCHA_HMAC_SECRET?.trim();
  if (!secret) throw new Error('CAPTCHA_HMAC_SECRET is not configured.');

  const challengeId = randomUUID();
  const source = randomChallenge();
  const expectedAnswer = [...source].reverse().join('');
  const expiresAt = new Date(input.now.getTime() + INTERNAL_CAPTCHA_TTL_MS);
  const mac = answerMac(secret, challengeId, expectedAnswer).toString('hex');

  db.transaction(
    (tx) => {
      tx.delete(captchaChallenges).where(lte(captchaChallenges.expiresAt, input.now)).run();
      const active = tx
        .select({ total: count() })
        .from(captchaChallenges)
        .where(
          and(isNull(captchaChallenges.consumedAt), gt(captchaChallenges.expiresAt, input.now)),
        )
        .get()?.total;
      if ((active ?? 0) >= INTERNAL_CAPTCHA_GLOBAL_CAP) throw new InternalCaptchaCapacityError();

      tx.insert(captchaChallenges)
        .values({
          id: challengeId,
          purpose: input.purpose,
          answerMac: mac,
          createdAt: input.now,
          expiresAt,
          ipKey: input.ipKey,
        })
        .run();
    },
    { behavior: 'immediate' },
  );

  return {
    publicChallenge: {
      challengeId,
      image: renderImage(source),
      expiresAt: expiresAt.toISOString(),
      instruction: INTERNAL_CAPTCHA_INSTRUCTION,
    },
    expectedAnswer,
    source,
  };
}

export class InternalCaptchaProvider implements CaptchaProvider {
  readonly id = 'internal' as const;

  constructor(
    private readonly db: AppDb,
    private readonly env: Env = process.env,
  ) {}

  publicConfig(purpose: CaptchaPurpose) {
    return { provider: this.id, action: purpose };
  }

  async verify(
    input: unknown,
    ctx: { purpose: CaptchaPurpose; ipKey: string; now: Date },
  ): Promise<CaptchaVerificationResult> {
    const supplied = normalizedAnswer(input);
    if (!supplied) return { ok: false, reason: 'MISSING' };

    const consumed = this.db
      .update(captchaChallenges)
      .set({ consumedAt: ctx.now })
      .where(
        and(
          eq(captchaChallenges.id, supplied.challengeId),
          eq(captchaChallenges.purpose, ctx.purpose),
          eq(captchaChallenges.ipKey, ctx.ipKey),
          isNull(captchaChallenges.consumedAt),
          gt(captchaChallenges.expiresAt, ctx.now),
        ),
      )
      .run();

    if (consumed.changes === 0) {
      const row = this.db
        .select()
        .from(captchaChallenges)
        .where(eq(captchaChallenges.id, supplied.challengeId))
        .get();
      let reason: CaptchaFailure = 'INVALID';
      if (row?.consumedAt) reason = 'DUPLICATE';
      else if (row && row.expiresAt <= ctx.now) reason = 'EXPIRED';
      return { ok: false, reason };
    }

    if (this.env.CAPTCHA_TEST_MODE === 'true' && supplied.answer === 'TEST-SOLVED') {
      return { ok: true };
    }
    const secret = this.env.CAPTCHA_HMAC_SECRET?.trim();
    if (!secret) return { ok: false, reason: 'UNAVAILABLE' };
    const expected = this.db
      .select({ answerMac: captchaChallenges.answerMac })
      .from(captchaChallenges)
      .where(eq(captchaChallenges.id, supplied.challengeId))
      .get();
    if (!expected) return { ok: false, reason: 'INVALID' };

    const candidate = answerMac(secret, supplied.challengeId, supplied.answer);
    const stored = Buffer.from(expected.answerMac, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored)
      ? { ok: true }
      : { ok: false, reason: 'INVALID' };
  }
}
