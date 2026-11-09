import type { TextStyle } from 'react-native';

export const typography = {
  screenTitle: { fontSize: 36, lineHeight: 44, fontWeight: '700' },
  sectionHeading: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  cardTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  secondaryBody: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 20 },
  buttonLabel: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;
