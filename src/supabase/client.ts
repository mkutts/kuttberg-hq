import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getSupabaseConfig } from './config';
import { createSessionStorage } from './sessionStorage';

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const { url, publishableKey } = getSupabaseConfig();
  const { hostname, port } = new URL(url);
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

  client = createClient(url, publishableKey, {
    auth: {
      storageKey: `kuttberg.supabase.${hostname}.${port || '443'}.auth`,
      storage: isNative ? createSessionStorage({
        getItemAsync: (key) => SecureStore.getItemAsync(key, storageOptions),
        setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, storageOptions),
        deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, storageOptions),
      }) : undefined,
      persistSession: isNative,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
    },
  });

  return client;
}
