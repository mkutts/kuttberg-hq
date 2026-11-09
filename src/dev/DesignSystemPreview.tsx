import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { AppScreen } from '../components/ui/AppScreen';
import { AppText } from '../components/ui/AppText';
import { SectionHeader } from '../components/ui/SectionHeader';
import { colors, palette, radii, spacing } from '../theme';

const swatches = [
  { name: 'Warm cream', color: palette.cream },
  { name: 'Sage green', color: palette.sage },
  { name: 'Muted peach', color: palette.peach },
  { name: 'Soft lavender', color: palette.lavender },
  { name: 'Soft gold', color: palette.gold },
];

export default function DesignSystemPreview() {
  const [previewActive, setPreviewActive] = useState(false);

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.intro}>
        <AppText variant="caption" style={styles.eyebrow}>DESIGN SYSTEM PREVIEW</AppText>
        <AppText variant="screenTitle" accessibilityRole="header">Kuttberg HQ</AppText>
        <AppText variant="body" style={styles.supportingText}>
          A warm, readable foundation for the household command center.
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Type & surfaces"
          description="System type, comfortable spacing, and a quiet card surface."
        />
        <AppCard style={styles.sample}>
          <AppText variant="cardTitle">Sample card</AppText>
          <AppText>Body text for everyday reading.</AppText>
          <AppText variant="secondaryBody">Secondary text adds supporting detail.</AppText>
          <AppText variant="caption">Captions label small details.</AppText>
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Buttons" description="Try the demo controls to see their states." />
        <AppButton label="Activate demo" onPress={() => setPreviewActive(true)} />
        <AppButton label="Reset demo" variant="secondary" onPress={() => setPreviewActive(false)} />
        <AppButton label="Disabled demo" disabled />
        <AppText variant="secondaryBody" accessibilityLiveRegion="polite">
          {previewActive ? 'Demo active.' : 'Demo ready.'}
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Palette" description="Brand colors appear as accents and surfaces." />
        <AppCard style={styles.swatches}>
          {swatches.map(({ name, color }) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.colorChip, { backgroundColor: color }]} />
              <AppText variant="caption">{name}</AppText>
            </View>
          ))}
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing['3xl'], paddingVertical: spacing['3xl'] },
  intro: {
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radii.container,
    borderTopWidth: spacing.xs,
    borderTopColor: palette.sage,
    padding: spacing.xl,
  },
  eyebrow: { color: colors.primary, fontWeight: '700', letterSpacing: 1.2 },
  supportingText: { color: colors.secondaryText },
  section: { gap: spacing.md },
  sample: { gap: spacing.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: { flexGrow: 1, flexBasis: 72, gap: spacing.xs },
  colorChip: { height: spacing['3xl'], borderRadius: radii.input, borderWidth: 1, borderColor: colors.border },
});
