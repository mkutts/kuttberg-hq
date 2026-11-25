import { router } from 'expo-router';

import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppScreen } from '../../src/components/ui/AppScreen';
import { AppText } from '../../src/components/ui/AppText';
import { destinations } from '../../src/destinations';
import { spacing } from '../../src/theme';
import { StyleSheet, View } from 'react-native';

export default function InboxScreen() {
  return (
    <AppScreen scroll edges={['top', 'left', 'right']} contentStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="screenTitle" accessibilityRole="header">{destinations.inbox.title}</AppText>
        <AppText variant="secondaryBody">{destinations.inbox.description}</AppText>
      </View>
      <AppCard style={styles.card}>
        <AppText variant="cardTitle">Quick Capture</AppText>
        <AppText variant="secondaryBody">Save a task to your private Inbox in a few seconds.</AppText>
        <AppButton label="Capture a task" accessibilityHint="Open Quick Capture" onPress={() => router.push('/quick-capture')} />
      </AppCard>
      <AppCard>
        <AppText variant="cardTitle" accessibilityRole="header">Coming soon</AppText>
        <AppText variant="secondaryBody">Your captured tasks will appear here in Task 04.</AppText>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing['2xl'] },
  intro: { gap: spacing.xs },
  card: { gap: spacing.md },
});
