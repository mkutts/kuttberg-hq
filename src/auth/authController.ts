import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getSupabaseClient } from '../supabase/client';
import { invalidCodeMessage, invalidRecoveryMessage, isRateLimit, normalizeRecoveryCode, passwordValidation, recoveryConfirmation, validRecoveryCode, validRecoveryEmail } from './recovery';
import { recoveryLock } from './recoveryLock';

export type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'unavailable' | 'recovering';
  session: Session | null;
  message: string | null;
  busy: 'signIn' | 'signOut' | 'requestRecovery' | 'verifyRecovery' | 'updatePassword' | 'cleanupRecovery' | null;
  recovery?: 'requesting' | 'code' | 'verifying' | 'authorized' | 'invalid' | 'cleanup';
  recoveryEmail?: string;
  requestAvailableAt?: number;
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

  async function verifyRecoveryCode(value: string) {
    if (!ready || !client || state.busy || recoveryWork || state.recovery !== 'code' || !state.recoveryEmail) return;
    const token = normalizeRecoveryCode(value);
    if (!validRecoveryCode(token)) {
      publish({ ...state, message: 'Enter the eight-digit code from your email.' });
      return;
    }
    const email = state.recoveryEmail;
    const attempt = generation;
    recoveryUser = undefined;
    passwordUpdated = false;
    publish({ ...state, recovery: 'verifying', busy: 'verifyRecovery', message: null });
    refresh(false);
    recoveryWork = (async () => {
      try {
        // A crash at ANY later await must never restore this session as normal access.
        await lock.set();
        await refreshWork;
        if (attempt !== generation) return;
        const { error: logoutError } = await client!.auth.signOut({ scope: 'local' });
        if (logoutError) throw logoutError;
        if (attempt !== generation) return;
        recoveryInterrupted = false;
        const { data, error } = await client!.auth.verifyOtp({ email, token, type: 'recovery' });
        if (attempt !== generation) return;
        if (recoveryInterrupted) { invalidateRecovery(); return; }
        if (error) {
          const code = typeof error === 'object' && 'code' in error ? error.code : null;
          publish({ ...state, recovery: 'code', message: isRateLimit(error)
            ? 'Too many attempts. Wait a few minutes before trying again.'
            : code === 'otp_expired' || code === 'validation_failed' || code === 'access_denied'
              ? invalidCodeMessage
              : 'Unable to verify this code. Check your connection and try the latest code, or request a replacement.' });
          return;
        }
        if (!data.session || !data.user?.id || data.session.user.id !== data.user.id ||
          data.user.email?.toLowerCase() !== email || data.session.user.email?.toLowerCase() !== email ||
          !data.session.access_token || !data.session.refresh_token || data.session.token_type !== 'bearer' ||
          !Number.isFinite(data.session.expires_at) || data.session.expires_at! * 1000 <= Date.now()) {
          invalidateRecovery(); return;
        }
        recoveryUser = data.user.id;
        recoveryDeadline = Math.min(data.session.expires_at! * 1000, Date.now() + 10 * 60_000);
        publish({ ...state, recovery: 'authorized', message: null });
      } catch {
        if (attempt === generation) {
          // A throw can occur after the SDK persisted a session. Require cleanup, not another exchange.
          invalidateRecovery();
        }
      } finally {
        if (attempt === generation) publish({ ...state, busy: null });
      }
    })().finally(() => { recoveryWork = undefined; });
    await recoveryWork;
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
        if (state.status === 'recovering') {
          // Only verifyOtp's response establishes recovery authority, never an SDK event.
          if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') recoveryInterrupted = true;
          if (state.recovery === 'verifying' && session &&
            (event !== 'PASSWORD_RECOVERY' || session.user.email?.toLowerCase() !== state.recoveryEmail)) recoveryInterrupted = true;
          if (state.recovery === 'authorized' && (event === 'SIGNED_OUT' || event === 'SIGNED_IN' ||
            (session && (session.user.id !== recoveryUser || session.user.email?.toLowerCase() !== state.recoveryEmail)))) invalidateRecovery();
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
          }
          return;
        } finally {
          recoveryWork = undefined;
        }
        if (attempt !== generation) return;
        publish({ status: 'signedOut', session: null, busy: null, message: 'Your reset was interrupted. Request a new code to continue.' });
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
    verifyRecoveryCode,
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
      if (!client || !ready || state.busy || recoveryWork ||
        (state.status !== 'signedOut' && state.status !== 'signedIn' && state.recovery !== 'code')) return null;
      if (!validRecoveryEmail(email)) return 'Enter a valid email address.';
      // Resends cannot change the identity bound to this flow.
      const address = email.trim().toLowerCase();
      if (state.recovery === 'code' && address !== state.recoveryEmail) return null;
      if (Date.now() < requestAfter) return 'Please wait a minute before requesting another recovery code.';
      requestAfter = Date.now() + 60_000;
      const attempt = generation;
      sessionBlocked = true;
      revision += 1;
      recoveryUser = undefined;
      passwordUpdated = false;
      publish({ status: 'recovering', session: null, recovery: 'requesting', recoveryEmail: address,
        requestAvailableAt: requestAfter, busy: 'requestRecovery', message: null });
      refresh(false);
      let result: string | null = null;
      recoveryWork = (async () => {
        try {
          await lock.set();
          await refreshWork;
          if (attempt !== generation) return;
          const { error: logoutError } = await client!.auth.signOut({ scope: 'local' });
          if (logoutError) throw logoutError;
          if (attempt !== generation) return;
          try {
            const { error } = await client!.auth.resetPasswordForEmail(address);
            if (error) throw error;
            result = recoveryConfirmation;
          } catch (error) {
            const code = typeof error === 'object' && error && 'code' in error ? error.code : null;
            result = isRateLimit(error) ? 'Too many requests. Wait a few minutes before trying again.'
              : code === 'user_not_found' || code === 'email_not_confirmed' || code === 'user_banned'
                ? recoveryConfirmation : 'Unable to request a recovery code. Check your connection and try again later.';
          }
          if (attempt === generation) publish({ ...state, recovery: 'code', message: result });
        } catch {
          if (attempt === generation) {
            publish({ ...state, recovery: 'cleanup', message: 'Unable to prepare secure recovery. Retry session cleanup before starting again.' });
          }
        } finally {
          if (attempt === generation) publish({ ...state, busy: null });
        }
      })().finally(() => { recoveryWork = undefined; });
      await recoveryWork;
      return attempt === generation ? result : null;
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
          if (error || data.user?.id !== user || data.user.email?.toLowerCase() !== state.recoveryEmail ||
            recoveryUser !== user || Date.now() >= recoveryDeadline) {
            invalidateRecovery(); return;
          }
          const result = await client!.auth.updateUser({ password });
          if (attempt !== generation) return;
          if (result.error) throw result.error;
          if (result.data.user?.id !== user || result.data.user.email?.toLowerCase() !== state.recoveryEmail || recoveryUser !== user) {
            invalidateRecovery(); throw new Error('Password update unconfirmed.');
          }
          passwordUpdated = true;
          recoveryUser = undefined;
          publish({ ...state, recovery: 'cleanup', message: null });
        } catch (error) {
          if (attempt === generation) publish({ ...state, message: isRateLimit(error)
            ? 'Too many attempts. Wait a few minutes and try again.'
            : 'Unable to confirm the password update. Use a different strong password and check your connection, or return to sign-in and request a new code.' });
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
        if (attempt === generation) publish({ ...state, busy: null });
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
        if (attempt === generation) publish({ ...state, busy: null });
      }
    },
  };
}

export const authController = createAuthController();
