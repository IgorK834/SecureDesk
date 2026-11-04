// @vitest-environment jsdom
import '../../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecaptchaCaptchaComponent } from './recaptcha-captcha.component';

const config = { provider: 'recaptcha' as const, siteKey: 'site-key', action: 'change_password' };

function setup() {
  TestBed.configureTestingModule({ imports: [RecaptchaCaptchaComponent] });
  const fixture = TestBed.createComponent(RecaptchaCaptchaComponent);
  fixture.componentRef.setInput('config', config);
  const emitted: (string | null)[] = [];
  fixture.componentInstance.tokenChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  return { emitted, fixture, root: fixture.nativeElement as HTMLElement };
}

afterEach(() => {
  vi.useRealTimers();
  delete window.grecaptcha;
  document.querySelectorAll('script[data-securedesk-recaptcha]').forEach((node) => node.remove());
});

describe('RecaptchaCaptchaComponent', () => {
  it('executes the configured action, refreshes on expiry and resets on demand', async () => {
    vi.useFakeTimers();
    const execute = vi.fn(async () => `token-${execute.mock.calls.length}`);
    window.grecaptcha = { ready: (callback) => callback(), execute };
    const { emitted, fixture, root } = setup();
    for (let count = 0; count < 5; count++) await Promise.resolve();
    fixture.detectChanges();

    expect(execute).toHaveBeenCalledWith('site-key', { action: 'change_password' });
    expect(emitted.at(-1)).toBe('token-1');
    expect(root.textContent).toContain('Verification complete');

    vi.advanceTimersByTime(120_000);
    for (let count = 0; count < 5; count++) await Promise.resolve();
    fixture.detectChanges();
    expect(emitted).toContain(null);
    expect(execute).toHaveBeenCalledTimes(2);

    fixture.componentInstance.reset();
    for (let count = 0; count < 5; count++) await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(3);
    fixture.destroy();
  });

  it('shows retry when the Google script is blocked and never emits a proof', async () => {
    const { emitted, fixture, root } = setup();
    const script = document.querySelector<HTMLScriptElement>('script[data-securedesk-recaptcha]');
    expect(script?.src).toContain('www.google.com/recaptcha/api.js');
    expect(script?.src).toContain('render=site-key');

    script?.dispatchEvent(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.textContent).toContain('could not load');
    expect(root.querySelector('button')?.textContent).toContain('Retry verification');
    expect(emitted.at(-1)).toBeNull();
  });

  it('fails closed without a site key', () => {
    TestBed.configureTestingModule({ imports: [RecaptchaCaptchaComponent] });
    const fixture = TestBed.createComponent(RecaptchaCaptchaComponent);
    fixture.componentRef.setInput('config', { provider: 'recaptcha', action: 'change-password' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('could not load');
  });
});
