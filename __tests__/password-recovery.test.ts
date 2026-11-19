import { AppState } from 'react-native';

import { createAuthController } from '../src/auth/authController';
import { invalidRecoveryMessage, parseRecoveryLink, passwordValidation, recoveryConfirmation, recoveryRedirectUrl } from '../src/auth/recovery';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const tokenHash = 'synthetic_not_a_real_recovery_hash_123456789';
const password = 'synthetic-new-passphrase';
const flush = async () => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); };
let dispose: () => void;
const originalAppState = AppState.currentState;
beforeEach(() => { jest.useFakeTimers(); AppState.currentState = 'active'; });
afterEach(async () => { dispose?.(); await flush(); AppState.currentState = originalAppState; jest.restoreAllMocks(); jest.useRealTimers(); });

function setup(options: { signedIn?: boolean; interrupted?: boolean; cold?: boolean } = {}) {
  const mock = mockAuthClient(options.signedIn ? testSession() : null);
  let marked = Boolean(options.interrupted);
  const lock = {
    read: jest.fn(async () => marked),
    set: jest.fn(async () => { marked = true; }),
    clear: jest.fn(async () => { marked = false; }),
  };
  const controller = createAuthController(() => mock.client, lock);
  if (options.cold) controller.receiveRecoveryLink({ tokenHash });
  dispose = controller.subscribe(jest.fn());
  return { ...mock, lock, controller };
}

test('accepts only the exact recovery destination and one token hash', () => {
  expect(parseRecoveryLink(`${recoveryRedirectUrl}?token_hash=${tokenHash}&type=recovery`)).toEqual({ tokenHash });
});
test.each([
  'https://reset-password?type=recovery', 'kuttberg-hq://evil/reset-password?type=recovery',
  'kuttberg-hq://reset-password.evil?type=recovery', 'kuttberg-hq://user@reset-password?type=recovery',
  'kuttberg-hq://reset-password:80?type=recovery', 'kuttberg-hq://reset-password/extra?type=recovery',
  'kuttberg-hq://sign-in?type=recovery', '/reset-password?type=recovery', 'not a URL',
])('untrusted destination cannot enter recovery: %s', (url) => expect(parseRecoveryLink(url)).toBeNull());
test.each([
  '', '?type=recovery', `?type=signup&token_hash=${tokenHash}`, `?type=recovery&token_hash=${tokenHash}&type=recovery`,
  `?type=recovery&token_hash=${tokenHash}&token_hash=${tokenHash}`, '?type=recovery&token_hash=short',
  `?type=recovery&token_hash=${tokenHash}&next=settings`, '#type=recovery&access_token=synthetic&refresh_token=synthetic',
  '?code=synthetic-code', '?error=access_denied&error_description=private',
  `?type=recovery&token_hash=${tokenHash}%0A`, `?type=recovery&token_hash=${tokenHash}#fragment`,
])('missing, malformed, unrelated and legacy credentials fail closed: %s', (suffix) => {
  expect(parseRecoveryLink(recoveryRedirectUrl + suffix)).toEqual({ invalid: true });
});

test.each([null, 'user_not_found', 'email_not_confirmed', 'user_banned'])('neutral request response for account result %s', async (code) => {
  const { controller, auth } = setup(); await flush();
  if (code) auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { code, message: 'private' } });
  expect(await controller.requestRecovery(' person@example.invalid ')).toBe(recoveryConfirmation);
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.invalid', { redirectTo: recoveryRedirectUrl });
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', busy: null });
});
test('invalid emails are rejected before SDK requests', async () => {
  const { controller, auth } = setup(); await flush();
  expect(await controller.requestRecovery('invalid')).toContain('valid email');
  expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
});
test.each([{ status: 429 }, { code: 'over_email_send_rate_limit' }, { code: 'over_request_rate_limit' }])('redacts rate limits %j', async (error) => {
  const { controller, auth } = setup(); await flush();
  auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { ...error, message: 'private' } });
  expect(await controller.requestRecovery('person@example.invalid')).toBe('Too many requests. Wait a few minutes before trying again.');
});
test('request throws are redacted and duplicate requests/cooldown are enforced', async () => {
  const { controller, auth } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.resetPasswordForEmail>>>();
  auth.resetPasswordForEmail.mockImplementationOnce(async () => { await response.promise; throw new Error('private'); });
  const request = controller.requestRecovery('person@example.invalid');
  expect(await controller.requestRecovery('person@example.invalid')).toBeNull();
  response.resolve({ data: {}, error: null });
  expect(await request).toBe('Unable to request a reset email. Check your connection and try again later.');
  expect(await controller.requestRecovery('person@example.invalid')).toContain('wait a minute');
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60_001);
  expect(await controller.requestRecovery('person@example.invalid')).toBe(recoveryConfirmation);
});

test.each([false, true])('valid recovery verifies once and isolates SDK events (cold=%s)', async (cold) => {
  const { controller, auth, lock, emit } = setup({ cold });
  await flush();
  if (!cold) { controller.receiveRecoveryLink({ tokenHash }); await flush(); }
  expect(lock.set.mock.invocationCallOrder[0]).toBeLessThan(auth.verifyOtp.mock.invocationCallOrder[0]);
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: 'recovery' });
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'authorized', session: null, busy: null });
  controller.receiveRecoveryLink({ tokenHash });
  await controller.signIn('person@example.invalid', password);
  await controller.signOut();
  await controller.requestRecovery('person@example.invalid');
  controller.retry();
  emit('TOKEN_REFRESHED', testSession());
  expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
  expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(controller.getSnapshot().status).toBe('recovering');
});
test.each(['SIGNED_IN', 'PASSWORD_RECOVERY'] as const)('ordinary %s events never authorize a password update', async (event) => {
  const { controller, auth, emit } = setup(); await flush();
  emit(event, testSession());
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBeUndefined();
});
test('a normal signed-in session requires successful recovery verification', async () => {
  const { controller, auth } = setup({ signedIn: true }); await flush();
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>();
  auth.verifyOtp.mockReturnValueOnce(response.promise);
  controller.receiveRecoveryLink({ tokenHash }); await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', session: null, recovery: 'verifying' });
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  response.resolve({ data: { session: null, user: null }, error: { code: 'otp_expired' } }); await flush();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each(['otp_expired', 'otp_disabled', 'validation_failed', 'reused', 'network'])('invalid/expired/reused/network verification %s never authorizes', async (code) => {
  const { controller, auth } = setup(); await flush();
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code, message: 'private' } });
  controller.receiveRecoveryLink({ tokenHash }); await flush();
  expect(controller.getSnapshot()).toMatchObject({ recovery: 'invalid', message: invalidRecoveryMessage });
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
});
test('malformed link never reaches verifyOtp', async () => {
  const { controller, auth } = setup(); await flush();
  controller.receiveRecoveryLink({ invalid: true }); await flush();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test('a failed crash barrier prevents any token exchange', async () => {
  const { controller, auth, lock } = setup(); await flush();
  lock.set.mockRejectedValueOnce(new Error('storage private'));
  controller.receiveRecoveryLink({ tokenHash }); await flush();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each(['missing', 'expired', 'different-user'])('invalid verification response %s fails closed', async (kind) => {
  const { controller, auth } = setup(); await flush();
  const session = testSession();
  if (kind === 'expired') session.expires_at = 1;
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: kind === 'missing' ? null : session,
    user: kind === 'different-user' ? { ...session.user, id: 'other-synthetic' } : session.user }, error: null });
  controller.receiveRecoveryLink({ tokenHash }); await flush();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each([['short', 'short'], [password, 'mismatch'], [' '.repeat(12), ' '.repeat(12)], ['x'.repeat(129), 'x'.repeat(129)]])('password validation rejects %s', async (value, confirm) => {
  const { controller, auth } = setup({ cold: true }); await flush();
  expect(passwordValidation(value, confirm)).toBeTruthy();
  await controller.updateRecoveryPassword(value, confirm);
  expect(auth.updateUser).not.toHaveBeenCalled();
});
test('password success cleans the SDK session and barrier, returns to sign-in, and blocks stale events', async () => {
  const { controller, auth, lock, emit } = setup({ cold: true }); await flush();
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledWith({ password });
  expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  expect(lock.clear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: 'Your password has been updated. Sign in with your new password.' });
  emit('SIGNED_IN', testSession()); emit('TOKEN_REFRESHED', testSession()); emit('PASSWORD_RECOVERY', testSession());
  expect(controller.getSnapshot().status).toBe('signedOut');
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
  await controller.signIn('person@example.invalid', password);
  expect(controller.getSnapshot().status).toBe('signedIn');
});
test.each([false, true])('failed update remains recoverable without exposing SDK detail (throws=%s)', async (throws) => {
  const { controller, auth } = setup({ cold: true }); await flush();
  if (throws) auth.updateUser.mockRejectedValueOnce(new Error('private-password'));
  else auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password', message: 'private-password' } });
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'authorized', busy: null });
  expect(controller.getSnapshot().message).toContain('Unable to confirm');
  expect(controller.getSnapshot().message).not.toContain('private-password');
});
test('duplicate updates and cancel during update cannot race SDK mutation', async () => {
  const { controller, auth } = setup({ cold: true }); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.updateUser>>>();
  auth.updateUser.mockReturnValueOnce(response.promise);
  const first = controller.updateRecoveryPassword(password, password); await flush();
  await controller.updateRecoveryPassword(password, password);
  await controller.finishRecovery();
  controller.receiveRecoveryLink({ tokenHash: tokenHash + 'other' });
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  response.resolve({ data: { user: testSession().user }, error: null }); await first;
  expect(controller.getSnapshot().status).toBe('signedOut');
});
test.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('a newer %s during getUser invalidates recovery before update', async (event) => {
  const { controller, auth, emit } = setup({ cold: true }); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.getUser>>>();
  auth.getUser.mockReturnValueOnce(response.promise);
  const work = controller.updateRecoveryPassword(password, password);
  emit(event, event === 'SIGNED_OUT' ? null : testSession());
  response.resolve({ data: { user: testSession().user }, error: null }); await work;
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test('server user mismatch blocks a password update', async () => {
  const { controller, auth } = setup({ cold: true }); await flush();
  auth.getUser.mockResolvedValueOnce({ data: { user: { ...testSession().user, id: 'other-synthetic' } }, error: null });
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test('authorization expires after ten minutes, including foreground re-entry', async () => {
  const events = jest.spyOn(AppState, 'addEventListener');
  const { controller, auth } = setup({ cold: true }); await flush();
  const onChange = events.mock.calls[0][1];
  onChange('background');
  await jest.advanceTimersByTimeAsync(600_001);
  onChange('active');
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each([false, true])('cleanup failure blocks navigation and retry never repeats the update (storage=%s)', async (storage) => {
  const { controller, auth, lock, emit } = setup({ cold: true }); await flush();
  if (storage) lock.clear.mockRejectedValueOnce(new Error('private'));
  else auth.signOut.mockResolvedValueOnce({ error: new Error('private') });
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'cleanup', busy: null });
  expect(controller.getSnapshot().message).toContain('password was updated');
  emit('SIGNED_IN', testSession());
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
  await controller.finishRecovery();
  expect(controller.getSnapshot().status).toBe('signedOut');
});
test('interrupted recovery is cleaned before any saved session restoration', async () => {
  const { controller, auth, lock } = setup({ interrupted: true, signedIn: true }); await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
  expect(auth.getSession).not.toHaveBeenCalled();
  expect(lock.clear).toHaveBeenCalled();
});
test('failed interruption cleanup stays guarded and retries', async () => {
  const { controller, auth } = setup({ interrupted: true, signedIn: true });
  auth.signOut.mockResolvedValueOnce({ error: new Error('offline') }); await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'cleanup' });
  expect(auth.getSession).not.toHaveBeenCalled();
  await controller.finishRecovery();
  expect(controller.getSnapshot().status).toBe('signedOut');
});
test('recovery link arriving during sign-in waits for the old SDK operation', async () => {
  const { controller, auth, emit } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockReturnValueOnce(response.promise);
  const work = controller.signIn('person@example.invalid', password);
  controller.receiveRecoveryLink({ tokenHash });
  emit('SIGNED_IN', testSession());
  expect(controller.getSnapshot().status).toBe('recovering');
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  response.resolve({ data: { session: testSession() }, error: null }); await work; await flush();
  expect(controller.getSnapshot().recovery).toBe('authorized');
});
test('unmount during verification cannot resurrect recovery; remount cleans persisted session', async () => {
  const { controller, auth, emit } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>();
  auth.verifyOtp.mockImplementationOnce(async () => {
    const result = await response.promise;
    emit('PASSWORD_RECOVERY', result.data.session);
    return result;
  });
  controller.receiveRecoveryLink({ tokenHash }); await flush(); dispose();
  dispose = controller.subscribe(jest.fn()); await flush();
  expect(controller.getSnapshot().status).toBe('loading');
  const session = testSession();
  response.resolve({ data: { session, user: session.user }, error: null }); await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
});

test('remount recovery waits for an older sign-in SDK write before exchanging the recovery token', async () => {
  const { controller, auth, emit } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockImplementationOnce(async () => {
    const result = await response.promise;
    emit('SIGNED_IN', result.data.session);
    return result;
  });
  const work = controller.signIn('person@example.invalid', password);
  dispose();
  controller.receiveRecoveryLink({ tokenHash });
  dispose = controller.subscribe(jest.fn()); await flush();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  response.resolve({ data: { session: testSession() }, error: null }); await work; await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'authorized' });
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
});

test.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('a newer %s before verifyOtp resolves cannot authorize recovery', async (event) => {
  const { controller, auth, emit } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>();
  auth.verifyOtp.mockReturnValueOnce(response.promise);
  controller.receiveRecoveryLink({ tokenHash }); await flush();
  const session = testSession();
  emit('PASSWORD_RECOVERY', session);
  emit(event, event === 'SIGNED_OUT' ? null : session);
  response.resolve({ data: { session, user: session.user }, error: null }); await flush();
  expect(controller.getSnapshot().recovery).toBe('invalid');
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
});
