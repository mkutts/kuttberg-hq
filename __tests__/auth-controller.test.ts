import { AppState } from 'react-native';

import { createAuthController } from '../src/auth/authController';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
let dispose: () => void;
const originalAppState = AppState.currentState;

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
});
afterEach(async () => { dispose?.(); await flush(); AppState.currentState = originalAppState; jest.restoreAllMocks(); jest.useRealTimers(); });

function setup(session: ReturnType<typeof testSession> | null = null) {
  const mock = mockAuthClient(session);
  const controller = createAuthController(() => mock.client);
  dispose = controller.subscribe(jest.fn());
  return { ...mock, controller };
}

test('waits for initialization and getSession before resolving signed-out hydration', async () => {
  const mock = mockAuthClient();
  const initialization = deferred<{ error: null }>();
  mock.auth.initialize.mockReturnValue(initialization.promise);
  const controller = createAuthController(() => mock.client);
  dispose = controller.subscribe(jest.fn());
  expect(controller.getSnapshot().status).toBe('loading');
  expect(mock.auth.getSession).not.toHaveBeenCalled();
  initialization.resolve({ error: null });
  await flush();
  expect(controller.getSnapshot().status).toBe('signedOut');
});

test('restores a saved session and observes refreshed tokens without persisting them itself', async () => {
  const session = testSession();
  const { controller, emit } = setup(session);
  await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedIn', session });
  const refreshed = { ...session, expires_at: session.expires_at! + 3600 };
  emit('TOKEN_REFRESHED', refreshed);
  expect(controller.getSnapshot().session).toBe(refreshed);
});

test.each(['SIGNED_OUT', 'SIGNED_IN'] as const)('a newer %s event wins over delayed hydration', async (event) => {
  const { controller, auth, emit } = setup();
  const read = deferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(read.promise);
  await flush();
  const session = event === 'SIGNED_IN' ? testSession() : null;
  emit(event, session);
  read.resolve({ data: { session: event === 'SIGNED_OUT' ? testSession() : null }, error: null });
  await flush();
  expect(controller.getSnapshot()).toMatchObject({ status: session ? 'signedIn' : 'signedOut', session });
});

test('INITIAL_SESSION null cannot turn a failed restoration into a confirmed sign-out', async () => {
  const { controller, auth, emit } = setup();
  auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('offline') });
  emit('INITIAL_SESSION', null);
  await flush();
  expect(controller.getSnapshot().status).toBe('unavailable');
  auth.getSession.mockResolvedValueOnce({ data: { session: testSession() }, error: null });
  controller.retry();
  await flush();
  expect(controller.getSnapshot().status).toBe('signedIn');
});

test('configuration failures remain recoverable and never expose raw errors', async () => {
  const mock = mockAuthClient();
  const getClient = jest.fn().mockImplementationOnce(() => { throw new Error('sensitive configuration'); }).mockReturnValue(mock.client);
  const controller = createAuthController(getClient);
  dispose = controller.subscribe(jest.fn());
  await flush();
  expect(controller.getSnapshot().status).toBe('unavailable');
  expect(controller.getSnapshot().message).not.toContain('sensitive');
  controller.retry();
  await flush();
  expect(controller.getSnapshot().status).toBe('signedOut');
});

test('sign-in passes the trimmed email and exact password once; success follows auth events', async () => {
  const { controller, auth } = setup();
  await flush();
  const first = controller.signIn(' person@example.invalid ', ' synthetic password ');
  await controller.signIn('person@example.invalid', 'duplicate');
  await first;
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.invalid', password: ' synthetic password ' });
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedIn', busy: null });
});

test.each([false, true])('failed sign-in is recoverable and redacted (throws=%s)', async (throws) => {
  const { controller, auth } = setup();
  await flush();
  const error = { code: 'invalid_credentials', message: 'private server detail' };
  if (throws) auth.signInWithPassword.mockRejectedValueOnce(error);
  else auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error });
  await controller.signIn('person@example.invalid', 'synthetic-password');
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', busy: null });
  expect(controller.getSnapshot().message).toContain('Check your email and password');
  expect(controller.getSnapshot().message).not.toContain('private');
});

test('successful sign-out removes the controller session after SDK success', async () => {
  const { controller, auth } = setup(testSession());
  await flush();
  await controller.signOut();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null, busy: null });
});

test.each([false, true])('sign-out failure does not claim success (throws=%s)', async (throws) => {
  const { controller, auth } = setup(testSession());
  await flush();
  if (throws) auth.signOut.mockRejectedValueOnce(new Error('private storage error'));
  else auth.signOut.mockResolvedValueOnce({ error: new Error('private network error') });
  await controller.signOut();
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedIn', busy: null });
  expect(controller.getSnapshot().message).toBe('Sign-out did not complete. Check your connection and try again.');
});

test('expired session and an offline refresh block content; reconnect retry restores it', async () => {
  const session = { ...testSession(), expires_at: Math.floor(Date.now() / 1000) + 1 };
  const { controller, auth } = setup(session);
  await flush();
  auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('offline') });
  await jest.advanceTimersByTimeAsync(1001);
  expect(controller.getSnapshot()).toMatchObject({ status: 'unavailable', session });
  auth.getSession.mockResolvedValueOnce({ data: { session: testSession() }, error: null });
  await jest.advanceTimersByTimeAsync(30_000);
  expect(controller.getSnapshot().status).toBe('signedIn');
});

test('confirmed revocation removes access and prompts sign-in', async () => {
  const { controller, emit } = setup(testSession());
  await flush();
  emit('SIGNED_OUT', null);
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null, message: 'Your session ended. Please sign in again.' });
});

test('one lifecycle subscription serves multiple consumers, pauses/resumes, and cleans up', async () => {
  const events = jest.spyOn(AppState, 'addEventListener');
  const { controller, auth, unsubscribe } = setup(testSession());
  const secondDispose = controller.subscribe(jest.fn());
  await flush();
  expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  const onChange = events.mock.calls.at(-1)![1];
  onChange('background');
  onChange('active');
  onChange('active');
  await flush();
  expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  secondDispose();
  expect(unsubscribe).not.toHaveBeenCalled();
  dispose();
  await flush();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
});

test('unmount during initialization cannot restart refresh or update a new lifecycle', async () => {
  const mock = mockAuthClient();
  const initialization = deferred<{ error: null }>();
  mock.auth.initialize.mockReturnValueOnce(initialization.promise);
  const controller = createAuthController(() => mock.client);
  dispose = controller.subscribe(jest.fn());
  dispose();
  initialization.resolve({ error: null });
  await flush();
  expect(mock.auth.getSession).not.toHaveBeenCalled();
  expect(mock.auth.startAutoRefresh).not.toHaveBeenCalled();
  dispose = controller.subscribe(jest.fn());
  await flush();
  expect(controller.getSnapshot().status).toBe('signedOut');
});

test('the last unsubscribe clears the snapshot before a provider can remount', async () => {
  const { controller } = setup(testSession());
  await flush();
  expect(controller.getSnapshot().status).toBe('signedIn');
  dispose();
  expect(controller.getSnapshot()).toMatchObject({ status: 'loading', session: null });
});

test('a pending foreground read cannot erase a later sign-out failure', async () => {
  const { controller, auth } = setup(testSession());
  await flush();
  const read = deferred<Awaited<ReturnType<typeof auth.getSession>>>();
  auth.getSession.mockReturnValueOnce(read.promise);
  controller.retry();
  auth.signOut.mockResolvedValueOnce({ error: new Error('offline') });
  await controller.signOut();
  read.resolve({ data: { session: testSession() }, error: null });
  await flush();
  expect(controller.getSnapshot().message).toContain('Sign-out did not complete');
});

test('SIGNED_IN authenticates before the sign-in response and clears busy only when the request settles', async () => {
  const { controller, auth, emit } = setup();
  await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
  auth.signInWithPassword.mockReturnValueOnce(response.promise);
  const request = controller.signIn('person@example.invalid', 'synthetic-password');
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedOut', busy: 'signIn' });
  const session = testSession();
  emit('SIGNED_IN', session);
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedIn', session, busy: 'signIn', message: null });
  await controller.signIn('person@example.invalid', 'duplicate');
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  response.resolve({ data: { session }, error: null });
  await request;
  expect(controller.getSnapshot()).toEqual({ status: 'signedIn', session, busy: null, message: null });
});

describe.each(['TOKEN_REFRESHED', 'SIGNED_OUT'] as const)('sign-in followed by newer %s', (event) => {
  test.each(['success', 'returned error', 'thrown error'] as const)('ignores a stale %s response and clears busy', async (outcome) => {
    const { controller, auth, emit } = setup();
    await flush();
    const response = deferred<Awaited<ReturnType<typeof auth.signInWithPassword>>>();
    auth.signInWithPassword.mockImplementationOnce(async () => {
      const result = await response.promise;
      if (outcome === 'thrown error') throw new Error('private stale failure');
      return result;
    });
    const request = controller.signIn('person@example.invalid', 'synthetic-password');
    const original = testSession();
    emit('SIGNED_IN', original);
    const newer = event === 'SIGNED_OUT' ? null : { ...original, access_token: 'synthetic-newer-token' };
    emit(event, newer);
    const expected = {
      status: newer ? 'signedIn' : 'signedOut', session: newer,
      message: newer ? null : 'Your session ended. Please sign in again.',
    };
    expect(controller.getSnapshot()).toEqual({ ...expected, busy: 'signIn' });
    response.resolve({ data: { session: original }, error: outcome === 'returned error' ? new Error('private stale failure') : null });
    await request;
    expect(controller.getSnapshot()).toEqual({ ...expected, busy: null });
    expect(controller.getSnapshot().session).toBe(newer);
  });
});

test.each(['SIGNED_IN', 'TOKEN_REFRESHED'] as const)('global sign-out rejects stale %s events during and after completion', async (event) => {
  const original = testSession();
  const { controller, auth, emit } = setup(original);
  await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signOut>>>();
  auth.signOut.mockReturnValueOnce(response.promise);
  const request = controller.signOut();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  expect(controller.getSnapshot().busy).toBe('signOut');
  emit(event, { ...original, access_token: 'synthetic-refreshed-token' });
  emit('SIGNED_OUT', null);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: 'signOut', message: null });
  emit(event, original);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: 'signOut', message: null });
  await controller.signOut();
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  response.resolve({ error: null });
  await request;
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: null });
  emit(event, original);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: null });
  controller.retry();
  await flush();
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: null });
  // The stale-event guard must still allow a deliberate new sign-in.
  await controller.signIn('person@example.invalid', 'synthetic-password');
  expect(controller.getSnapshot()).toMatchObject({ status: 'signedIn', busy: null, message: null });
});

describe.each(['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_OUT'] as const)('global sign-out with %s during the request', (event) => {
  test.each([false, true])('preserves failure after settlement and later events (throws=%s)', async (throws) => {
    const original = testSession();
    const { controller, auth, emit } = setup(original);
    await flush();
    const response = deferred<Awaited<ReturnType<typeof auth.signOut>>>();
    auth.signOut.mockImplementationOnce(async () => {
      const result = await response.promise;
      if (throws) throw new Error('private sign-out failure');
      return result;
    });
    const request = controller.signOut();
    const session = event === 'SIGNED_OUT' ? null : { ...original, access_token: 'synthetic-newer-token' };
    emit(event, session);
    expect(controller.getSnapshot()).toMatchObject({ session, busy: 'signOut' });
    response.resolve({ error: throws ? null : new Error('private sign-out failure') });
    await request;
    const expected = {
      status: session ? 'signedIn' : 'signedOut', session, busy: null,
      message: 'Sign-out did not complete. Check your connection and try again.',
    };
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(controller.getSnapshot()).toEqual(expected);
    emit('TOKEN_REFRESHED', session ?? original);
    expect(controller.getSnapshot()).toEqual(expected);
    if (!session) {
      emit('SIGNED_OUT', null);
      expect(controller.getSnapshot()).toEqual(expected);
    }
  });
});

test('global sign-out success without an event still blocks late session events', async () => {
  const original = testSession();
  const { controller, auth, emit } = setup(original);
  await flush();
  const response = deferred<Awaited<ReturnType<typeof auth.signOut>>>();
  auth.signOut.mockReturnValueOnce(response.promise);
  const request = controller.signOut();
  emit('TOKEN_REFRESHED', original);
  response.resolve({ error: null });
  await request;
  emit('SIGNED_IN', original);
  expect(controller.getSnapshot()).toEqual({ status: 'signedOut', session: null, busy: null, message: null });
});
