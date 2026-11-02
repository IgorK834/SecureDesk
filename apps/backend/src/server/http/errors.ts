import { NextResponse } from 'next/server';

/**
 * An expected refusal: the status, machine-readable code and Polish message the client sees.
 * `details` is optional extra data for the client (for example the password rules that were
 * broken); it must hold only fixed codes, never request content or anything read from the database.
 *
 * Throw it (or a subclass) anywhere below a `defineRoute` handler; the wrapper turns it into the
 * standard error response. Anything that is not an `ApiError` becomes a generic 500.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 429: the submitted login has exhausted its persistent credential-attempt budget. */
export class AccountLockedError extends ApiError {
  constructor(lockedUntil: Date, retryAfterSeconds: number) {
    super(
      429,
      'AUTH_ACCOUNT_LOCKED',
      'Konto jest tymczasowo zablokowane po zbyt wielu nieudanych próbach logowania',
      { lockedUntil: lockedUntil.toISOString(), retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

/** 429: the caller address has exhausted the retained Module 1 per-IP window. */
export class IpBlockedError extends ApiError {
  constructor(retryAfterSeconds: number) {
    super(
      429,
      'AUTH_IP_BLOCKED',
      'Zbyt wiele nieudanych prób logowania z tego adresu. Spróbuj ponownie później',
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

/** 429: repeated current-password guesses have temporarily closed password change. */
export class PasswordChangeLockedError extends ApiError {
  constructor(lockedUntil: Date, retryAfterSeconds: number) {
    super(
      429,
      'AUTH_PASSWORD_CHANGE_LOCKED',
      'Zmiana hasła jest tymczasowo zablokowana po zbyt wielu nieudanych próbach',
      { lockedUntil: lockedUntil.toISOString(), retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

export class CaptchaRequiredError extends ApiError {
  constructor() {
    super(400, 'CAPTCHA_REQUIRED', 'Wymagane potwierdzenie CAPTCHA');
  }
}

export class CaptchaFailedError extends ApiError {
  constructor() {
    super(403, 'CAPTCHA_FAILED', 'Nie udało się zweryfikować CAPTCHA');
  }
}

export class CaptchaUnavailableError extends ApiError {
  constructor() {
    super(503, 'CAPTCHA_UNAVAILABLE', 'Weryfikacja CAPTCHA jest chwilowo niedostępna');
  }
}

/** 401: no valid session. The same answer whatever the reason, so it reveals nothing about it. */
export class UnauthorizedError extends ApiError {
  constructor() {
    super(401, 'AUTH_REQUIRED', 'Wymagane zalogowanie');
  }
}

/** 403: signed in, but the role or the object does not allow this. */
export class ForbiddenError extends ApiError {
  constructor() {
    super(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');
  }
}

/** 403: signed in, but the session still owes a password change and may call only what allows it. */
export class PasswordChangeRequiredError extends ApiError {
  constructor() {
    super(403, 'AUTH_PASSWORD_CHANGE_REQUIRED', 'Wymagana zmiana hasła');
  }
}

/** 403: the password was accepted, but the second authentication factor is still required. */
export class TotpChallengeRequiredError extends ApiError {
  constructor() {
    super(403, 'AUTH_TOTP_REQUIRED', 'Wymagany kod uwierzytelniania dwuskładnikowego');
  }
}

/** 400: malformed input. Never says what was wrong, so it cannot echo what the client sent. */
export class ValidationError extends ApiError {
  constructor(details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', 'Nieprawidłowe dane żądania', details);
  }
}

/** 409: the request conflicts with the current state (for example a duplicate login). */
export class ConflictError extends ApiError {
  constructor() {
    super(409, 'CONFLICT', 'Zasób już istnieje');
  }
}

/**
 * 404: the resource does not exist, or the caller may not know that it does. The two cases must
 * stay indistinguishable, so there is one class, one code and one message for both.
 */
export class NotFoundError extends ApiError {
  constructor() {
    super(404, 'NOT_FOUND', 'Nie znaleziono zasobu');
  }
}

/** The standard error response, with `details` only when there are any. Never cacheable. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details && { details }) } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}
