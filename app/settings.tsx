import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import config from '../app.json';
import { useAuth } from '../src/auth/AuthProvider';
import { AppUpdatesSection } from '../src/components/AppUpdatesSection';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppScreen } from '../src/components/ui/AppScreen';
import { AppText } from '../src/components/ui/AppText';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { colors, spacing } from '../src/theme';

const futurePreferences = ['Notifications', 'Appearance preferences', 'Account settings'];

export default function SettingsScreen() {
  const { name } = config.expo;
  const { signOut, busy, message } = useAuth();

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.back}>
        <AppButton
          label="Back to Today"
          variant="secondary"
          onPress={() => router.dismissTo('/')}
        />
      </View>
      <AppText variant="screenTitle" accessibilityRole="header">Settings</AppText>

      <AppCard style={styles.appInfo}>
        <SectionHeader title={name} description="Your household command center." />
      </AppCard>

      <AppUpdatesSection />

      <AppCard style={styles.preferences}>
        <SectionHeader title="Your session" description="Sign out securely on this device and end your other signed-in sessions." />
        {message && <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.error }}>{message}</AppText>}
        <AppButton label={busy === 'signOut' ? 'Signing out…' : 'Sign out'}
          loading={busy === 'signOut'} onPress={() => void signOut()} variant="secondary" />
      </AppCard>

      <AppCard style={styles.preferences}>
        <SectionHeader title="Future preferences" />
        {futurePreferences.map((label) => (
          <View key={label} style={styles.preference}>
            <AppText>{label}</AppText>
            <AppText variant="caption">Coming later</AppText>
          </View>
        ))}
      </AppCard>

      <SectionHeader
        title="Privacy"
        description="Your session is stored securely on this device. Household data access is enforced by the server; synchronization is planned for a later task."
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing.xl },
  back: { alignSelf: 'flex-start', maxWidth: '100%' },
  appInfo: { backgroundColor: colors.secondaryPressed },
  preferences: { gap: spacing.md },
  preference: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
