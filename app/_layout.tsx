import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
        </Stack>
      </AppUpdatesProvider>
    </ThemeProvider>
  );
}
