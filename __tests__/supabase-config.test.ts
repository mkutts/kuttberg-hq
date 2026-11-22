import { parseSupabaseConfig } from '../src/supabase/config';

const config = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'test'.repeat(6)}`,
};

test('normalizes a valid HTTPS project origin', () => {
  expect(parseSupabaseConfig({ ...config, EXPO_PUBLIC_SUPABASE_URL: ' https://db.example.com:8443/ ' })).toEqual({
    url: 'https://db.example.com:8443',
    publishableKey: config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
});

test('names missing settings', () => {
  expect(() => parseSupabaseConfig({})).toThrow(
    'Missing Supabase configuration: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
  expect(() => parseSupabaseConfig({ ...config, EXPO_PUBLIC_SUPABASE_URL: ' ' })).toThrow(
    'Missing Supabase configuration: EXPO_PUBLIC_SUPABASE_URL.',
  );
});

test.each([
  'http://project.supabase.co',
  'https://username:password@project.supabase.co',
  'https://project.supabase.co/rest/v1',
  'https://project.supabase.co?key=value',
  'https://project.supabase.co#fragment',
  'https://project..supabase.co',
  'https://project.supabase.co:99999',
])('rejects an invalid project origin %s without echoing it', (url) => {
  expect(() => parseSupabaseConfig({ ...config, EXPO_PUBLIC_SUPABASE_URL: url })).toThrow(
    /^Invalid EXPO_PUBLIC_SUPABASE_URL\. Use the HTTPS project origin from Supabase Connect\.$/,
  );
});

test.each(['sb_secret_REDACTED', 'eyJhbGciOiJIUzI1NiJ9.test.test', 'sb_publishable_', 'YOUR_SUPABASE_PUBLISHABLE_KEY'])(
  'rejects non-publishable or placeholder keys without echoing them',
  (key) => {
    expect(() => parseSupabaseConfig({ ...config, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(
      /^Invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY\. Use the publishable API key from Supabase Connect\.$/,
    );
  },
);
