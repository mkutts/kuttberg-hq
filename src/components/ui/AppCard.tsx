import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radii, spacing } from '../../theme';

type AppCardProps = ViewProps & { bordered?: boolean };

export function AppCard({ bordered = true, style, ...props }: AppCardProps) {
  return <View {...props} style={[styles.card, bordered && styles.border, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.xl,
  },
  border: { borderWidth: 1, borderColor: colors.border },
});
