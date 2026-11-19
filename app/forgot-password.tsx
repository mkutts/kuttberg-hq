import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { recoveryConfirmation } from '../src/auth/recovery';
import { RecoveryForm, RecoveryMessage, recoveryStyles } from '../src/auth/RecoveryForm';
import { AppButton } from '../src/components/ui/AppButton';
import { AppText } from '../src/components/ui/AppText';

export default function ForgotPasswordScreen() {
  const { requestRecovery, busy } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submitting = busy === 'requestRecovery';
  const sent = message === recoveryConfirmation;
  async function submit() {
    if (busy) return;
    Keyboard.dismiss();
    setMessage(await requestRecovery(email));
  }
  return <RecoveryForm title={sent ? 'Check your email' : 'Reset your password'}>
    <AppText variant="secondaryBody">Enter your account email. Open the reset link on the phone where Kuttberg HQ is installed.</AppText>
    {!sent && <View style={recoveryStyles.field}>
      <AppText>Email</AppText>
      <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        textContentType="emailAddress" keyboardType="email-address" returnKeyType="send" editable={!busy}
        value={email} onChangeText={setEmail} onSubmitEditing={() => void submit()} style={recoveryStyles.input} />
    </View>}
    <RecoveryMessage message={message} />
    {!sent && <AppButton label={submitting ? 'Requesting reset email…' : 'Send reset email'} loading={submitting} disabled={Boolean(busy)} onPress={() => void submit()} />}
    {sent && <AppText variant="caption">Delivery can take a few minutes. If nothing arrives, return to sign-in and try again later.</AppText>}
    <AppButton label="Back to sign-in" variant="secondary" disabled={Boolean(busy)} onPress={() => router.replace('/sign-in')} />
  </RecoveryForm>;
}
