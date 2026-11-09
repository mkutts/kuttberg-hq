import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme';
import { AppText } from './AppText';

type SectionHeaderProps = { title: string; description?: string };

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <AppText variant="sectionHeading" accessibilityRole="header">{title}</AppText>
      {description && <AppText variant="secondaryBody">{description}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({ header: { gap: spacing.xs } });
