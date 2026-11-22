import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { ErrorState } from '../src/components/states/ErrorState';
import { LoadingState } from '../src/components/states/LoadingState';
import { AppScreen } from '../src/components/ui/AppScreen';
import { colors } from '../src/theme';
import { AppUpdatesProvider } from '../src/updates/useAppUpdates';

const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
    notification: colors.error,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={lightTheme}>
      <StatusBar style="dark" />
      <AppUpdatesProvider>
        <AuthProvider><AuthenticatedNavigation /></AuthProvider>
      </AppUpdatesProvider>
    </ThemeProvider>
  );
}

function AuthenticatedNavigation() {
  const { status, message, retry } = useAuth();
  if (status === 'loading') return <AppScreen><LoadingState message="Restoring your secure session…" /></AppScreen>;
  if (status === 'unavailable') {
    return <AppScreen><ErrorState title="Unable to restore session" message={message ?? undefined} onRetry={retry} /></AppScreen>;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'recovering'}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
    </Stack>
  );
}
