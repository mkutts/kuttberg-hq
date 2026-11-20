import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { RecoveryForm, RecoveryMessage, recoveryStyles } from '../src/auth/RecoveryForm';
import { AppButton } from '../src/components/ui/AppButton';
import { AppText } from '../src/components/ui/AppText';

export default function ForgotPasswordScreen() {
  const { requestRecovery, busy } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    if (busy) return;
    Keyboard.dismiss();
    setMessage(await requestRecovery(email));
  }
  return <RecoveryForm title="Reset your password">
    <AppText variant="secondaryBody">Enter your account email. We will email a recovery code for you to enter here.</AppText>
    <View style={recoveryStyles.field}>
      <AppText>Email</AppText>
      <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        textContentType="emailAddress" keyboardType="email-address" returnKeyType="send" editable={!busy}
        value={email} onChangeText={setEmail} onSubmitEditing={() => void submit()} style={recoveryStyles.input} />
    </View>
    <RecoveryMessage message={message} />
    <AppButton label="Send recovery code" disabled={Boolean(busy)} onPress={() => void submit()} />
    <AppButton label="Back to sign-in" variant="secondary" disabled={Boolean(busy)} onPress={() => router.replace('/sign-in')} />
  </RecoveryForm>;
}
