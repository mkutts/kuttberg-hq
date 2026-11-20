import { waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';

import { authController } from '../src/auth/authController';
import { recoveryConfirmation } from '../src/auth/recovery';
import { getSupabaseClient } from '../src/supabase/client';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

let mock: ReturnType<typeof mockAuthClient>;
let clock = Date.now();
function appState(next: 'active' | 'background') {
  jest.mocked(AppState.addEventListener).mock.calls.forEach(([, listener]) => listener(next));
}
afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  clock += 61_000;
  jest.spyOn(Date, 'now').mockReturnValue(clock);
  jest.spyOn(AppState, 'addEventListener');
  mock = mockAuthClient();
  jest.mocked(getSupabaseClient).mockImplementation(() => mock.client);
});
async function request() {
  await renderRouter('app', { initialUrl: '/forgot-password' });
  await waitFor(() => expect(screen.getByLabelText('Email')).toBeOnTheScreen());
  await fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.invalid');
  await fireEvent.press(screen.getByRole('button', { name: 'Send recovery code' }));
  await waitFor(() => expect(screen.getByLabelText('Recovery code')).toBeOnTheScreen());
}
async function recover() {
  await request();
  await fireEvent.changeText(screen.getByLabelText('Recovery code'), '01234567');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify recovery code' }));
  await waitFor(() => expect(screen.getByLabelText('New password')).toBeOnTheScreen());
}
async function fill(password = 'synthetic-new-password', confirm = password) {
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), confirm);
}

test('Forgot password action opens a branded form with validation, busy state, neutral success and return', async () => {
  await renderRouter('app');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
  await waitFor(() => expect(screen).toHavePathname('/forgot-password'));
  await fireEvent.press(screen.getByRole('button', { name: 'Send recovery code' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  const response = deferred<Awaited<ReturnType<typeof mock.auth.resetPasswordForEmail>>>();
  mock.auth.resetPasswordForEmail.mockReturnValueOnce(response.promise);
  await fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.invalid');
  await fireEvent.press(screen.getByRole('button', { name: 'Send recovery code' }));
  await waitFor(() => expect(screen.getByText('Sending recovery code.')).toBeOnTheScreen());
  expect(screen.getByRole('button', { name: 'Back to sign-in' })).toBeDisabled();
  await act(() => response.resolve({ data: {}, error: null }));
  expect(screen.getByRole('alert')).toHaveTextContent(recoveryConfirmation);
  await fireEvent.press(screen.getByRole('button', { name: 'Back to sign-in' }));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
});
test.each([false, true])('code and password states guard household navigation (authorized=%s)', async (authorized) => {
  if (authorized) await recover(); else await request();
  for (const route of ['/', '/settings', '/wellness', '/sign-in', '/forgot-password']) {
    await act(() => router.navigate(route));
    await waitFor(() => expect(screen).toHavePathname('/reset-password'));
  }
  for (let i = 0; testRouter.canGoBack() && i < 10; i += 1) {
    await act(() => router.back());
    await waitFor(() => expect(screen).toHavePathname('/reset-password'));
  }
  expect(testRouter.canGoBack()).toBe(false);
  await act(() => mock.emit('SIGNED_IN', testSession()));
  expect(screen.queryByLabelText('New password')).toBeNull();
  if (authorized) expect(screen.getByRole('alert')).toHaveTextContent(/no longer valid/);
  expect(screen).toHavePathname('/reset-password');
});
test('missing-token direct route has no password form; normal signed-in session cannot access it', async () => {
  await renderRouter('app', { initialUrl: '/reset-password' });
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.queryByLabelText('New password')).toBeNull();
  await act(() => mock.emit('SIGNED_IN', testSession()));
  await waitFor(() => expect(screen).toHavePathname('/'));
  await act(() => router.navigate('/reset-password'));
  await waitFor(() => expect(screen).toHavePathname('/'));
});
test('password form validates, toggles visibility, clears inputs, announces errors and cleans up after success', async () => {
  await recover();
  await fill('short');
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Use 12 to 128 characters/);
  await fill('synthetic-new-password', 'mismatch');
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your passwords do not match.');
  expect(mock.auth.updateUser).not.toHaveBeenCalled();
  await fill();
  expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Show passwords' }));
  expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(false);
  const response = deferred<Awaited<ReturnType<typeof mock.auth.updateUser>>>();
  mock.auth.updateUser.mockReturnValueOnce(response.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
  expect(screen.getByRole('button', { name: 'Updating password…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back to sign-in' })).toBeDisabled();
  expect(screen.getByLabelText('New password').props.value).toBe('');
  expect(screen.getByLabelText('Confirm password').props.value).toBe('');
  await act(() => response.resolve({ data: { user: null }, error: new Error('private-password') }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Unable to confirm/);
  await fill();
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.getByRole('alert')).toHaveTextContent('Your password has been updated. Sign in with your new password.');
  expect(screen.queryByLabelText('New password')).toBeNull();
  expect(testRouter.canGoBack()).toBe(false);
});
test('failed cleanup keeps the recovery screen guarded; retry returns safely', async () => {
  await recover();
  mock.auth.signOut.mockResolvedValueOnce({ error: new Error('private-cleanup') });
  await fireEvent.press(screen.getByRole('button', { name: 'Back to sign-in' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Session cleanup did not finish/);
  expect(screen.queryByLabelText('New password')).toBeNull();
  await act(() => router.navigate('/settings'));
  expect(screen).toHavePathname('/reset-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry session cleanup' }));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(authController.getSnapshot().recovery).toBeUndefined();
});

test('eight-digit paste preserves zero, rejects overlong/non-numeric input, and uses mobile OTP hints', async () => {
  await request();
  const input = screen.getByLabelText('Recovery code');
  expect(input.props.keyboardType).toBe('number-pad');
  expect(input.props.textContentType).toBe('oneTimeCode');
  expect(input.props.autoComplete).toBe(Platform.OS === 'android' ? 'sms-otp' : 'one-time-code');
  for (const value of ['123456', '123456789', '1234a678']) {
    await fireEvent.changeText(input, value);
    await fireEvent.press(screen.getByRole('button', { name: 'Verify recovery code' }));
    expect(screen.getByText('Enter the eight-digit code from your email.')).toBeOnTheScreen();
  }
  expect(mock.auth.verifyOtp).not.toHaveBeenCalled();
  await fireEvent.changeText(input, ' 01234567\n');
  expect(screen.getByLabelText('Recovery code').props.value).toBe('01234567');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify recovery code' }));
  await waitFor(() => expect(screen.getByLabelText('New password')).toBeOnTheScreen());
  expect(mock.auth.verifyOtp).toHaveBeenCalledWith({ email: 'person@example.invalid', token: '01234567', type: 'recovery' });
});

test('replacement button is disabled during cooldown and clears pasted input on resend', async () => {
  await request();
  expect(screen.getByRole('button', { name: 'Resend code in 60s' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Recovery code'), '01234567');
  clock += 61_000;
  jest.spyOn(Date, 'now').mockReturnValue(clock);
  // Foreground observation refreshes the cooldown without real-time waiting.
  await act(() => appState('active'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send replacement code' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Send replacement code' }));
  await waitFor(() => expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Recovery code').props.value).toBe('');
});

test('background clears code and password fields without extending authorization', async () => {
  await request();
  await fireEvent.changeText(screen.getByLabelText('Recovery code'), '01234567');
  await act(() => appState('background'));
  expect(screen.getByLabelText('Recovery code').props.value).toBe('');
  await act(() => appState('active'));
  await fireEvent.changeText(screen.getByLabelText('Recovery code'), '01234567');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify recovery code' }));
  await waitFor(() => expect(screen.getByLabelText('New password')).toBeOnTheScreen());
  await fill();
  await act(() => appState('background'));
  expect(screen.getByLabelText('New password').props.value).toBe('');
  expect(screen.getByLabelText('Confirm password').props.value).toBe('');
  await act(() => appState('active'));
});
