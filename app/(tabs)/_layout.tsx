import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../src/components/ui/AppText';
import { destinations } from '../../src/destinations';
import { colors, radii } from '../../src/theme';

const tabNames = ['index', 'routines', 'wellness', 'responsibilities', 'inbox'] as const;
const maxLabelScale = 1.6;
const labelLineHeight = 15;

export default function TabLayout() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const labelScale = Math.min(fontScale, maxLabelScale);
  const wrapResponsibilities = (width - insets.left - insets.right) / labelScale < 400;

  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: [
          styles.bar,
          {
            height: insets.bottom + 46 +
              Math.ceil(labelLineHeight * labelScale) * (wrapResponsibilities ? 2 : 1),
          },
        ],
      }}
    >
      {tabNames.map((name) => {
        const { title, icon } = destinations[name];
        const splitLabel = name === 'responsibilities' && wrapResponsibilities;

        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              tabBarAccessibilityLabel: title,
              tabBarItemStyle: styles[name],
              tabBarLabel: ({ color, focused }) => (
                <AppText
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={maxLabelScale}
                  numberOfLines={splitLabel ? 2 : 1}
                  style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}
                >
                  {splitLabel ? 'Responsi-\nbilities' : title}
                </AppText>
              ),
              tabBarIcon: ({ focused }) => (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.icon, focused && styles.activeIcon]}
                >
                  <Feather name={icon} size={20} color={focused ? colors.primary : colors.secondaryText} />
                </View>
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.card, borderTopColor: colors.border },
  index: { flex: 1 },
  routines: { flex: 1.3 },
  wellness: { flex: 1.3 },
  responsibilities: { flex: 1.6 },
  inbox: { flex: 1 },
  label: { width: '100%', fontSize: 12, lineHeight: labelLineHeight, textAlign: 'center' },
  icon: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  activeIcon: { backgroundColor: colors.secondaryPressed, borderColor: colors.primary, borderWidth: 1 },
});
