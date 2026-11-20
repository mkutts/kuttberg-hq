import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

export function testSession(): Session {
  return {
    access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'synthetic-user', email: 'person@example.invalid', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export function mockAuthClient(initialSession: Session | null = null) {
  let savedSession = initialSession;
  const callbacks = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
  const emit = (event: AuthChangeEvent, session: Session | null) => {
    savedSession = session;
    callbacks.forEach((callback) => callback(event, session));
  };
  const unsubscribe = jest.fn();
  const auth = {
    initialize: jest.fn(async () => ({ error: null })),
    getSession: jest.fn(async (): Promise<{ data: { session: Session | null }; error: unknown }> => ({ data: { session: savedSession }, error: null })),
    onAuthStateChange: jest.fn((callback: (event: AuthChangeEvent, session: Session | null) => void) => {
      callbacks.add(callback);
      return { data: { subscription: { unsubscribe: () => { callbacks.delete(callback); unsubscribe(); } } } };
    }),
    signInWithPassword: jest.fn(async (_credentials: { email: string; password: string }): Promise<{ data: { session: Session | null }; error: unknown }> => {
      const session = testSession();
      emit('SIGNED_IN', session);
      return { data: { session }, error: null };
    }),
    signOut: jest.fn(async (_options: { scope: string }): Promise<{ error: unknown }> => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    resetPasswordForEmail: jest.fn(async (_email: string): Promise<{ data: object | null; error: unknown }> => ({ data: {}, error: null })),
    verifyOtp: jest.fn(async (_params: { email: string; token: string; type: 'recovery' }): Promise<{ data: { session: Session | null; user: Session['user'] | null }; error: unknown }> => {
      const session = testSession();
      emit('PASSWORD_RECOVERY', session);
      return { data: { session, user: session.user }, error: null };
    }),
    getUser: jest.fn(async (): Promise<{ data: { user: Session['user'] | null }; error: unknown }> => ({ data: { user: savedSession?.user ?? null }, error: null })),
    updateUser: jest.fn(async (_params: { password: string }): Promise<{ data: { user: Session['user'] | null }; error: unknown }> => ({ data: { user: savedSession?.user ?? null }, error: null })),
  };
  return { auth, client: { auth } as unknown as SupabaseClient, emit, unsubscribe };
}
