import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../../server/db/client';
import { ApiError } from '../../../../server/http/errors';
import { defineRoute } from '../../../../server/http/route-handler';
import { assertCaptchaConfig, getCaptchaProvider } from '../../../../server/security/captcha';
import {
  InternalCaptchaCapacityError,
  issueInternalChallenge,
} from '../../../../server/security/captcha/internal';
import { SlidingWindowRateLimiter, getClientIp } from '../../../../server/security/rate-limiter';
import { clock } from '../../../../server/time/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ purpose: z.enum(['login', 'change-password']) }).strict();
const limiter = new SlidingWindowRateLimiter(clock);

export function clearCaptchaChallengeRateLimitForTests(): void {
  limiter.clear();
}

export const POST = defineRoute({
  name: 'captcha.challenge',
  auth: 'public',
  body: Body,
  handler: ({ request, body }) => {
    const ipKey = getClientIp(request);
    const decision = limiter.consume(ipKey, 20, 60_000);
    if (!decision.allowed) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Zbyt wiele żądań. Spróbuj ponownie później',
        undefined,
        { 'Retry-After': String(decision.retryAfterSeconds) },
      );
    }

    assertCaptchaConfig();
    const now = clock.now();
    if (getCaptchaProvider(body.purpose, process.env, db, now).id !== 'internal') {
      throw new ApiError(409, 'CAPTCHA_PROVIDER_MISMATCH', 'Wybrany dostawca nie wydaje wyzwań');
    }
    try {
      const { publicChallenge } = issueInternalChallenge(db, {
        purpose: body.purpose,
        ipKey,
        now,
      });
      return NextResponse.json(publicChallenge, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof InternalCaptchaCapacityError) {
        throw new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele żądań. Spróbuj ponownie później');
      }
      throw error;
    }
  },
});
