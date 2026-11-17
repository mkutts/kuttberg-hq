import { type ComponentRef, useRef, useState } from 'react';
import { Image, Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppScreen } from '../src/components/ui/AppScreen';
import { AppText } from '../src/components/ui/AppText';
import { colors, radii, spacing, typography } from '../src/theme';

export default function SignInScreen() {
  const { signIn, message, busy } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const submitting = busy === 'signIn';

  async function submit() {
    if (submitting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setValidation('Enter your email address and password to continue.');
      return;
    }
    setValidation(null);
    Keyboard.dismiss();
    await signIn(email, password);
    setPassword('');
    setVisible(false);
  }

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.brand}>
        <Image
          source={require('../assets/images/KuttbergHQ_Splash_Screen_Logo_1024_Transparent.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible={false}
        />
        <AppText variant="screenTitle" accessibilityRole="header" style={styles.center}>Kuttberg HQ</AppText>
        <AppText variant="secondaryBody" style={styles.center}>A little more calm. A little more together.</AppText>
      </View>
      <AppCard style={styles.form}>
        <AppText variant="sectionHeading" accessibilityRole="header">Welcome home</AppText>
        <AppText variant="secondaryBody">Sign in to your private household space.</AppText>
        <View style={styles.field}>
          <AppText>Email</AppText>
          <TextInput
            accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false}
            autoComplete="email" textContentType="username" keyboardType="email-address"
            returnKeyType="next" submitBehavior="submit" editable={!submitting}
            value={email} onChangeText={setEmail} onSubmitEditing={() => passwordInput.current?.focus()}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <AppText>Password</AppText>
          <TextInput
            ref={passwordInput} accessibilityLabel="Password" autoCapitalize="none" autoCorrect={false}
            autoComplete="current-password" textContentType="password" secureTextEntry={!visible}
            returnKeyType="go" editable={!submitting} value={password} onChangeText={setPassword}
            onSubmitEditing={() => void submit()} style={styles.input}
          />
          <View style={styles.toggle}>
            <AppButton label={visible ? 'Hide password' : 'Show password'} variant="secondary"
              disabled={submitting} onPress={() => setVisible((value) => !value)} />
          </View>
        </View>
        {(validation || message) && <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{validation || message}</AppText>}
        <AppButton label={submitting ? 'Signing in…' : 'Sign in'} loading={submitting} onPress={() => void submit()} />
        <AppText variant="caption">Access is limited to accounts enrolled by your household administrator.</AppText>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing['2xl'], flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: { width: 140, height: 140 },
  center: { textAlign: 'center' },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  input: { ...typography.body, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.input, backgroundColor: colors.elevated, color: colors.text },
  toggle: { alignSelf: 'flex-end' },
  error: { color: colors.error },
});
