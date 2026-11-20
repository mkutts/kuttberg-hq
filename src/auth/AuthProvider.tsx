import { createContext, type PropsWithChildren, useContext, useSyncExternalStore } from 'react';

import { authController } from './authController';

const AuthContext = createContext<ReturnType<typeof useAuthValue> | null>(null);

function useAuthValue() {
  const state = useSyncExternalStore(authController.subscribe, authController.getSnapshot);
  return { ...state, signIn: authController.signIn, signOut: authController.signOut, retry: authController.retry,
    requestRecovery: authController.requestRecovery, verifyRecoveryCode: authController.verifyRecoveryCode,
    updateRecoveryPassword: authController.updateRecoveryPassword,
    finishRecovery: authController.finishRecovery };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthValue();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
