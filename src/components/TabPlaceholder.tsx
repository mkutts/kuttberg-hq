import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { AppCard } from './ui/AppCard';
import { AppScreen } from './ui/AppScreen';
import { AppText } from './ui/AppText';
import { SectionHeader } from './ui/SectionHeader';

type TabPlaceholderProps = {
  title: string;
  description: string;
  future: string;
  icon: ComponentProps<typeof Feather>['name'];
};

export function TabPlaceholder({ title, description, future, icon }: TabPlaceholderProps) {
  return (
    <AppScreen scroll edges={['top', 'left', 'right']} contentStyle={styles.content}>
      <View style={styles.intro}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.icon}
        >
          <Feather name={icon} size={24} color={colors.primary} />
        </View>
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
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing['2xl'] },
  intro: { gap: spacing.xs },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    backgroundColor: colors.secondaryPressed,
    borderRadius: radii.button,
  },
});
