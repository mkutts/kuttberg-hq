import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../theme';
import { AppText } from '../ui/AppText';

type LoadingStateProps = { message?: string };

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={styles.content}
    >
      <ActivityIndicator
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        color={colors.primary}
        style={styles.indicator}
      />
      <AppText
        accessibilityElementsHidden
        importantForAccessibility="no"
        variant="secondaryBody"
      >
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  indicator: { alignSelf: 'flex-start' },
});
