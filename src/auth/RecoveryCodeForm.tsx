import { useEffect, useState } from 'react';
import { AppState, Keyboard, Platform, TextInput, View } from 'react-native';

import { AppButton } from '../components/ui/AppButton';
import { AppText } from '../components/ui/AppText';
import { useAuth } from './AuthProvider';
import { normalizeRecoveryCode, validRecoveryCode } from './recovery';
import { RecoveryMessage, recoveryStyles } from './RecoveryForm';

export function RecoveryCodeForm() {
  const { busy, recoveryEmail, requestAvailableAt, requestRecovery, verifyRecoveryCode } = useAuth();
  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seconds = Math.max(0, Math.ceil(((requestAvailableAt ?? 0) - now) / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') setCode('');
      else setNow(Date.now());
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  function verify() {
    if (busy) return;
    const token = normalizeRecoveryCode(code);
    if (!validRecoveryCode(token)) { setValidation('Enter the eight-digit code from your email.'); return; }
    Keyboard.dismiss();
    setCode('');
    setValidation(null);
    void verifyRecoveryCode(token);
  }

  return <>
    <AppText variant="secondaryBody">Enter the eight-digit code sent to {recoveryEmail}. Codes expire after 60 minutes. Use the latest email.</AppText>
    <View style={recoveryStyles.field}>
      <AppText>Recovery code</AppText>
      <TextInput accessibilityLabel="Recovery code" accessibilityHint="Eight numeric digits from your recovery email"
        keyboardType="number-pad" autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false} spellCheck={false}
        value={code} onChangeText={(value) => { setCode(normalizeRecoveryCode(value)); setValidation(null); }}
        editable={!busy} returnKeyType="go" onSubmitEditing={verify} style={recoveryStyles.input} />
    </View>
    <RecoveryMessage message={validation} />
    <AppButton label="Verify recovery code" disabled={Boolean(busy)} onPress={verify} />
    <AppButton label={seconds > 0 ? `Resend code in ${seconds}s` : 'Send replacement code'} variant="secondary"
      disabled={Boolean(busy) || seconds > 0} onPress={() => {
        setCode(''); setValidation(null);
        if (recoveryEmail) void requestRecovery(recoveryEmail);
      }} />
  </>;
}
