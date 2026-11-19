import 'react-native-url-polyfill/auto';

export const recoveryRedirectUrl = 'kuttberg-hq://reset-password';
export const recoveryConfirmation = 'If an account can receive a reset email, a link will arrive shortly. Check your inbox and spam folder.';
export const invalidRecoveryMessage = 'This reset link is invalid, expired, or already used. Return to sign-in and request a new link.';
export type RecoveryLink = { tokenHash: string } | { invalid: true };

/** Only this exact native destination can carry credentials. Never trust a URL's type label alone. */
export function parseRecoveryLink(path: string): RecoveryLink | null {
  try {
    const url = new URL(path);
    if (url.protocol !== 'kuttberg-hq:' || url.host !== 'reset-password' || url.pathname !== '' || url.username || url.password) return null;
    const params = url.searchParams;
    if (url.hash || params.getAll('type').length !== 1 || params.get('type') !== 'recovery' ||
      params.getAll('token_hash').length !== 1 || [...params.keys()].some((key) => key !== 'type' && key !== 'token_hash')) return { invalid: true };
    const tokenHash = params.get('token_hash')!;
    return /^[a-zA-Z0-9_-]{32,256}$/.test(tokenHash) ? { tokenHash } : { invalid: true };
  } catch {
    return null;
  }
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
