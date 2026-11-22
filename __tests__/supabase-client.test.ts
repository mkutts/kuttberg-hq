import { Platform } from 'react-native';

const mockCreateClient = jest.fn();
const mockGetItem = jest.fn(async () => null);
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();

jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });
jest.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }), { virtual: true });
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: mockGetItem,
  setItemAsync: mockSetItem,
  deleteItemAsync: mockDeleteItem,
}), { virtual: true });

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('validates on first use, then lazily creates one client with native-only persistence', () => {
  const testEnvironment = { ...process.env };
  delete testEnvironment.EXPO_PUBLIC_SUPABASE_URL;
  delete testEnvironment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  jest.replaceProperty(process, 'env', testEnvironment);
  const createdClient = {};
  mockCreateClient.mockReturnValue(createdClient);

  jest.isolateModules(() => {
    const { getSupabaseClient } = jest.requireActual<typeof import('../src/supabase/client')>('../src/supabase/client');
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(() => getSupabaseClient()).toThrow('Missing Supabase configuration');
    expect(mockCreateClient).not.toHaveBeenCalled();

    const url = 'https://example-project.supabase.co';
    const publishableKey = `sb_publishable_${'test'.repeat(6)}`;
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;

    expect(getSupabaseClient()).toBe(createdClient);
    expect(getSupabaseClient()).toBe(createdClient);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
    expect(mockCreateClient).toHaveBeenCalledWith(url, publishableKey, {
      auth: {
        storageKey: 'kuttberg.supabase.example-project.supabase.co.443.auth',
        storage: isNative ? expect.any(Object) : undefined,
        persistSession: isNative,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        skipAutoInitialize: true,
      },
    });
    expect(mockGetItem).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });
});
