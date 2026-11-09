import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { AppCard } from '../../src/components/ui/AppCard';
import { AppScreen } from '../../src/components/ui/AppScreen';
import { AppText } from '../../src/components/ui/AppText';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { colors, radii, spacing } from '../../src/theme';

const upcomingSections = [
  { title: 'Up Next', description: 'Upcoming events and important dates will appear here.' },
  { title: 'Routines', description: 'Your daily routines will appear here.' },
  {
    title: 'Responsibilities',
    description: 'Household and property responsibilities will appear here.',
  },
  { title: 'Waiting On', description: "Follow-ups and things you're waiting on will appear here." },
] as const;

function getGreeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(useCallback(() => {
    const refresh = () => setNow(new Date());
    refresh();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []));

  return (
    <AppScreen scroll edges={['top', 'left', 'right']} contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.welcome}>
          <AppText variant="caption" style={styles.eyebrow}>
            {now.toLocaleDateString(undefined, { dateStyle: 'full' })}
          </AppText>
          <AppText variant="screenTitle" accessibilityRole="header">
            {getGreeting(now.getHours())}
          </AppText>
          <AppText variant="secondaryBody">Your day, at a glance.</AppText>
        </View>
        <Pressable
          accessibilityLabel="Settings"
          accessibilityRole="button"
          onPress={() => router.navigate('/settings')}
          style={({ pressed }) => [styles.settings, pressed && styles.settingsPressed]}
        >
          <Feather
            name="settings"
            size={22}
            color={colors.primary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>

      <AppCard style={styles.overview}>
        <SectionHeader
          title="Your daily overview"
          description="Your priorities and household updates will appear here as Kuttberg HQ takes shape."
        />
      </AppCard>

      <AppCard style={styles.upcoming}>
        <AppText variant="caption" style={styles.eyebrow}>Coming later</AppText>
        {upcomingSections.map(({ title, description }) => (
          <View key={title} style={styles.upcomingRow}>
            <SectionHeader title={title} description={description} />
          </View>
        ))}
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  welcome: { flex: 1, gap: spacing.xs },
  settings: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.button,
  },
  settingsPressed: { backgroundColor: colors.secondaryPressed },
  eyebrow: { color: colors.primary, fontWeight: '600' },
  overview: {
    backgroundColor: colors.secondaryPressed,
    borderColor: colors.primary,
    paddingVertical: spacing['2xl'],
  },
  upcoming: { gap: spacing.md },
  upcomingRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
});
