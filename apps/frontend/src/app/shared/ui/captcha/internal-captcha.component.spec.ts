// @vitest-environment jsdom
import '../../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaApiService, type InternalCaptchaChallenge } from './captcha-api.service';
import { InternalCaptchaComponent } from './internal-captcha.component';

const T0 = new Date('2026-11-04T12:00:00.000Z');

function challenge(id: string): InternalCaptchaChallenge {
  return {
    challengeId: id,
    image: 'data:image/svg+xml;base64,PHN2Zz48cGF0aCBkPSJNIDAgMCIvPjwvc3ZnPg==',
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    instruction: 'Type the characters in reverse order',
  };
}

function setup(challengeCall = vi.fn(() => of(challenge('challenge-1')))) {
  TestBed.configureTestingModule({
    imports: [InternalCaptchaComponent],
    providers: [{ provide: CaptchaApiService, useValue: { challenge: challengeCall } }],
  });
  const fixture = TestBed.createComponent(InternalCaptchaComponent);
  fixture.componentRef.setInput('purpose', 'login');
  const emitted: unknown[] = [];
  fixture.componentInstance.tokenChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  return { challengeCall, emitted, fixture, root: fixture.nativeElement as HTMLElement };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('InternalCaptchaComponent', () => {
  it('loads an accessible challenge and emits the typed proof', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const { challengeCall, emitted, fixture, root } = setup();

    expect(challengeCall).toHaveBeenCalledWith('login');
    expect(root.querySelector('img')?.getAttribute('aria-describedby')).toBe('captcha-instruction');
    expect(root.querySelector('label')?.getAttribute('for')).toBe('captcha-answer');
    const input = root.querySelector('#captcha-answer') as HTMLInputElement;
    const newChallenge = root.querySelector('button') as HTMLButtonElement;
    expect(input.tabIndex).toBe(0);
    expect(newChallenge.type).toBe('button');
    expect(newChallenge.tabIndex).toBe(0);
    input.focus();
    expect(document.activeElement).toBe(input);
    newChallenge.focus();
    expect(document.activeElement).toBe(newChallenge);
    input.value = 'zyx321';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(emitted.at(-1)).toEqual({ challengeId: 'challenge-1', answer: 'zyx321' });

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emitted.at(-1)).toBeNull();
  });

  it('clears an expired proof and requests a fresh challenge automatically', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    let sequence = 0;
    const challengeCall = vi.fn(() => of(challenge(`challenge-${++sequence}`)));
    const { emitted, fixture, root } = setup(challengeCall);
    const input = root.querySelector('#captcha-answer') as HTMLInputElement;
    input.value = 'ABC123';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emitted.at(-1)).toEqual({ challengeId: 'challenge-1', answer: 'ABC123' });

    vi.advanceTimersByTime(120_000);
    fixture.detectChanges();

    expect(challengeCall).toHaveBeenCalledTimes(2);
    expect(emitted.at(-1)).toBeNull();
    expect((root.querySelector('#captcha-answer') as HTMLInputElement).value).toBe('');
  });

  it('reset burns the client proof and obtains another server challenge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    let sequence = 0;
    const challengeCall = vi.fn(() => of(challenge(`challenge-${++sequence}`)));
    const { emitted, fixture } = setup(challengeCall);

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(challengeCall).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.challenge()?.challengeId).toBe('challenge-2');
    expect(emitted.at(-1)).toBeNull();
  });

  it('shows a keyboard-operable retry after a load failure and clears its timer on destroy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const challengeCall = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(challenge('challenge-2')));
    const { fixture, root } = setup(challengeCall);

    expect(root.textContent).toContain('could not load');
    const retry = root.querySelector('button') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(challengeCall).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.challenge()?.challengeId).toBe('challenge-2');

    fixture.destroy();
    vi.advanceTimersByTime(120_000);
    expect(challengeCall).toHaveBeenCalledTimes(2);
  });

  it('fails closed on an invalid expiry and ignores a superseded response', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const first = new Subject<InternalCaptchaChallenge>();
    const challengeCall = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(of({ ...challenge('bad-expiry'), expiresAt: 'not-a-date' }));
    const { fixture, root } = setup(challengeCall);

    fixture.componentInstance.reset();
    first.next(challenge('stale'));
    fixture.detectChanges();

    expect(fixture.componentInstance.challenge()).toBeNull();
    expect(root.textContent).toContain('could not load');
  });
});
