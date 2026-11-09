import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../theme';
import { AppButton } from '../ui/AppButton';
import { SectionHeader } from '../ui/SectionHeader';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ComponentProps<typeof Feather>['name'];
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <View style={styles.content}>
      {icon && (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Feather name={icon} size={24} color={colors.primary} />
        </View>
      )}
      <SectionHeader title={title} description={description} />
      {action && <AppButton label={action.label} onPress={action.onPress} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'flex-start', gap: spacing.md },
});
