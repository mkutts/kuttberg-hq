import { redirectSystemPath } from '../app/+native-intent';
import { authController } from '../src/auth/authController';

jest.mock('../src/auth/authController', () => ({ authController: { receiveRecoveryLink: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
test.each([true, false])('native intent handles recovery and removes credentials before routing (initial=%s)', (initial) => {
  const token = 'synthetic_recovery_hash_not_real_12345678';
  const route = redirectSystemPath({ path: `kuttberg-hq://reset-password?token_hash=${token}&type=recovery`, initial });
  expect(route).toBe('/reset-password');
  expect(authController.receiveRecoveryLink).toHaveBeenCalledWith({ tokenHash: token });
  expect(route).not.toContain(token);
});
test('legacy implicit callback is sanitized and rejected without installing tokens', () => {
  expect(redirectSystemPath({ path: 'kuttberg-hq://reset-password#access_token=synthetic&refresh_token=synthetic&type=recovery', initial: false })).toBe('/reset-password');
  expect(authController.receiveRecoveryLink).toHaveBeenCalledWith({ invalid: true });
});
test.each(['https://evil.invalid/reset-password?token_hash=synthetic', 'other-app://reset-password?token_hash=synthetic',
  'kuttberg-hq://reset-password.evil?token_hash=synthetic', 'kuttberg-hq://signup#access_token=synthetic'])('untrusted link cannot enter recovery: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe('/');
  expect(authController.receiveRecoveryLink).not.toHaveBeenCalled();
});
test.each(['kuttberg-hq://settings?access_token=synthetic', '/settings#access_token=synthetic'])('ordinary routing strips secrets: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe('/settings');
  expect(authController.receiveRecoveryLink).not.toHaveBeenCalled();
});
