import { Text, type TextProps } from 'react-native';

import { colors, typography } from '../../theme';

type AppTextProps = TextProps & { variant?: keyof typeof typography };

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  const isSupportingText = variant === 'secondaryBody' || variant === 'caption';

  return (
    <Text
      {...props}
      style={[typography[variant], { color: isSupportingText ? colors.secondaryText : colors.text }, style]}
    />
  );
}
