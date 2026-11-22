import { type PropsWithChildren, useEffect } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';

import { AppCard } from '../components/ui/AppCard';
import { AppScreen } from '../components/ui/AppScreen';
import { AppText } from '../components/ui/AppText';
import { colors, radii, spacing, typography } from '../theme';

export function RecoveryForm({ title, children }: PropsWithChildren<{ title: string }>) {
  return <AppScreen scroll contentStyle={recoveryStyles.content}>
    <View style={recoveryStyles.brand}>
      <Image source={require('../../assets/images/KuttbergHQ_Splash_Screen_Logo_1024_Transparent.png')}
        style={recoveryStyles.logo} resizeMode="contain" accessible={false} />
      <AppText variant="screenTitle" accessibilityRole="header">Kuttberg HQ</AppText>
    </View>
    <AppCard style={recoveryStyles.form}>
      <AppText variant="sectionHeading" accessibilityRole="header">{title}</AppText>
      {children}
    </AppCard>
  </AppScreen>;
}

export function RecoveryMessage({ message }: { message: string | null }) {
  useEffect(() => { if (message) AccessibilityInfo.announceForAccessibility(message); }, [message]);
  return message ? <AppText accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</AppText> : null;
}

export const recoveryStyles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: { width: 120, height: 120 },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  input: { ...typography.body, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radii.input, backgroundColor: colors.elevated, color: colors.text },
});
