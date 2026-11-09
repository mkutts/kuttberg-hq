import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme';
import { AppButton } from '../ui/AppButton';
import { SectionHeader } from '../ui/SectionHeader';

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something didn’t load',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.content}>
      <SectionHeader title={title} description={message} />
      {onRetry && <AppButton label="Try again" onPress={onRetry} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'flex-start', gap: spacing.md },
});
