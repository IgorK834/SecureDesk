import { RequestBudget } from './request-budget.ts';
import type { HttpEvidence } from './types.ts';

interface ApiErrorBody {
  error?: { code?: string };
}

export interface InternalCaptchaProof {
  challengeId: string;
  answer: string;
}

export interface BotHttp {
  request(path: string, init: RequestInit, forwardedFor: string): Promise<HttpEvidence>;
  challenge(forwardedFor: string): Promise<InternalCaptchaProof>;
  login(forwardedFor: string, body: Record<string, unknown>, label: string): Promise<HttpEvidence>;
}

export class BotHttpClient implements BotHttp {
  private readonly target: URL;
  private readonly origin: string;
  private readonly budget: RequestBudget;
  private readonly fetchImpl: typeof fetch;

  constructor(target: URL, origin: string, budget: RequestBudget, fetchImpl: typeof fetch = fetch) {
    this.target = target;
    this.origin = origin;
    this.budget = budget;
    this.fetchImpl = fetchImpl;
  }

  async request(pathname: string, init: RequestInit, forwardedFor: string): Promise<HttpEvidence> {
    await this.budget.claim();
    const response = await this.fetchImpl(new URL(pathname, this.target), {
      ...init,
      headers: {
        'content-type': 'application/json',
        origin: this.origin,
        'user-agent': 'SecureDesk-Bot-Sim/1.0',
        'x-forwarded-for': forwardedFor,
        ...init.headers,
      },
      redirect: 'error',
    });
    let code: string | undefined;
    try {
      code = ((await response.clone().json()) as ApiErrorBody).error?.code;
    } catch {
      // A successful decoy response is not an error envelope.
    }
    return { label: pathname, status: response.status, ...(code && { code }) };
  }

  async challenge(forwardedFor: string): Promise<InternalCaptchaProof> {
    await this.budget.claim();
    const response = await this.fetchImpl(new URL('/api/captcha/challenge', this.target), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: this.origin,
        'user-agent': 'SecureDesk-Bot-Sim/1.0',
        'x-forwarded-for': forwardedFor,
      },
      body: JSON.stringify({ purpose: 'login' }),
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Could not issue internal CAPTCHA: HTTP ${response.status}.`);
    }
    const body = (await response.json()) as { challengeId?: unknown };
    if (typeof body.challengeId !== 'string') {
      throw new Error('The internal CAPTCHA response has no challengeId.');
    }
    return { challengeId: body.challengeId, answer: 'TEST-SOLVED' };
  }

  async login(
    forwardedFor: string,
    body: Record<string, unknown>,
    label: string,
  ): Promise<HttpEvidence> {
    const evidence = await this.request(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(body) },
      forwardedFor,
    );
    return { ...evidence, label };
  }
}
