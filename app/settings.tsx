import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import config from '../app.json';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppScreen } from '../src/components/ui/AppScreen';
import { AppText } from '../src/components/ui/AppText';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { colors, spacing } from '../src/theme';

const futurePreferences = ['Notifications', 'Appearance preferences', 'Account settings'];

export default function SettingsScreen() {
  const { name, version } = config.expo;

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
        <AppText variant="caption">Version {version}</AppText>
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
        description="Private accounts and household data synchronization are planned for later milestones."
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing.xl },
  back: { alignSelf: 'flex-start', maxWidth: '100%' },
  appInfo: { backgroundColor: colors.secondaryPressed, gap: spacing.sm },
  preferences: { gap: spacing.md },
  preference: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
