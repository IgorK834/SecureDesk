// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TotpSettingsComponent } from './totp-settings.component';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,qr')) },
}));

function setup(enabled = false) {
  const status = signal(enabled);
  const api = {
    enrollTotp: vi.fn(() => of({ otpauthUri: 'otpauth://totp/SecureDesk:test?secret=TEST' })),
    verifyTotpEnrollment: vi.fn(() => of(undefined)),
    disableTotp: vi.fn(() => of(undefined)),
  };
  const auth = {
    totpEnabled: status,
    setTotpEnabled: vi.fn((value: boolean) => status.set(value)),
  };
  TestBed.configureTestingModule({
    imports: [TotpSettingsComponent],
    providers: [
      { provide: AuthApiService, useValue: api },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(TotpSettingsComponent);
  fixture.detectChanges();
  return { fixture, api, auth };
}

afterEach(() => vi.restoreAllMocks());

describe('TotpSettingsComponent', () => {
  it('renders an enrollment QR from the one-time URI and confirms a six-digit code', async () => {
    const { fixture, api, auth } = setup();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'otpauth://totp/SecureDesk:test?secret=TEST',
      expect.any(Object),
    );
    expect((fixture.nativeElement.querySelector('img') as HTMLImageElement).src).toContain(
      'data:image/png;base64,qr',
    );

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(api.verifyTotpEnrollment).toHaveBeenCalledWith({ code: '123456' });
    expect(auth.setTotpEnabled).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('uses a masked current-password field and clears both inputs after disable', () => {
    const { fixture, api, auth } = setup(true);
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    expect(inputs[0]?.type).toBe('password');
    inputs[0]!.value = 'current private value';
    inputs[0]!.dispatchEvent(new Event('input'));
    inputs[1]!.value = '654321';
    inputs[1]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(api.disableTotp).toHaveBeenCalledWith({
      currentPassword: 'current private value',
      code: '654321',
    });
    expect(auth.setTotpEnabled).toHaveBeenCalledWith(false);
    expect([...inputs].map((input) => input.value)).toStrictEqual(['', '']);
  });

  it('clears the QR and form values when destroyed', async () => {
    const { fixture } = setup();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));

    fixture.destroy();

    expect(fixture.componentInstance.confirmForm.getRawValue().code).toBe('');
  });

  it('shows a safe error and clears the code when enrollment confirmation fails', async () => {
    const { fixture, api } = setup();
    api.verifyTotpEnrollment.mockReturnValueOnce(throwError(() => ({ status: 400 })));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain(
      'The authentication code is invalid or has expired.',
    );
  });

  it('distinguishes an incorrect current password while disabling', () => {
    const { fixture, api } = setup(true);
    api.disableTotp.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { error: { code: 'CURRENT_PASSWORD_INCORRECT' } },
          }),
      ),
    );
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    inputs[0]!.value = 'incorrect value';
    inputs[0]!.dispatchEvent(new Event('input'));
    inputs[1]!.value = '654321';
    inputs[1]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The current password is incorrect.');
    expect([...inputs].map((input) => input.value)).toStrictEqual(['', '']);
  });

  it('handles enrollment and QR rendering failures without retaining the URI', async () => {
    const { fixture, api } = setup();
    api.enrollTotp.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Could not start two-factor authentication setup.',
    );

    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('render failed'));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not render the enrollment QR code.');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('cancels enrollment and refuses invalid direct submissions', async () => {
    const { fixture, api } = setup();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    [...buttons].find((button) => button.textContent?.trim() === 'Cancel')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();

    const component = fixture.componentInstance as unknown as {
      confirmEnrollment(): void;
      disable(): void;
    };
    component.confirmEnrollment();
    component.disable();
    expect(api.verifyTotpEnrollment).not.toHaveBeenCalled();
    expect(api.disableTotp).not.toHaveBeenCalled();
  });
});
