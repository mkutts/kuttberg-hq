export type SupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

type SupabaseEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export function parseSupabaseConfig(env: SupabaseEnvironment): SupabaseConfig {
  const { EXPO_PUBLIC_SUPABASE_URL: rawUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: rawKey } = env;
  const url = rawUrl?.trim();
  const publishableKey = rawKey?.trim();

  if (!url || !publishableKey) {
    const missing = [
      !url && 'EXPO_PUBLIC_SUPABASE_URL',
      !publishableKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ].filter(Boolean);
    throw new Error(`Missing Supabase configuration: ${missing.join(', ')}. See .env.example.`);
  }

  let projectUrl: URL;
  try {
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url)) {
      throw new Error();
    }
    projectUrl = new URL(url);
    // Require a host with nonempty DNS labels. The Dashboard supplies an HTTPS origin.
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(projectUrl.hostname)) {
      throw new Error();
    }
  } catch {
    throw new Error('Invalid EXPO_PUBLIC_SUPABASE_URL. Use the HTTPS project origin from Supabase Connect.');
  }

  if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey)) {
    throw new Error('Invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Use the publishable API key from Supabase Connect.');
  }

  return { url: projectUrl.origin, publishableKey };
}

export function getSupabaseConfig(): SupabaseConfig {
  return parseSupabaseConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
