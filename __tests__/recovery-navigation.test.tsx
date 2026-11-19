import { waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';

import { redirectSystemPath } from '../app/+native-intent';
import { authController } from '../src/auth/authController';
import { recoveryConfirmation } from '../src/auth/recovery';
import { getSupabaseClient } from '../src/supabase/client';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
const link = 'kuttberg-hq://reset-password?token_hash=synthetic_recovery_hash_not_real_12345678&type=recovery';
let mock: ReturnType<typeof mockAuthClient>;
beforeEach(() => {
  mock = mockAuthClient();
  jest.mocked(getSupabaseClient).mockImplementation(() => mock.client);
});
async function recover(initial: boolean) {
  if (initial) {
    const route = redirectSystemPath({ path: link, initial: true });
    await renderRouter('app', { initialUrl: route });
  } else {
    await renderRouter('app');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeOnTheScreen());
    await act(() => { redirectSystemPath({ path: link, initial: false }); });
  }
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
  await fireEvent.press(screen.getByRole('button', { name: 'Send reset email' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  const response = deferred<Awaited<ReturnType<typeof mock.auth.resetPasswordForEmail>>>();
  mock.auth.resetPasswordForEmail.mockReturnValueOnce(response.promise);
  await fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.invalid');
  await fireEvent.press(screen.getByRole('button', { name: 'Send reset email' }));
  expect(screen.getByRole('button', { name: 'Requesting reset email…' })).toBeDisabled();
  expect(screen.getByLabelText('Email').props.editable).toBe(false);
  await act(() => response.resolve({ data: {}, error: null }));
  expect(screen.getByRole('alert')).toHaveTextContent(recoveryConfirmation);
  await fireEvent.press(screen.getByRole('button', { name: 'Back to sign-in' }));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
});
test.each([true, false])('cold/foreground recovery cannot navigate to household, Settings, sign-in or request screen (initial=%s)', async (initial) => {
  await recover(initial);
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
  expect(screen.getByRole('alert')).toHaveTextContent(/invalid, expired, or already used/);
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
  await recover(true);
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
  await recover(true);
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
