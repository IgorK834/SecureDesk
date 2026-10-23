// Plain Vitest (root config) has no Angular compiler plugin; harmless under `ng test`.
import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiFailure } from '../../__fixtures__/admin-users';
import { describeApiError } from '../../core/http/api-error';
import { actionErrorMessage } from './error-messages';

describe('describeApiError', () => {
  it('reads the status and the error code of the server envelope', () => {
    expect(describeApiError(apiFailure(409, 'PROTECTED_ACCOUNT'))).toStrictEqual({
      status: 409,
      code: 'PROTECTED_ACCOUNT',
    });
  });

  it('has no code when the body is not an envelope', () => {
    expect(describeApiError(apiFailure(500))).toStrictEqual({ status: 500 });
    const html = new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' });
    expect(describeApiError(html)).toStrictEqual({ status: 502 });
    const oddCode = new HttpErrorResponse({ status: 400, error: { error: { code: 7 } } });
    expect(describeApiError(oddCode)).toStrictEqual({ status: 400 });
  });

  it('reports status 0 for anything that is not an HTTP answer (a network failure, a bug)', () => {
    expect(describeApiError(new Error('boom'))).toStrictEqual({ status: 0 });
    expect(describeApiError(undefined)).toStrictEqual({ status: 0 });
  });
});

describe('actionErrorMessage', () => {
  it.each([
    [apiFailure(409, 'PROTECTED_ACCOUNT'), /ADMIN account is protected/],
    [apiFailure(409, 'LOGIN_ALREADY_EXISTS'), /login already exists/],
    [apiFailure(400, 'VALIDATION_ERROR'), /rejected the data/],
    [apiFailure(401, 'AUTH_REQUIRED'), /session has ended/],
    [apiFailure(403, 'AUTH_FORBIDDEN'), /not allowed/],
    [apiFailure(404, 'NOT_FOUND'), /no longer exists/],
    [apiFailure(500, 'INTERNAL_ERROR'), /Something went wrong/],
    [new Error('network down'), /Something went wrong/],
  ])("words %#, in the UI's own language", (error, expected) => {
    expect(actionErrorMessage(error)).toMatch(expected);
  });

  it("never repeats the server's message text", () => {
    const hostile = new HttpErrorResponse({
      status: 500,
      error: { error: { code: 'INTERNAL_ERROR', message: '<img src=x onerror=alert(1)> SQLITE' } },
    });

    expect(actionErrorMessage(hostile)).not.toMatch(/img|SQLITE|alert/);
  });

  it('tells a protected account apart from a plain conflict, by the code and not the status', () => {
    expect(actionErrorMessage(apiFailure(409))).toMatch(/Something went wrong/);
  });
});
