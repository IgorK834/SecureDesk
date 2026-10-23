import { describeApiError } from '../../core/http/api-error';

/** What to tell the administrator when saving or acting on an account failed. */
export function actionErrorMessage(error: unknown): string {
  const { status, code } = describeApiError(error);
  if (code === 'PROTECTED_ACCOUNT') {
    return 'The permanent ADMIN account is protected and cannot be changed this way.';
  }
  if (code === 'LOGIN_ALREADY_EXISTS') return 'An account with this login already exists.';
  switch (status) {
    case 400:
      return 'The server rejected the data. Check the form and try again.';
    case 401:
      return 'Your session has ended. Sign in again.';
    case 403:
      return 'You are not allowed to do this.';
    case 404:
      return 'This account no longer exists.';
    default:
      return 'Something went wrong. Try again.';
  }
}
