import { AppState } from 'react-native';

import { createAuthController } from '../src/auth/authController';
import { invalidCodeMessage, normalizeRecoveryCode, passwordValidation, recoveryConfirmation, validRecoveryCode } from '../src/auth/recovery';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
const email = 'person@example.invalid';
const token = '01234567'; // Synthetic; intentionally includes a leading zero.
const password = 'synthetic-new-passphrase';
const flush = async () => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); };
let dispose: () => void;
const originalAppState = AppState.currentState;
beforeEach(() => { jest.useFakeTimers(); AppState.currentState = 'active'; });
afterEach(async () => { dispose?.(); await flush(); AppState.currentState = originalAppState; jest.restoreAllMocks(); jest.useRealTimers(); });
function setup(options: { signedIn?: boolean; interrupted?: boolean } = {}) {
  const mock = mockAuthClient(options.signedIn ? testSession() : null);
  let marked = Boolean(options.interrupted);
  const lock = {
    read: jest.fn(async () => marked),
    set: jest.fn(async () => { marked = true; }),
    clear: jest.fn(async () => { marked = false; }),
  };
  const controller = createAuthController(() => mock.client, lock);
  dispose = controller.subscribe(jest.fn());
  return { ...mock, lock, controller };
}
async function requested(options: { signedIn?: boolean } = {}) {
  const mock = setup(options); await flush();
  await mock.controller.requestRecovery(email);
  return mock;
}
async function authorized() {
  const mock = await requested();
  await mock.controller.verifyRecoveryCode(token);
  return mock;
}

test.each([null, 'user_not_found', 'email_not_confirmed', 'user_banned'])('neutral code request for account result %s', async (code) => {
  const { controller, auth } = setup(); await flush();
  if (code) auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { code, message: 'private' } });
  expect(await controller.requestRecovery(' Person@Example.Invalid ')).toBe(recoveryConfirmation);
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(email);
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'code', recoveryEmail: email, message: recoveryConfirmation, session: null });
});
test('invalid email is rejected without any SDK mutation', async () => {
  const { controller, auth, lock } = setup(); await flush();
  expect(await controller.requestRecovery('invalid')).toContain('valid email');
  expect(auth.resetPasswordForEmail).not.toHaveBeenCalled(); expect(lock.set).not.toHaveBeenCalled();
});
test.each([{ status: 429 }, { code: 'over_email_send_rate_limit' }, { code: 'over_request_rate_limit' }])('redacts request rate limits %j', async (error) => {
  const { controller, auth } = setup(); await flush();
  auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { ...error, message: 'private' } });
  expect(await controller.requestRecovery(email)).toContain('Too many requests');
  expect(controller.getSnapshot().message).not.toContain('private');
});
test('offline request, duplicate submission and resend cooldown', async () => {
  const { controller, auth } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.resetPasswordForEmail>>>();
  auth.resetPasswordForEmail.mockReturnValueOnce(response.promise);
  const work = controller.requestRecovery(email); await flush();
  expect(await controller.requestRecovery(email)).toBeNull();
  await controller.finishRecovery();
  response.resolve({ data: null, error: new Error('private') }); await work;
  expect(controller.getSnapshot().message).toContain('Check your connection');
  expect(await controller.requestRecovery(email)).toContain('wait a minute');
  await jest.advanceTimersByTimeAsync(60_001);
  expect(await controller.requestRecovery(email)).toBe(recoveryConfirmation);
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
});
test('resend cannot switch the email and cancels no verified authority', async () => {
  const { controller, auth } = await requested();
  await jest.advanceTimersByTimeAsync(60_001);
  expect(await controller.requestRecovery('other@example.invalid')).toBeNull();
  await controller.verifyRecoveryCode(token);
  expect(await controller.requestRecovery(email)).toBeNull();
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
});
test.each(['', '123456', '1234567', '123456789', '1234a678', '1234 5678', '１２３４５６７８', '1234567\n'])('rejects malformed eight-digit code %j', async (value) => {
  const { controller, auth } = await requested();
  await controller.verifyRecoveryCode(value);
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(controller.getSnapshot().message).toContain('eight-digit');
});
test('paste trims only outer whitespace and preserves all eight digits including zero', async () => {
  const { controller, auth, lock } = await requested();
  expect(normalizeRecoveryCode(' 01234567\n')).toBe(token);
  expect(validRecoveryCode(token)).toBe(true);
  await controller.verifyRecoveryCode(' 01234567\n');
  expect(auth.verifyOtp).toHaveBeenCalledWith({ email, token, type: 'recovery' });
  expect(lock.set.mock.invocationCallOrder[0]).toBeLessThan(auth.verifyOtp.mock.invocationCallOrder[0]);
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'authorized', session: null, busy: null });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain(token);
  await controller.verifyRecoveryCode(token); await controller.signIn(email, password); await controller.signOut(); controller.retry();
  expect(auth.verifyOtp).toHaveBeenCalledTimes(1); expect(auth.signInWithPassword).not.toHaveBeenCalled();
});
test.each(['SIGNED_IN', 'PASSWORD_RECOVERY'] as const)('ordinary %s cannot authorize password update', async (event) => {
  const { controller, auth, emit } = await requested();
  emit(event, testSession());
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({ recovery: 'code', session: null });
});
test('previously signed-in account is removed and cannot update another account without its valid recovery', async () => {
  const { controller, auth } = setup({ signedIn: true }); await flush();
  await controller.updateRecoveryPassword(password, password);
  await controller.requestRecovery('other@example.invalid');
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(controller.getSnapshot().session).toBeNull();
  await controller.verifyRecoveryCode(token); // Mock responds with the ORIGINAL account: must reject it.
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot().recovery).toBe('invalid'); expect(auth.updateUser).not.toHaveBeenCalled();
});
test.each(['wrong', 'expired', 'reused', 'superseded'])('%s code uses server rejection and stays unauthorized', async () => {
  const { controller, auth } = await requested();
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'otp_expired', message: 'private' } });
  await controller.verifyRecoveryCode(token);
  expect(controller.getSnapshot()).toMatchObject({ recovery: 'code', message: invalidCodeMessage });
  await controller.updateRecoveryPassword(password, password); expect(auth.updateUser).not.toHaveBeenCalled();
});
test('replacement code can verify after a superseded code is rejected', async () => {
  const { controller, auth } = await requested();
  await jest.advanceTimersByTimeAsync(60_001); await controller.requestRecovery(email);
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'otp_expired' } });
  await controller.verifyRecoveryCode(token);
  await controller.verifyRecoveryCode('87654321');
  expect(controller.getSnapshot().recovery).toBe('authorized');
});
test.each([false, true])('offline verification is sanitized and cannot grant authority (throw=%s)', async (throws) => {
  const { controller, auth } = await requested();
  if (throws) auth.verifyOtp.mockRejectedValueOnce(new Error('private'));
  else auth.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { code: 'network' } });
  await controller.verifyRecoveryCode(token);
  expect(controller.getSnapshot().recovery).not.toBe('authorized');
  expect(controller.getSnapshot().message).not.toContain('private');
  await controller.updateRecoveryPassword(password, password); expect(auth.updateUser).not.toHaveBeenCalled();
});
test('verification rate limit is sanitized', async () => {
  const { controller, auth } = await requested();
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { status: 429, message: 'private' } });
  await controller.verifyRecoveryCode(token);
  expect(controller.getSnapshot().message).toContain('Too many attempts');
});
test.each(['missing', 'expired', 'nan', 'different-user', 'different-email', 'session-email', 'missing-access', 'missing-refresh', 'wrong-type'])('rejects invalid verification response: %s', async (kind) => {
  const { controller, auth } = await requested();
  const session = testSession(); const user = { ...session.user };
  if (kind === 'expired') session.expires_at = 1;
  if (kind === 'nan') session.expires_at = NaN;
  if (kind === 'different-user') user.id = 'other';
  if (kind === 'different-email') user.email = 'other@example.invalid';
  if (kind === 'session-email') session.user.email = 'other@example.invalid';
  if (kind === 'missing-access') session.access_token = '';
  if (kind === 'missing-refresh') session.refresh_token = '';
  if (kind === 'wrong-type') session.token_type = 'other' as typeof session.token_type;
  auth.verifyOtp.mockResolvedValueOnce({ data: { session: kind === 'missing' ? null : session, user }, error: null });
  await controller.verifyRecoveryCode(token);
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each(['request-lock', 'request-signout', 'verify-lock', 'verify-signout'])('preparation failure blocks exchange: %s', async (stage) => {
  const { controller, auth, lock } = setup(); await flush();
  if (stage.startsWith('verify')) await controller.requestRecovery(email);
  if (stage.endsWith('lock')) lock.set.mockRejectedValueOnce(new Error('private'));
  else auth.signOut.mockResolvedValueOnce({ error: new Error('private') });
  if (stage.startsWith('verify')) await controller.verifyRecoveryCode(token);
  else await controller.requestRecovery(email);
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(controller.getSnapshot().status).toBe('recovering');
});
test.each([['short', 'short'], [password, 'mismatch'], [' '.repeat(12), ' '.repeat(12)], ['x'.repeat(129), 'x'.repeat(129)]])('password validation rejects %s', async (value, confirm) => {
  const { controller, auth } = await authorized();
  expect(passwordValidation(value, confirm)).toBeTruthy();
  await controller.updateRecoveryPassword(value, confirm); expect(auth.updateUser).not.toHaveBeenCalled();
});
test('success clears SDK session, marker and email; stale events cannot restore navigation', async () => {
  const { controller, auth, lock, emit } = await authorized();
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledWith({ password });
  expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' }); expect(lock.clear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: 'Your password has been updated. Sign in with your new password.' });
  emit('SIGNED_IN', testSession()); emit('TOKEN_REFRESHED', testSession()); emit('PASSWORD_RECOVERY', testSession());
  expect(controller.getSnapshot().status).toBe('signedOut');
  await controller.signIn(email, password); expect(controller.getSnapshot().status).toBe('signedIn');
});
test.each([false, true])('update failure is sanitized without success (throw=%s)', async (throws) => {
  const { controller, auth } = await authorized();
  if (throws) auth.updateUser.mockRejectedValueOnce(new Error('private-password'));
  else auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password', message: 'private-password' } });
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot()).toMatchObject({ recovery: 'authorized', busy: null });
  expect(controller.getSnapshot().message).toContain('Unable to confirm');
  expect(controller.getSnapshot().message).not.toContain('private-password');
});
test('duplicate verification and cancellation cannot race', async () => {
  const { controller, auth } = await requested();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>(); auth.verifyOtp.mockReturnValueOnce(response.promise);
  const work = controller.verifyRecoveryCode(token); await flush();
  await controller.verifyRecoveryCode(token); await controller.finishRecovery(); await controller.requestRecovery(email);
  expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  const session = testSession(); response.resolve({ data: { session, user: session.user }, error: null }); await work;
  expect(controller.getSnapshot().recovery).toBe('authorized');
});
test('duplicate updates and cancellation cannot race', async () => {
  const { controller, auth } = await authorized();
  const response = deferred<Awaited<ReturnType<typeof auth.updateUser>>>(); auth.updateUser.mockReturnValueOnce(response.promise);
  const work = controller.updateRecoveryPassword(password, password); await flush();
  await controller.updateRecoveryPassword(password, password); await controller.finishRecovery();
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
  response.resolve({ data: { user: testSession().user }, error: null }); await work;
  expect(controller.getSnapshot().status).toBe('signedOut');
});
test.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('newer %s before verify settles rejects stale authorization', async (event) => {
  const { controller, auth, emit } = await requested();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>(); auth.verifyOtp.mockReturnValueOnce(response.promise);
  const work = controller.verifyRecoveryCode(token); await flush();
  const session = testSession(); emit('PASSWORD_RECOVERY', session); emit(event, event === 'SIGNED_OUT' ? null : session);
  response.resolve({ data: { session, user: session.user }, error: null }); await work;
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('newer %s during getUser blocks password update', async (event) => {
  const { controller, auth, emit } = await authorized();
  const response = deferred<Awaited<ReturnType<typeof auth.getUser>>>(); auth.getUser.mockReturnValueOnce(response.promise);
  const work = controller.updateRecoveryPassword(password, password);
  emit(event, event === 'SIGNED_OUT' ? null : testSession());
  response.resolve({ data: { user: testSession().user }, error: null }); await work;
  expect(auth.updateUser).not.toHaveBeenCalled(); expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each(['id', 'email', 'offline'])('current server user revalidation rejects %s', async (kind) => {
  const { controller, auth } = await authorized();
  const user = { ...testSession().user };
  if (kind === 'id') user.id = 'other'; if (kind === 'email') user.email = 'other@example.invalid';
  auth.getUser.mockResolvedValueOnce({ data: { user }, error: kind === 'offline' ? new Error('private') : null });
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled(); expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each([false, true])('authorization expires after ten minutes despite 60-minute email expiry (background=%s)', async (background) => {
  const events = jest.spyOn(AppState, 'addEventListener'); const { controller, auth } = await authorized();
  const onChange = events.mock.calls[0][1]; if (background) onChange('background');
  await jest.advanceTimersByTimeAsync(600_001); if (background) onChange('active');
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).not.toHaveBeenCalled(); expect(controller.getSnapshot().recovery).toBe('invalid');
});
test.each([false, true])('cleanup failure stays guarded and retry never repeats update (storage=%s)', async (storage) => {
  const { controller, auth, lock, emit } = await authorized();
  if (storage) lock.clear.mockRejectedValueOnce(new Error('private'));
  else auth.signOut.mockResolvedValueOnce({ error: new Error('private') });
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'cleanup', busy: null });
  expect(controller.getSnapshot().message).toContain('password was updated');
  emit('SIGNED_IN', testSession()); await controller.updateRecoveryPassword(password, password);
  await controller.finishRecovery(); expect(controller.getSnapshot().status).toBe('signedOut');
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
});
test.each([false, true])('restart marker prevents restoring recovery as household access (cleanup failure=%s)', async (fail) => {
  const { controller, auth } = setup({ interrupted: true, signedIn: true });
  if (fail) auth.signOut.mockResolvedValueOnce({ error: new Error('private') }); await flush();
  expect(auth.getSession).not.toHaveBeenCalled();
  if (fail) { expect(controller.getSnapshot().recovery).toBe('cleanup'); await controller.finishRecovery(); }
  expect(controller.getSnapshot().status).toBe('signedOut');
});
test('unmount during verification waits for SDK write, then cleans before restoration', async () => {
  const { controller, auth, emit } = await requested();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>();
  auth.verifyOtp.mockImplementationOnce(async () => { const result = await response.promise; emit('PASSWORD_RECOVERY', result.data.session); return result; });
  const work = controller.verifyRecoveryCode(token); await flush(); dispose(); dispose = controller.subscribe(jest.fn()); await flush();
  expect(controller.getSnapshot().status).toBe('loading');
  const session = testSession(); response.resolve({ data: { session, user: session.user }, error: null }); await work; await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
});
test('normal sign-in in flight blocks recovery; remount awaits its SDK write', async () => {
  const { controller, auth, emit } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockImplementationOnce(async () => { const result = await response.promise; emit('SIGNED_IN', result.data.session); return result; });
  const work = controller.signIn(email, password);
  expect(await controller.requestRecovery(email)).toBeNull(); dispose(); dispose = controller.subscribe(jest.fn()); await flush();
  expect(await controller.requestRecovery(email)).toBeNull();
  response.resolve({ data: { session: testSession() }, error: null }); await work; await flush();
  await controller.requestRecovery(email); await controller.verifyRecoveryCode(token);
  expect(controller.getSnapshot().recovery).toBe('authorized');
});

test.each(['TOKEN_REFRESHED', 'USER_UPDATED'] as const)('unexpected %s during verification cannot establish authority', async (event) => {
  const { controller, auth, emit } = await requested();
  const response = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>(); auth.verifyOtp.mockReturnValueOnce(response.promise);
  const work = controller.verifyRecoveryCode(token); await flush();
  const session = testSession(); emit(event, session);
  response.resolve({ data: { session, user: session.user }, error: null }); await work;
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test('previously signed-in user can recover a different account only with that account verified', async () => {
  const { controller, auth, emit } = setup({ signedIn: true }); await flush();
  await controller.requestRecovery('other@example.invalid');
  const session = testSession(); session.user = { ...session.user, id: 'other-user', email: 'other@example.invalid' };
  auth.verifyOtp.mockImplementationOnce(async () => { emit('PASSWORD_RECOVERY', session); return { data: { session, user: session.user }, error: null }; });
  await controller.verifyRecoveryCode(token);
  await controller.updateRecoveryPassword(password, password);
  expect(auth.updateUser).toHaveBeenCalledTimes(1); expect(controller.getSnapshot().status).toBe('signedOut');
});
test('session expiry earlier than ten minutes limits authorization', async () => {
  const { controller, auth } = await requested();
  const session = testSession(); session.expires_at = Math.floor(Date.now() / 1000) + 30;
  auth.verifyOtp.mockResolvedValueOnce({ data: { session, user: session.user }, error: null });
  await controller.verifyRecoveryCode(token);
  await jest.advanceTimersByTimeAsync(30_001);
  expect(controller.getSnapshot().recovery).toBe('invalid');
});
test('missing update confirmation never reports success and requires cleanup', async () => {
  const { controller, auth } = await authorized();
  auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  await controller.updateRecoveryPassword(password, password);
  expect(controller.getSnapshot().recovery).toBe('invalid');
  expect(controller.getSnapshot().message).toContain('Unable to confirm');
});
test('cancelling code entry clears email and requires explicit sign-in even after stale events', async () => {
  const { controller, emit } = await requested({ signedIn: true });
  await controller.finishRecovery(); emit('SIGNED_IN', testSession());
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: null });
});
test('unmount during request discards its stale result and cleans the interruption marker', async () => {
  const { controller, auth } = setup(); await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.resetPasswordForEmail>>>(); auth.resetPasswordForEmail.mockReturnValueOnce(response.promise);
  const work = controller.requestRecovery(email); await flush(); dispose(); dispose = controller.subscribe(jest.fn()); await flush();
  expect(controller.getSnapshot().status).toBe('loading');
  response.resolve({ data: {}, error: null }); expect(await work).toBeNull(); await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
  expect(controller.getSnapshot().recoveryEmail).toBeUndefined();
});
test('unmount during password update cleans the resulting SDK session before hydration', async () => {
  const { controller, auth } = await authorized();
  const response = deferred<Awaited<ReturnType<typeof auth.updateUser>>>(); auth.updateUser.mockReturnValueOnce(response.promise);
  const work = controller.updateRecoveryPassword(password, password); await flush(); dispose(); dispose = controller.subscribe(jest.fn()); await flush();
  expect(controller.getSnapshot().status).toBe('loading');
  response.resolve({ data: { user: testSession().user }, error: null }); await work; await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
  expect(controller.getSnapshot().message).not.toContain('has been updated');
});
