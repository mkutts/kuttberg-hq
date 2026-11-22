// Matches the Development project's owner-verified Email OTP length (8).
export const recoveryCodeLength = 8;
export const recoveryConfirmation = 'If an account can receive a recovery email, a code will arrive shortly. Check your inbox and spam folder.';
export const invalidRecoveryMessage = 'This recovery session is no longer valid. Return to sign-in and request a new code.';
export const invalidCodeMessage = 'This code is invalid, expired, or already used. Enter the latest code or request a replacement.';

/** Preserve leading zeros; never truncate a pasted value into a different valid code. */
export function normalizeRecoveryCode(value: string) {
  return value.trim();
}

export function validRecoveryCode(value: string) {
  return value.length === recoveryCodeLength && /^[0-9]+$/.test(value);
}

export function validRecoveryEmail(email: string) {
  return email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function passwordValidation(password: string, confirmation: string): string | null {
  if (password.length < 12 || password.length > 128 || !/\S/.test(password)) return 'Use 12 to 128 characters for your new password.';
  if (password !== confirmation) return 'Your passwords do not match.';
  return null;
}

export function isRateLimit(error: unknown) {
  if (typeof error !== 'object' || !error) return false;
  return ('status' in error && error.status === 429) || ('code' in error &&
    (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit'));
}
