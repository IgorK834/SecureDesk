import { describe, expect, it } from 'vitest';
import {
  AccountLockedError,
  ApiError,
  CaptchaFailedError,
  CaptchaRequiredError,
  CaptchaUnavailableError,
  ConflictError,
  ForbiddenError,
  IpBlockedError,
  NotFoundError,
  PasswordChangeLockedError,
  PasswordChangeRequiredError,
  UnauthorizedError,
  ValidationError,
  errorResponse,
} from './errors';

describe('errorResponse', () => {
  it('uses the standard error shape and is never cacheable', async () => {
    const response = errorResponse(403, 'SOME_CODE', 'Komunikat');

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: { code: 'SOME_CODE', message: 'Komunikat' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('adds extra headers without losing no-store', () => {
    const response = errorResponse(429, 'C', 'm', { 'Retry-After': '30' });

    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('adds `details` to the error only when there are some', async () => {
    const response = errorResponse(400, 'C', 'm', undefined, { violations: ['TOO_SHORT'] });

    expect(await response.json()).toStrictEqual({
      error: { code: 'C', message: 'm', details: { violations: ['TOO_SHORT'] } },
    });
  });
});

describe('ApiError', () => {
  it('carries the status, code and message and is recognisable as an Error', () => {
    const error = new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');

    expect(error).toBeInstanceOf(Error);
    expect([error.status, error.code, error.message, error.name]).toStrictEqual([
      403,
      'AUTH_FORBIDDEN',
      'Brak uprawnień',
      'ApiError',
    ]);
  });

  it('carries optional response headers independently of fixed details', () => {
    const error = new ApiError(
      429,
      'LIMIT',
      'wait',
      { retryAfterSeconds: 30 },
      {
        'Retry-After': '30',
      },
    );

    expect(error.details).toStrictEqual({ retryAfterSeconds: 30 });
    expect(error.headers).toStrictEqual({ 'Retry-After': '30' });
  });
});

// The status/code pairs are the API contract the Angular client branches on, so each is pinned.
describe('the named refusals', () => {
  it.each([
    ['UnauthorizedError', new UnauthorizedError(), 401, 'AUTH_REQUIRED', 'Wymagane zalogowanie'],
    ['ForbiddenError', new ForbiddenError(), 403, 'AUTH_FORBIDDEN', 'Brak uprawnień'],
    [
      'PasswordChangeRequiredError',
      new PasswordChangeRequiredError(),
      403,
      'AUTH_PASSWORD_CHANGE_REQUIRED',
      'Wymagana zmiana hasła',
    ],
    [
      'ValidationError',
      new ValidationError(),
      400,
      'VALIDATION_ERROR',
      'Nieprawidłowe dane żądania',
    ],
    ['ConflictError', new ConflictError(), 409, 'CONFLICT', 'Zasób już istnieje'],
    ['NotFoundError', new NotFoundError(), 404, 'NOT_FOUND', 'Nie znaleziono zasobu'],
    [
      'AccountLockedError',
      new AccountLockedError(new Date('2026-03-10T12:15:00.000Z'), 900),
      429,
      'AUTH_ACCOUNT_LOCKED',
      'Konto jest tymczasowo zablokowane po zbyt wielu nieudanych próbach logowania',
    ],
    [
      'IpBlockedError',
      new IpBlockedError(30),
      429,
      'AUTH_IP_BLOCKED',
      'Zbyt wiele nieudanych prób logowania z tego adresu. Spróbuj ponownie później',
    ],
    [
      'PasswordChangeLockedError',
      new PasswordChangeLockedError(new Date('2026-03-10T12:15:00.000Z'), 900),
      429,
      'AUTH_PASSWORD_CHANGE_LOCKED',
      'Zmiana hasła jest tymczasowo zablokowana po zbyt wielu nieudanych próbach',
    ],
    [
      'CaptchaRequiredError',
      new CaptchaRequiredError(),
      400,
      'CAPTCHA_REQUIRED',
      'Wymagane potwierdzenie CAPTCHA',
    ],
    [
      'CaptchaFailedError',
      new CaptchaFailedError(),
      403,
      'CAPTCHA_FAILED',
      'Nie udało się zweryfikować CAPTCHA',
    ],
    [
      'CaptchaUnavailableError',
      new CaptchaUnavailableError(),
      503,
      'CAPTCHA_UNAVAILABLE',
      'Weryfikacja CAPTCHA jest chwilowo niedostępna',
    ],
  ])('%s maps to its status, code and message', (_, error, status, code, message) => {
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code, error.message]).toStrictEqual([status, code, message]);
  });

  it('keeps 401 and the two 403s apart, so a client can tell "sign in" from "not allowed"', () => {
    expect(new UnauthorizedError().status).not.toBe(new ForbiddenError().status);
    expect(new ForbiddenError().code).not.toBe(new PasswordChangeRequiredError().code);
  });

  it('lets ValidationError carry fixed field codes and nothing else', () => {
    const error = new ValidationError({
      fieldErrors: { confirmNewPassword: 'PASSWORDS_DO_NOT_MATCH' },
    });

    expect(error.details).toStrictEqual({
      fieldErrors: { confirmNewPassword: 'PASSWORDS_DO_NOT_MATCH' },
    });
    expect(new ValidationError().details).toBeUndefined();
  });

  // Whether a ticket is missing or merely not yours must be indistinguishable (object-access policy).
  it('gives NotFoundError one fixed body, so "missing" and "not allowed to know" look the same', () => {
    expect(JSON.stringify(new NotFoundError())).toBe(JSON.stringify(new NotFoundError()));
    expect(new NotFoundError().message).toBe('Nie znaleziono zasobu');
  });
});
