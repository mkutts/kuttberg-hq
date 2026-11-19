import { authController } from '../src/auth/authController';
import { parseRecoveryLink } from '../src/auth/recovery';

/** Expo Router calls this for BOTH initial URLs and foreground native URL events. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const recovery = parseRecoveryLink(path);
  if (recovery) {
    authController.receiveRecoveryLink(recovery);
    return '/reset-password';
  }
  // No external query/fragment ever reaches route state, history, or error screens.
  // Internal paths (including Expo's launch path) retain their ordinary routing behavior.
  try {
    const url = new URL(path);
    if (url.protocol !== 'kuttberg-hq:') return '/';
    const destination = `${url.host}${url.pathname}`;
    return ['settings', 'wellness', 'routines', 'responsibilities', 'inbox', 'sign-in', 'forgot-password'].includes(destination)
      ? `/${destination}` : '/';
  } catch {
    return path.startsWith('/') ? path.split(/[?#]/)[0] : '/';
  }
}
