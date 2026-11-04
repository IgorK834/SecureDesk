// @vitest-environment jsdom
import '../../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { of, throwError, type Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaApiService, type CaptchaConfig } from './captcha-api.service';
import { CaptchaComponent } from './captcha.component';

interface Options {
  callback(token: string): void;
  'expired-callback'(): void;
  'error-callback'(): void;
  'timeout-callback'(): void;
  sitekey: string;
  action: string;
}

function fakeTurnstile() {
  let options: Options | undefined;
  const api = {
    render: vi.fn((_container: HTMLElement, value: Options) => {
      options = value;
      return 'widget-1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return { api, options: () => options as Options };
}

async function setup(
  configAnswer = of({
    provider: 'turnstile' as const,
    siteKey: 'public-site-key',
    action: 'change-password',
  }) as Observable<CaptchaConfig>,
) {
  TestBed.configureTestingModule({
    imports: [CaptchaComponent],
    providers: [{ provide: CaptchaApiService, useValue: { config: () => configAnswer } }],
  });
  const fixture = TestBed.createComponent(CaptchaComponent);
  fixture.componentRef.setInput('purpose', 'change-password');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

afterEach(() => {
  delete window.turnstile;
  delete window.grecaptcha;
  document.querySelectorAll('script[data-securedesk-turnstile]').forEach((node) => node.remove());
  document.querySelectorAll('script[data-securedesk-recaptcha]').forEach((node) => node.remove());
});

describe('CaptchaComponent with Turnstile', () => {
  it('renders explicitly, emits a token, expires, times out, errors and resets', async () => {
    const { api, options } = fakeTurnstile();
    const { fixture, root } = await setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.tokenChange.subscribe((value) => emitted.push(value));

    expect(api.render).toHaveBeenCalledOnce();
    expect(options()).toMatchObject({
      sitekey: 'public-site-key',
      action: 'change-password',
    });

    options().callback('single-use-token');
    fixture.detectChanges();
    expect(fixture.componentInstance.token()).toStrictEqual({ token: 'single-use-token' });
    expect(root.textContent).toContain('Verification complete');

    options()['expired-callback']();
    fixture.detectChanges();
    expect(fixture.componentInstance.token()).toBeNull();
    expect(root.textContent).toContain('expired');

    options()['timeout-callback']();
    fixture.detectChanges();
    expect(root.textContent).toContain('timed out');

    options()['error-callback']();
    fixture.detectChanges();
    expect(root.textContent).toContain('Retry verification');

    fixture.componentInstance.reset();
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(emitted.at(-1)).toBeNull();

    fixture.destroy();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('renders the internal child, forwards its proof and obtains a new challenge on reset', async () => {
    let sequence = 0;
    const challenge = vi.fn(() =>
      of({
        challengeId: `challenge-${++sequence}`,
        image: 'data:image/svg+xml;base64,PHN2Zy8+',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        instruction: 'Type the characters in reverse order',
      }),
    );
    TestBed.configureTestingModule({
      imports: [CaptchaComponent],
      providers: [
        {
          provide: CaptchaApiService,
          useValue: {
            config: () => of({ provider: 'internal', action: 'login' }),
            challenge,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CaptchaComponent);
    fixture.componentRef.setInput('purpose', 'login');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '#captcha-answer',
    ) as HTMLInputElement;
    input.value = 'TEST-SOLVED';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.token()).toEqual({
      challengeId: 'challenge-1',
      answer: 'TEST-SOLVED',
    });

    fixture.componentInstance.reset();
    fixture.detectChanges();
    expect(challenge).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.token()).toBeNull();
  });

  it('renders reCAPTCHA through the same proof and reset contract', async () => {
    const execute = vi.fn(async () => 'recaptcha-token');
    window.grecaptcha = { ready: (callback) => callback(), execute };
    const { fixture, root } = await setup(
      of({ provider: 'recaptcha' as const, siteKey: 'public', action: 'change_password' }),
    );
    await Promise.resolve();
    fixture.detectChanges();

    expect(root.textContent).toContain('Verification complete');
    expect(fixture.componentInstance.token()).toEqual({ token: 'recaptcha-token' });
    expect(execute).toHaveBeenCalledWith('public', { action: 'change_password' });
    fixture.componentInstance.reset();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('shows a retry control when the external script is blocked', async () => {
    const { fixture, root } = await setup();
    const script = document.querySelector<HTMLScriptElement>('script[data-securedesk-turnstile]');
    expect(script?.src).toContain('challenges.cloudflare.com/turnstile/v0/api.js');

    script?.dispatchEvent(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.token()).toBeNull();
    expect(root.textContent).toContain('could not load');
    expect(root.textContent).toContain('Retry verification');

    (root.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const retried = document.querySelector<HTMLScriptElement>('script[data-securedesk-turnstile]');
    expect(retried).not.toBe(script);
    retried?.dispatchEvent(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();
  });

  it('reuses an already injected script', async () => {
    const existing = document.createElement('script');
    existing.dataset['securedeskTurnstile'] = '';
    document.head.append(existing);
    const pending = setup();
    const { api } = fakeTurnstile();
    existing.dispatchEvent(new Event('load'));
    const loaded = await pending;
    await Promise.resolve();
    loaded.fixture.detectChanges();
    expect(api.render).toHaveBeenCalledOnce();
  });

  it('fails closed when the server returns no public site key', async () => {
    const { api } = fakeTurnstile();
    const missingKey = await setup(
      of({ provider: 'turnstile' as const, action: 'change-password' }),
    );
    expect(missingKey.root.textContent).toContain('could not load');
    expect(missingKey.fixture.componentInstance.token()).toBeNull();
    expect(api.render).not.toHaveBeenCalled();
  });

  it('retries config loading without producing a proof', async () => {
    const config = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of({ provider: 'internal', action: 'change-password' }));
    TestBed.configureTestingModule({
      imports: [CaptchaComponent],
      providers: [
        {
          provide: CaptchaApiService,
          useValue: {
            config,
            challenge: () =>
              of({
                challengeId: 'challenge-1',
                image: 'data:image/svg+xml;base64,PHN2Zy8+',
                expiresAt: new Date(Date.now() + 120_000).toISOString(),
                instruction: 'Type the characters in reverse order',
              }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CaptchaComponent);
    fixture.componentRef.setInput('purpose', 'change-password');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('settings could not be loaded');

    (root.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(config).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.token()).toBeNull();
  });

  it('reselects the provider after an outage so the server can activate internal fallback', async () => {
    const config = vi
      .fn()
      .mockReturnValueOnce(
        of({ provider: 'turnstile', siteKey: 'public-site-key', action: 'change-password' }),
      )
      .mockReturnValueOnce(of({ provider: 'internal', action: 'change-password' }));
    const challenge = vi.fn(() =>
      of({
        challengeId: 'fallback-challenge',
        image: 'data:image/svg+xml;base64,PHN2Zy8+',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        instruction: 'Type the characters in reverse order',
      }),
    );
    const { api } = fakeTurnstile();
    TestBed.configureTestingModule({
      imports: [CaptchaComponent],
      providers: [{ provide: CaptchaApiService, useValue: { config, challenge } }],
    });
    const fixture = TestBed.createComponent(CaptchaComponent);
    fixture.componentRef.setInput('purpose', 'change-password');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.render).toHaveBeenCalledOnce();

    fixture.componentInstance.reset(true);
    fixture.detectChanges();

    expect(config).toHaveBeenCalledTimes(2);
    expect(challenge).toHaveBeenCalledWith('change-password');
    expect((fixture.nativeElement as HTMLElement).querySelector('#captcha-answer')).not.toBeNull();
  });
});
