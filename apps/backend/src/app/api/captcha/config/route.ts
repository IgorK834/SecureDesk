import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError } from '../../../../server/http/errors';
import { defineRoute } from '../../../../server/http/route-handler';
import { assertCaptchaConfig, getCaptchaProvider } from '../../../../server/security/captcha';
import { SlidingWindowRateLimiter, getClientIp } from '../../../../server/security/rate-limiter';
import { clock } from '../../../../server/time/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({ purpose: z.enum(['login', 'change-password']) }).strict();
const limiter = new SlidingWindowRateLimiter(clock);

export function clearCaptchaConfigRateLimitForTests(): void {
  limiter.clear();
}

// Public by design: a form needs to learn which widget the server selected before it can submit.
export const GET = defineRoute({
  name: 'captcha.config',
  auth: 'public',
  query: Query,
  handler: ({ request, query }) => {
    const decision = limiter.consume(getClientIp(request), 60, 60_000);
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
    const provider = getCaptchaProvider(query.purpose, process.env, undefined, clock.now());
    return NextResponse.json(provider.publicConfig(query.purpose), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
});
