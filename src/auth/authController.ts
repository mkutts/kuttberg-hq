import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getSupabaseClient } from '../supabase/client';

export type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'unavailable';
  session: Session | null;
  message: string | null;
  busy: 'signIn' | 'signOut' | null;
};

const restoreMessage = 'We couldn’t restore your session. Check your connection and try again. Your saved session has not been intentionally removed.';
const signOutMessage = 'Sign-out did not complete. Check your connection and try again.';

function signInMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (code === 'invalid_credentials') return 'Unable to sign in. Check your email and password and try again.';
  if (code === 'over_request_rate_limit') return 'Too many attempts. Wait a moment and try again.';
  // Never render the server's message, request, account identifiers, or credentials.
  return 'We couldn’t sign you in. Check your connection and account details, then try again.';
}

/** One controller owns the existing client; React consumers only subscribe to its state. */
export function createAuthController(getClient: () => SupabaseClient = getSupabaseClient) {
  let state: AuthState = { status: 'loading', session: null, message: null, busy: null };
  const listeners = new Set<() => void>();
  let client: SupabaseClient | undefined;
  let cleanup: (() => void) | undefined;
  let generation = 0;
  let revision = 0;
  let ready = false;
  let reading = false;
  let sessionBlocked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshWork = Promise.resolve();
  let active = AppState.currentState === 'active';

  function publish(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (!listeners.size || !active || state.busy) return;
    if (state.status === 'signedIn' && state.session?.expires_at) {
      const remaining = state.session.expires_at * 1000 - Date.now();
      timer = setTimeout(() => void restore(), Math.min(Math.max(remaining, 1), 2_147_483_647));
    } else if (state.status === 'unavailable') {
      timer = setTimeout(() => void restore(), 30_000);
    }
  }

  function applySession(session: Session | null, message: string | null = null) {
    if (session && (!session.expires_at || session.expires_at * 1000 <= Date.now())) {
      publish({ ...state, status: 'unavailable', session, message: restoreMessage });
    } else {
      publish({ ...state, status: session ? 'signedIn' : 'signedOut', session, message });
    }
  }

  function refresh(enabled: boolean) {
    const auth = client?.auth;
    if (!auth) return;
    // Serialize asynchronous start/stop calls so rapid AppState changes cannot leave a stale ticker.
    refreshWork = refreshWork.then(() => enabled ? auth.startAutoRefresh() : auth.stopAutoRefresh())
      .catch(() => { /* Restoration reports failures without logging SDK errors. */ });
  }

  async function restore() {
    if (!client || reading || state.busy || !ready || sessionBlocked) return;
    reading = true;
    const attempt = generation;
    const observedRevision = revision;
    if (state.status !== 'signedIn' || (state.session?.expires_at ?? 0) * 1000 <= Date.now()) {
      publish({ ...state, status: 'loading', message: null });
    }
    try {
      const { data, error } = await client.auth.getSession();
      if (attempt !== generation || observedRevision !== revision) return;
      if (error) throw error;
      applySession(data.session);
    } catch {
      if (attempt === generation && observedRevision === revision) {
        publish({ ...state, status: 'unavailable', message: restoreMessage });
      }
    } finally {
      if (attempt === generation) {
        reading = false;
        schedule();
      }
    }
  }

  async function start() {
    const attempt = ++generation;
    ready = false;
    reading = false;
    sessionBlocked = false;
    active = AppState.currentState === 'active';
    publish({ status: 'loading', session: null, message: null, busy: null });
    try {
      client = getClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (attempt !== generation || event === 'INITIAL_SESSION') return;
        // INITIAL_SESSION(null) can also mean a network/storage failure. getSession owns hydration.
        revision += 1;
        if (!ready) return;
        // After confirmed local sign-out, queued session events cannot reopen access.
        // This app only starts a new session through an explicit password sign-in.
        if (sessionBlocked && event !== 'SIGNED_OUT') return;
        const failure = state.message === signOutMessage ? signOutMessage : null;
        if (event === 'SIGNED_OUT') {
          sessionBlocked = true;
          applySession(null, failure ?? (state.busy === 'signOut' ? null : 'Your session ended. Please sign in again.'));
        } else {
          applySession(session, failure);
        }
        // Keep this callback synchronous: never await another auth call inside an auth event.
      });
      const appSubscription = AppState.addEventListener('change', (next) => {
        const wasActive = active;
        active = next === 'active';
        if (ready && active !== wasActive) {
          refresh(active);
          if (active) void restore();
        }
        schedule();
      });
      cleanup = () => {
        subscription.unsubscribe();
        appSubscription.remove();
        refresh(false);
      };
      const { error } = await client.auth.initialize();
      if (attempt !== generation) return;
      if (error) throw error;
      ready = true;
      await restore();
      if (attempt === generation) refresh(active);
    } catch {
      if (attempt === generation) {
        publish({ ...state, status: 'unavailable', message: 'Secure sign-in is unavailable. Check the app configuration and connection, then try again.' });
      }
    }
  }

  function stop() {
    generation += 1;
    ready = false;
    clearTimeout(timer);
    cleanup?.();
    cleanup = undefined;
    // A provider remount must render loading before its subscription effect runs.
    state = { status: 'loading', session: null, message: null, busy: null };
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) void start();
      return () => {
        if (listeners.delete(listener) && !listeners.size) stop();
      };
    },
    retry() {
      if (!ready) {
        stop();
        void start();
      } else {
        void restore();
      }
    },
    async signIn(email: string, password: string) {
      if (!client || state.busy || state.status !== 'signedOut') return;
      const attempt = generation;
      const observedRevision = ++revision;
      sessionBlocked = false;
      publish({ ...state, busy: 'signIn', message: null });
      try {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) throw new Error('No session returned.');
        if (attempt === generation && observedRevision === revision) applySession(data.session);
      } catch (error) {
        if (attempt === generation && observedRevision === revision) {
          publish({ ...state, message: signInMessage(error) });
        }
      } finally {
        if (attempt === generation) publish({ ...state, busy: null });
      }
    },
    async signOut() {
      if (!client || state.busy) return;
      const attempt = generation;
      revision += 1;
      publish({ ...state, busy: 'signOut', message: null });
      try {
        // Global scope reports network failure before removing local storage in the installed SDK.
        // The Settings copy explicitly explains that this also signs out other devices.
        const { error } = await client.auth.signOut({ scope: 'global' });
        if (error) throw error;
        if (attempt === generation) {
          sessionBlocked = true;
          applySession(null);
        }
      } catch {
        if (attempt === generation) publish({ ...state, message: signOutMessage });
      } finally {
        if (attempt === generation) publish({ ...state, busy: null });
      }
    },
  };
}

export const authController = createAuthController();
