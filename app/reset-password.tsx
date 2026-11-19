import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, TextInput, View } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { invalidRecoveryMessage, passwordValidation } from '../src/auth/recovery';
import { RecoveryForm, RecoveryMessage, recoveryStyles } from '../src/auth/RecoveryForm';
import { AppButton } from '../src/components/ui/AppButton';
import { AppText } from '../src/components/ui/AppText';

export default function ResetPasswordScreen() {
  const { status, recovery, message, busy, updateRecoveryPassword, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const confirmInput = useRef<ComponentRef<typeof TextInput>>(null);
  const authorized = recovery === 'authorized';
  const clear = () => { setPassword(''); setConfirmation(''); setVisible(false); };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => { if (next !== 'active') clear(); });
    return () => subscription.remove();
  }, []);
  if (!authorized && (password || confirmation || visible || validation)) { clear(); setValidation(null); }

  async function submit() {
    if (busy || !authorized) return;
    const error = passwordValidation(password, confirmation);
    setValidation(error);
    if (error) return;
    Keyboard.dismiss();
    const work = updateRecoveryPassword(password, confirmation);
    clear();
    await work;
  }
  async function leave() {
    if (status === 'recovering') await finishRecovery();
    else router.replace('/sign-in');
  }
  return <RecoveryForm title={authorized ? 'Choose a new password' : recovery === 'verifying' ? 'Checking your reset link' : 'Password recovery'}>
    {authorized && <>
      <AppText variant="secondaryBody">Use a unique password with 12 to 128 characters. A long passphrase works well.</AppText>
      <View style={recoveryStyles.field}>
        <AppText>New password</AppText>
        <TextInput accessibilityLabel="New password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          textContentType="newPassword" secureTextEntry={!visible} value={password} onChangeText={setPassword}
          editable={!busy} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmInput.current?.focus()} style={recoveryStyles.input} />
      </View>
      <View style={recoveryStyles.field}>
        <AppText>Confirm password</AppText>
        <TextInput ref={confirmInput} accessibilityLabel="Confirm password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          textContentType="newPassword" secureTextEntry={!visible} value={confirmation} onChangeText={setConfirmation}
          editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()} style={recoveryStyles.input} />
      </View>
      <AppButton label={visible ? 'Hide passwords' : 'Show passwords'} variant="secondary" disabled={Boolean(busy)} onPress={() => setVisible(!visible)} />
    </>}
    <RecoveryMessage message={validation || message || (!recovery ? invalidRecoveryMessage : null)} />
    {authorized && <AppButton label={busy === 'updatePassword' ? 'Updating password…' : 'Update password'}
      loading={busy === 'updatePassword'} disabled={Boolean(busy)} onPress={() => void submit()} />}
    {recovery === 'verifying' && <AppText accessibilityLiveRegion="polite">Verifying your one-time reset link securely…</AppText>}
    {recovery === 'cleanup' && <AppText variant="secondaryBody">Finish clearing this reset session before signing in.</AppText>}
    <AppButton label={recovery === 'cleanup' ? 'Retry session cleanup' : 'Back to sign-in'} variant="secondary"
      loading={busy === 'cleanupRecovery'} disabled={Boolean(busy)} onPress={() => void leave()} />
  </RecoveryForm>;
}
