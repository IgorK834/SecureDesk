import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { passwordPolicyViolations } from '../../core/http/api-error';

export const passwordsMatch: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('newPassword')?.value as string | undefined;
  const confirmation = control.get('confirmNewPassword')?.value as string | undefined;
  return password === confirmation ? null : { passwordsMismatch: true };
};

export const newPasswordDiffersFromCurrent: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const current = control.get('currentPassword')?.value as string | undefined;
  const replacement = control.get('newPassword')?.value as string | undefined;
  return current && replacement && current === replacement ? { passwordUnchanged: true } : null;
};

/** Mirrors the public minimum for convenience; the backend remains the policy authority. */
export const passwordMinimumLength =
  (minimum: () => number): ValidatorFn =>
  (control) =>
    Array.from((control.value as string) || '').length < minimum()
      ? { passwordMinimumLength: true }
      : null;

const POLICY_MESSAGES: Readonly<Record<string, (minimum: number) => string>> = {
  TOO_SHORT: (minimum) => `Use at least ${minimum} characters.`,
  TOO_LONG: () => 'Use at most 128 characters.',
  CONTAINS_LOGIN: () => 'Do not include your login in the password.',
  CONTAINS_FIRST_NAME: () => 'Do not include your first name in the password.',
  CONTAINS_LAST_NAME: () => 'Do not include your last name in the password.',
  COMMON_PASSWORD: () => 'Choose a password that is not commonly used.',
};

/** Converts server codes to allowlisted guidance without ever rendering server or profile data. */
export function policyViolationMessages(error: unknown, minimum: number): string[] {
  const violations = passwordPolicyViolations(error);
  return violations.map(
    (violation) => POLICY_MESSAGES[violation]?.(minimum) ?? 'Password does not meet the policy.',
  );
}
