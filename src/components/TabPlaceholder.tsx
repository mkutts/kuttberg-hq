import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { AppCard } from './ui/AppCard';
import { AppScreen } from './ui/AppScreen';
import { AppText } from './ui/AppText';
import { SectionHeader } from './ui/SectionHeader';

type TabPlaceholderProps = {
  title: string;
  description: string;
  future: string;
};

export function TabPlaceholder({ title, description, future }: TabPlaceholderProps) {
  return (
    <AppScreen scroll edges={['top', 'left', 'right']} contentStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="screenTitle" accessibilityRole="header">{title}</AppText>
        <AppText variant="secondaryBody">{description}</AppText>
      </View>
      <AppCard>
        <SectionHeader title="Coming soon" description={future} />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing['2xl'] },
  intro: { gap: spacing.xs },
});
