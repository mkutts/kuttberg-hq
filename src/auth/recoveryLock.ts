import * as SecureStore from 'expo-secure-store';

// Non-secret crash barrier. Written BEFORE the SDK can persist a recovery session.
// It contains no email, password, URL, token, or user identifier.
const key = 'kuttberg.auth.recovery-in-progress';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const recoveryLock = {
  read: async () => Boolean(await SecureStore.getItemAsync(key, options)),
  set: () => SecureStore.setItemAsync(key, '1', options),
  clear: () => SecureStore.deleteItemAsync(key, options),
};
