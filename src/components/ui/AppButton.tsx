import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, radii, spacing } from '../../theme';
import { AppText } from './AppText';

type AppButtonProps = Pick<PressableProps, 'onPress' | 'accessibilityLabel' | 'accessibilityHint'> & {
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
};

export function AppButton({
  label,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel = label,
  accessibilityHint,
  onPress,
}: AppButtonProps) {
  const [focused, setFocused] = useState(false);
  const unavailable = disabled || loading;
  const primary = variant === 'primary';
  const labelColor = unavailable ? colors.disabledContent : primary ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        unavailable && styles.disabled,
        focused && !unavailable && styles.focused,
      ]}
    >
      {loading && (
        <ActivityIndicator accessible={false} color={labelColor} testID="app-button-spinner" />
      )}
      <AppText variant="buttonLabel" style={[styles.label, { color: labelColor }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.button,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  label: { flexShrink: 1, textAlign: 'center' },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.elevated, borderColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondaryPressed: { backgroundColor: colors.secondaryPressed },
  disabled: { backgroundColor: colors.disabledBackground, borderColor: 'transparent' },
  focused: { outlineColor: colors.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
});
