import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getSupabaseClient } from '../supabase/client';
import { invalidRecoveryMessage, isRateLimit, passwordValidation, recoveryConfirmation, recoveryRedirectUrl, type RecoveryLink, validRecoveryEmail } from './recovery';
import { recoveryLock } from './recoveryLock';

export type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'unavailable' | 'recovering';
  session: Session | null;
  message: string | null;
  busy: 'signIn' | 'signOut' | 'requestRecovery' | 'verifyRecovery' | 'updatePassword' | 'cleanupRecovery' | null;
  recovery?: 'verifying' | 'authorized' | 'invalid' | 'cleanup';
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
export function createAuthController(getClient: () => SupabaseClient = getSupabaseClient, lock = recoveryLock) {
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
  let pendingRecovery: RecoveryLink | undefined;
  let recoveryWork: Promise<void> | undefined;
  let sessionWork: Promise<unknown> | undefined;
  let recoveryUser: string | undefined;
  let recoveryDeadline = 0;
  let recoveryInterrupted = false;
  let requestAfter = 0;
  let passwordUpdated = false;

  function publish(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (!listeners.size || !active || state.busy) return;
    if (state.recovery === 'authorized') {
      timer = setTimeout(() => invalidateRecovery(), Math.max(1, recoveryDeadline - Date.now()));
    } else if (state.status === 'signedIn' && state.session?.expires_at) {
      const remaining = state.session.expires_at * 1000 - Date.now();
      timer = setTimeout(() => void restore(), Math.min(Math.max(remaining, 1), 2_147_483_647));
    } else if (state.status === 'unavailable') {
      timer = setTimeout(() => void restore(), 30_000);
    }
  }

  function applySession(session: Session | null, message: string | null = null) {
    if (state.status === 'recovering') return;
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
    if (!client || reading || state.busy || !ready || sessionBlocked || state.status === 'recovering') return;
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

  function invalidateRecovery() {
    recoveryUser = undefined;
    publish({ ...state, status: 'recovering', session: null, recovery: 'invalid', message: invalidRecoveryMessage });
  }

  async function removeRecoverySession() {
    const { error } = await client!.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await lock.clear();
  }

  function drainRecovery() {
    if (!ready || !client || !pendingRecovery || state.busy || recoveryWork) return;
    const link = pendingRecovery;
    pendingRecovery = undefined;
    const attempt = generation;
    recoveryUser = undefined;
    passwordUpdated = false;
    publish({ status: 'recovering', session: null, recovery: 'verifying', busy: 'verifyRecovery', message: null });
    refresh(false);
    recoveryWork = (async () => {
      try {
        // A crash at ANY later await must never restore this session as normal access.
        await lock.set();
        await refreshWork;
        if (attempt !== generation) return;
        if ('invalid' in link) throw new Error('Invalid recovery link.');
        const { error: logoutError } = await client!.auth.signOut({ scope: 'local' });
        if (logoutError) throw logoutError;
        if (attempt !== generation) return;
        recoveryInterrupted = false;
        const { data, error } = await client!.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' });
        if (attempt !== generation) return;
        if (error || recoveryInterrupted || !data.session || !data.user || data.session.user.id !== data.user.id ||
          !data.session.expires_at || data.session.expires_at * 1000 <= Date.now()) throw new Error('Recovery verification failed.');
        recoveryUser = data.user.id;
        recoveryDeadline = Math.min(data.session.expires_at * 1000, Date.now() + 10 * 60_000);
        publish({ status: 'recovering', session: null, recovery: 'authorized', busy: null, message: null });
      } catch {
        if (attempt === generation) {
          invalidateRecovery();
          publish({ ...state, busy: null });
        }
      }
    })().finally(() => { recoveryWork = undefined; });
  }

  function receiveRecoveryLink(link: RecoveryLink) {
    // Duplicate deliveries cannot consume another token or interrupt a password update.
    if (state.status === 'recovering' || recoveryWork) return;
    pendingRecovery = link;
    sessionBlocked = true;
    revision += 1;
    publish({ ...state, status: 'recovering', session: null, recovery: 'verifying', message: null });
    drainRecovery();
  }

  async function finishRecovery() {
    if (!client || !ready || state.busy || recoveryWork || state.status !== 'recovering') return;
    const attempt = generation;
    recoveryUser = undefined;
    sessionBlocked = true;
    revision += 1;
    publish({ status: 'recovering', session: null, recovery: 'cleanup', busy: 'cleanupRecovery', message: null });
    recoveryWork = (async () => {
      try {
        await removeRecoverySession();
        if (attempt !== generation) return;
        publish({ status: 'signedOut', session: null, busy: null,
          message: passwordUpdated ? 'Your password has been updated. Sign in with your new password.' : null });
        passwordUpdated = false;
      } catch {
        if (attempt === generation) publish({ ...state, busy: null,
          message: passwordUpdated ? 'Your password was updated, but session cleanup did not finish. Reconnect and retry cleanup.' : 'Session cleanup did not finish. Reconnect and retry cleanup.' });
      }
    })().finally(() => { recoveryWork = undefined; });
    await recoveryWork;
  }

  async function start() {
    const attempt = ++generation;
    ready = false;
    reading = false;
    sessionBlocked = Boolean(pendingRecovery);
    active = AppState.currentState === 'active';
    publish({ status: 'loading', session: null, message: null, busy: null });
    try {
      client = getClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (attempt !== generation || event === 'INITIAL_SESSION') return;
        // INITIAL_SESSION(null) can also mean a network/storage failure. getSession owns hydration.
        revision += 1;
        if (!ready) return;
        if (state.status === 'recovering') {
          // Only verifyOtp's response establishes recovery authority, never an SDK event.
          if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') recoveryInterrupted = true;
          if (state.recovery === 'authorized' && (event === 'SIGNED_OUT' || event === 'SIGNED_IN' ||
            (session && session.user.id !== recoveryUser))) invalidateRecovery();
          return;
        }
        if (event === 'PASSWORD_RECOVERY') return;
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
          refresh(active && state.status !== 'recovering');
          if (active && state.recovery === 'authorized' && Date.now() >= recoveryDeadline) invalidateRecovery();
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
      // A previous lifecycle may still be finishing an SDK write; await it before reading the barrier.
      await sessionWork?.catch(() => undefined);
      await recoveryWork?.catch(() => undefined);
      if (attempt !== generation) return;
      const interrupted = await lock.read();
      if (attempt !== generation) return;
      ready = true;
      if (interrupted) {
        sessionBlocked = true;
        publish({ status: 'recovering', session: null, recovery: 'cleanup', busy: 'cleanupRecovery', message: null });
        try {
          recoveryWork = removeRecoverySession();
          await recoveryWork;
        } catch {
          if (attempt === generation) {
            publish({ ...state, busy: null, message: 'An interrupted reset needs session cleanup. Reconnect and retry cleanup.' });
            pendingRecovery = undefined;
          }
          return;
        } finally {
          recoveryWork = undefined;
        }
        if (attempt !== generation) return;
        publish({ status: 'signedOut', session: null, busy: null, message: 'Your reset was interrupted. Request a new link to continue.' });
      }
      if (pendingRecovery) {
        publish({ status: 'recovering', session: null, recovery: 'verifying', busy: null, message: null });
        drainRecovery();
        return;
      }
      await restore();
      if (attempt === generation) refresh(active && state.status !== 'recovering');
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
    recoveryUser = undefined;
    // A provider remount must render loading before its subscription effect runs.
    state = { status: 'loading', session: null, message: null, busy: null };
  }

  return {
    receiveRecoveryLink,
    finishRecovery,
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
    async requestRecovery(email: string): Promise<string | null> {
      if (!client || !ready || state.busy || state.status !== 'signedOut') return null;
      if (!validRecoveryEmail(email)) return 'Enter a valid email address.';
      if (Date.now() < requestAfter) return 'Please wait a minute before requesting another reset email.';
      requestAfter = Date.now() + 60_000;
      const attempt = generation;
      publish({ ...state, busy: 'requestRecovery', message: null });
      try {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirectUrl });
        if (error) throw error;
        return recoveryConfirmation;
      } catch (error) {
        if (isRateLimit(error)) return 'Too many requests. Wait a few minutes before trying again.';
        // Account-specific responses receive exactly the same confirmation as a successful request.
        const code = typeof error === 'object' && error && 'code' in error ? error.code : null;
        if (code === 'user_not_found' || code === 'email_not_confirmed' || code === 'user_banned') return recoveryConfirmation;
        return 'Unable to request a reset email. Check your connection and try again later.';
      } finally {
        if (attempt === generation) { publish({ ...state, busy: null }); drainRecovery(); }
      }
    },
    async updateRecoveryPassword(password: string, confirmation: string) {
      if (!client || !ready || state.busy || state.recovery !== 'authorized' || !recoveryUser) return;
      if (Date.now() >= recoveryDeadline) { invalidateRecovery(); return; }
      const validation = passwordValidation(password, confirmation);
      if (validation) { publish({ ...state, message: validation }); return; }
      const attempt = generation;
      const user = recoveryUser;
      publish({ ...state, busy: 'updatePassword', message: null });
      recoveryWork = (async () => {
        try {
          // Revalidate the SDK's CURRENT user before modifying it. No session-switching API runs concurrently.
          const { data, error } = await client!.auth.getUser();
          if (attempt !== generation) return;
          if (error || data.user?.id !== user || recoveryUser !== user || Date.now() >= recoveryDeadline) {
            invalidateRecovery(); return;
          }
          const result = await client!.auth.updateUser({ password });
          if (attempt !== generation) return;
          if (result.error) throw result.error;
          passwordUpdated = true;
          recoveryUser = undefined;
          publish({ ...state, recovery: 'cleanup', message: null });
        } catch (error) {
          if (attempt === generation) publish({ ...state, message: isRateLimit(error)
            ? 'Too many attempts. Wait a few minutes and try again.'
            : 'Unable to confirm the password update. Use a different strong password and check your connection, or request a new link.' });
        } finally {
          if (attempt === generation) publish({ ...state, busy: null });
        }
      })().finally(() => { recoveryWork = undefined; });
      await recoveryWork;
      if (attempt === generation && passwordUpdated) await finishRecovery();
    },
    async signIn(email: string, password: string) {
      if (!client || state.busy || state.status !== 'signedOut') return;
      const attempt = generation;
      const observedRevision = ++revision;
      sessionBlocked = false;
      publish({ ...state, busy: 'signIn', message: null });
      try {
        const work = client.auth.signInWithPassword({ email: email.trim(), password });
        sessionWork = work;
        const { data, error } = await work;
        if (error) throw error;
        if (!data.session) throw new Error('No session returned.');
        if (attempt === generation && observedRevision === revision) applySession(data.session);
      } catch (error) {
        if (attempt === generation && observedRevision === revision) {
          publish({ ...state, message: signInMessage(error) });
        }
      } finally {
        sessionWork = undefined;
        if (attempt === generation) { publish({ ...state, busy: null }); drainRecovery(); }
      }
    },
    async signOut() {
      if (!client || !ready || state.busy || state.status === 'recovering') return;
      const attempt = generation;
      revision += 1;
      publish({ ...state, busy: 'signOut', message: null });
      try {
        // Global scope reports network failure before removing local storage in the installed SDK.
        // The Settings copy explicitly explains that this also signs out other devices.
        const work = client.auth.signOut({ scope: 'global' });
        sessionWork = work;
        const { error } = await work;
        if (error) throw error;
        if (attempt === generation) {
          sessionBlocked = true;
          applySession(null);
        }
      } catch {
        if (attempt === generation) publish({ ...state, message: signOutMessage });
      } finally {
        sessionWork = undefined;
        if (attempt === generation) { publish({ ...state, busy: null }); drainRecovery(); }
      }
    },
  };
}

export const authController = createAuthController();
