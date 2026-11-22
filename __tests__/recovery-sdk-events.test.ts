import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { createAuthController } from '../src/auth/authController';
import { deferred, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
// Run the installed SDK: no mocked auth methods, event emitters or copied SDK implementation.
const { createClient } = jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
const email = 'person@example.invalid';
const token = '01234567';
const password = 'synthetic-new-passphrase';
let serial = 0;
let disposers: (() => void)[];
const originalAppState = AppState.currentState;

beforeEach(() => { jest.useFakeTimers(); AppState.currentState = 'active'; disposers = []; });
afterEach(async () => {
  disposers.reverse().forEach((dispose) => dispose());
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
  AppState.currentState = originalAppState;
  jest.restoreAllMocks(); jest.useRealTimers();
});
async function until(condition: () => boolean) {
  for (let i = 0; i < 1000; i += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('Expected SDK/controller state was not reached.');
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } });
}
function setup() {
  const storageKey = `synthetic-sdk-recovery-${++serial}`;
  const memory = new Map<string, string>();
  const trace: string[] = [];
  let verifyResponse = response(testSession());
  let signInSession = testSession();
  const fetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== 'https://sdk-test.invalid') throw new Error('Unexpected SDK origin.');
    if (url.pathname === '/auth/v1/recover' && init?.method === 'POST') return response({});
    if (url.pathname === '/auth/v1/verify' && init?.method === 'POST') return verifyResponse;
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') return response(signInSession);
    if (url.pathname === '/auth/v1/logout' && init?.method === 'POST') return response({});
    if (url.pathname === '/auth/v1/user' && (init?.method === 'GET' || init?.method === 'PUT')) {
      const saved = JSON.parse(memory.get(storageKey) ?? 'null') as Session | null;
      return response({ user: saved?.user ?? null });
    }
    throw new Error('Unexpected SDK request.');
  });
  const client = createClient('https://sdk-test.invalid', 'synthetic-publishable-key', {
    global: { fetch },
    auth: {
      storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true,
      storage: {
        getItem: async (key) => memory.get(key) ?? null,
        setItem: async (key, value) => { memory.set(key, value); if (key === storageKey) trace.push('session saved'); },
        removeItem: async (key) => { memory.delete(key); },
      },
    },
  });
  let marked = false;
  const lock = {
    read: jest.fn(async () => marked),
    set: jest.fn(async () => { marked = true; }),
    clear: jest.fn(async () => { marked = false; }),
  };
  const controller = createAuthController(() => client, lock);
  function subscribe(callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>) {
    const { data: { subscription } } = client.auth.onAuthStateChange(callback);
    disposers.push(() => subscription.unsubscribe());
  }
  async function start() {
    const dispose = controller.subscribe(() => {}); disposers.push(dispose);
    await until(() => controller.getSnapshot().status === 'signedOut');
    return dispose;
  }
  return { client, controller, fetch, trace, memory, storageKey, lock, subscribe, start,
    setVerifyResponse: (value: Response) => { verifyResponse = value; },
    setSignInSession: (value: Session) => { signInSession = value; },
  };
}

test('installed SDK saves the session, emits only PASSWORD_RECOVERY, awaits subscribers, then resolves verifyOtp', async () => {
  const sdk = setup(); await sdk.client.auth.initialize();
  const gate = deferred<void>();
  sdk.subscribe(async (event) => {
    if (event === 'INITIAL_SESSION') return;
    sdk.trace.push(event);
    if (event === 'PASSWORD_RECOVERY') await gate.promise;
  });
  let resolved = false;
  const work = sdk.client.auth.verifyOtp({ email, token, type: 'recovery' }).then((result) => {
    resolved = true; sdk.trace.push('verifyOtp resolved'); return result;
  });
  await until(() => sdk.trace.includes('PASSWORD_RECOVERY'));
  expect(sdk.trace).toEqual(['session saved', 'PASSWORD_RECOVERY']);
  expect(resolved).toBe(false);
  expect(sdk.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = sdk.fetch.mock.calls[0];
  expect(url).toBe('https://sdk-test.invalid/auth/v1/verify');
  expect(JSON.parse(String(options?.body))).toMatchObject({ email, token, type: 'recovery' });
  gate.resolve(); const result = await work;
  expect(result.error).toBeNull(); expect(result.data.user?.email).toBe(email);
  expect(sdk.trace).toEqual(['session saved', 'PASSWORD_RECOVERY', 'verifyOtp resolved']);
});

test('controller waits for the real verifyOtp response, then authorizes update and completes real SDK cleanup', async () => {
  const sdk = setup(); await sdk.start(); await sdk.controller.requestRecovery(email);
  const gate = deferred<void>(); let recoveryEvent = false;
  sdk.subscribe(async (event) => { if (event === 'PASSWORD_RECOVERY') { recoveryEvent = true; await gate.promise; } });
  const work = sdk.controller.verifyRecoveryCode(token);
  await until(() => recoveryEvent);
  expect(sdk.controller.getSnapshot()).toMatchObject({ recovery: 'verifying', busy: 'verifyRecovery', session: null });
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  gate.resolve(); await work;
  expect(sdk.controller.getSnapshot()).toMatchObject({ recovery: 'authorized', busy: null, session: null });
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  expect(sdk.controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null, message: 'Your password has been updated. Sign in with your new password.' });
  expect(sdk.memory.has(sdk.storageKey)).toBe(false); expect(sdk.lock.clear).toHaveBeenCalledTimes(1);
});

test.each([false, true])('real SDK unrelated sign-in during pending verification invalidates recovery (switch account=%s)', async (switchAccount) => {
  const sdk = setup(); await sdk.start(); await sdk.controller.requestRecovery(email);
  const gate = deferred<void>(); const events: AuthChangeEvent[] = [];
  sdk.subscribe(async (event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') return;
    events.push(event); if (event === 'PASSWORD_RECOVERY') await gate.promise;
  });
  const work = sdk.controller.verifyRecoveryCode(token); await until(() => events.includes('PASSWORD_RECOVERY'));
  const session = testSession();
  if (switchAccount) session.user = { ...session.user, id: 'other-synthetic-user', email: 'other@example.invalid' };
  sdk.setSignInSession(session);
  expect((await sdk.client.auth.signInWithPassword({ email: session.user.email!, password })).error).toBeNull();
  expect(events).toEqual(['PASSWORD_RECOVERY', 'SIGNED_IN']);
  gate.resolve(); await work;
  expect(sdk.controller.getSnapshot()).toMatchObject({ status: 'recovering', recovery: 'invalid', session: null });
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test.each([false, true])('real SDK sign-in after verification revokes recovery authority (switch account=%s)', async (switchAccount) => {
  const sdk = setup(); await sdk.start(); await sdk.controller.requestRecovery(email); await sdk.controller.verifyRecoveryCode(token);
  expect(sdk.controller.getSnapshot().recovery).toBe('authorized');
  const session = testSession();
  if (switchAccount) session.user = { ...session.user, id: 'other-synthetic-user', email: 'other@example.invalid' };
  sdk.setSignInSession(session);
  await sdk.client.auth.signInWithPassword({ email: session.user.email!, password });
  expect(sdk.controller.getSnapshot().recovery).toBe('invalid');
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test('a real PASSWORD_RECOVERY event for a mismatched server identity cannot authorize update', async () => {
  const sdk = setup(); await sdk.start(); await sdk.controller.requestRecovery(email);
  const session = testSession(); session.user = { ...session.user, id: 'other', email: 'other@example.invalid' };
  sdk.setVerifyResponse(response(session)); const events: AuthChangeEvent[] = [];
  sdk.subscribe((event) => { if (event !== 'INITIAL_SESSION') events.push(event); });
  await sdk.controller.verifyRecoveryCode(token);
  expect(events).toContain('PASSWORD_RECOVERY'); expect(events).not.toContain('SIGNED_IN');
  expect(sdk.controller.getSnapshot().recovery).toBe('invalid');
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test('real SDK rejected verification emits no recovery/sign-in event and cannot authorize update', async () => {
  const sdk = setup(); await sdk.start(); await sdk.controller.requestRecovery(email);
  sdk.setVerifyResponse(response({ code: 'otp_expired', message: 'synthetic rejection' }, 403));
  const events: AuthChangeEvent[] = []; sdk.subscribe((event) => { events.push(event); });
  await sdk.controller.verifyRecoveryCode(token);
  expect(events).not.toContain('PASSWORD_RECOVERY'); expect(events).not.toContain('SIGNED_IN');
  expect(sdk.controller.getSnapshot().recovery).toBe('code');
  await sdk.controller.updateRecoveryPassword(password, password);
  expect(sdk.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
});

test('real SDK verification interrupted by remount is cleaned before session restoration', async () => {
  const sdk = setup(); const stop = await sdk.start(); await sdk.controller.requestRecovery(email);
  const gate = deferred<void>(); let recoveryEvent = false;
  sdk.subscribe(async (event) => { if (event === 'PASSWORD_RECOVERY') { recoveryEvent = true; await gate.promise; } });
  const work = sdk.controller.verifyRecoveryCode(token); await until(() => recoveryEvent);
  expect(sdk.memory.has(sdk.storageKey)).toBe(true);
  stop(); const restart = sdk.start();
  expect(sdk.controller.getSnapshot().status).toBe('loading');
  gate.resolve(); await work; await restart;
  expect(sdk.controller.getSnapshot()).toMatchObject({ status: 'signedOut', session: null });
  expect(sdk.memory.has(sdk.storageKey)).toBe(false); expect(sdk.lock.clear).toHaveBeenCalledTimes(1);
});
