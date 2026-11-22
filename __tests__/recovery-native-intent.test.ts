import { redirectSystemPath } from '../app/+native-intent';

test.each(['https://evil.invalid/reset-password?token_hash=synthetic', 'other-app://reset-password?token_hash=synthetic',
  'kuttberg-hq://reset-password.evil?token_hash=synthetic', 'kuttberg-hq://signup#access_token=synthetic'])('untrusted link cannot enter recovery: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe('/');
});
test.each(['kuttberg-hq://settings?access_token=synthetic', '/settings#access_token=synthetic'])('ordinary routing strips secrets: %s', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe('/settings');
});

test.each([true, false])('obsolete recovery links are discarded (initial=%s)', (initial) => {
  for (const path of [
    'kuttberg-hq://reset-password?token_hash=synthetic&type=recovery',
    'kuttberg-hq://reset-password#access_token=synthetic&refresh_token=synthetic&type=recovery',
  ]) expect(redirectSystemPath({ path, initial })).toBe('/');
});
