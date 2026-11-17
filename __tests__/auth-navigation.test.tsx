import { act, fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getSupabaseClient } from '../src/supabase/client';
import { deferred, mockAuthClient, testSession } from '../test-support/authClient';

jest.mock('../src/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

let mock: ReturnType<typeof mockAuthClient>;
beforeEach(() => {
  mock = mockAuthClient();
  jest.mocked(getSupabaseClient).mockImplementation(() => mock.client);
});

async function fillSignIn() {
  await fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.invalid');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'synthetic-password');
}

test.each(['/', '/settings', '/wellness', '/inbox', '/routines', '/responsibilities'])('signed-out deep link %s redirects to sign-in', async (initialUrl) => {
  await renderRouter('app', { initialUrl });
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.getByRole('header', { name: 'Welcome home' })).toBeOnTheScreen();
  expect(screen.queryByText('Your day, at a glance.')).toBeNull();
  expect(screen.queryByRole('button', { name: /sign up|register|reset|magic|invite/i })).toBeNull();
});

test('no protected content or sign-in form flashes during initial hydration', async () => {
  const read = deferred<Awaited<ReturnType<typeof mock.auth.getSession>>>();
  mock.auth.getSession.mockReturnValueOnce(read.promise);
  await renderRouter('app', { initialUrl: '/settings' });
  expect(screen.getByRole('progressbar', { name: 'Restoring your secure session…' })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Settings' })).toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
  await act(() => read.resolve({ data: { session: testSession() }, error: null }));
  await waitFor(() => expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen());
});

test('restored authenticated session cannot remain on sign-in', async () => {
  mock.auth.getSession.mockResolvedValue({ data: { session: testSession() }, error: null });
  await renderRouter('app', { initialUrl: '/sign-in' });
  await waitFor(() => expect(screen).toHavePathname('/'));
  expect(screen.queryByLabelText('Password')).toBeNull();
});

test('validates input, supports show/hide, reports wrong password, and retries successfully', async () => {
  await renderRouter('app');
  await waitFor(() => expect(screen.getByLabelText('Email')).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mock.auth.signInWithPassword).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/Enter your email address and password/);
  await fillSignIn();
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  mock.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: 'invalid_credentials', message: 'sensitive' } });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/Check your email and password/);
  expect(screen.getByLabelText('Password').props.value).toBe('');
  await fillSignIn();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen).toHavePathname('/'));
});

test('announces loading and prevents duplicate submissions', async () => {
  const pending = deferred<Awaited<ReturnType<typeof mock.auth.signInWithPassword>>>();
  mock.auth.signInWithPassword.mockReturnValueOnce(pending.promise);
  await renderRouter('app');
  await waitFor(() => expect(screen.getByLabelText('Email')).toBeOnTheScreen());
  await fillSignIn();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Signing in…' }).props.accessibilityState.busy).toBe(true);
  expect(screen.getByLabelText('Email').props.editable).toBe(false);
  await act(() => pending.resolve({ data: { session: null }, error: new Error('offline') }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('sign-out failure stays visible in Settings; success removes protected navigation', async () => {
  mock = mockAuthClient(testSession());
  await renderRouter('app');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen());
  mock.auth.signOut.mockResolvedValueOnce({ error: new Error('offline') });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen).toHavePathname('/settings');
  expect(screen.getByRole('alert')).toHaveTextContent(/Sign-out did not complete/);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.queryByRole('button', { name: 'Back to Today' })).toBeNull();
  expect(testRouter.canGoBack()).toBe(false);
  await act(() => router.navigate('/settings'));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
});

test('confirmed signed-out event removes an active protected page', async () => {
  mock = mockAuthClient(testSession());
  await renderRouter('app');
  await waitFor(() => expect(screen).toHavePathname('/'));
  await testRouter.navigate('/wellness');
  await waitFor(() => expect(screen.getByText('Make space for feeling your best.')).toBeOnTheScreen());
  await act(() => mock.emit('SIGNED_OUT', null));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.getByRole('alert')).toHaveTextContent(/Your session ended/);
});

test('sign-out failure after SIGNED_OUT stays visible on sign-in and stale events cannot reopen Settings', async () => {
  const session = testSession();
  mock = mockAuthClient(session);
  const response = deferred<Awaited<ReturnType<typeof mock.auth.signOut>>>();
  mock.auth.signOut.mockReturnValueOnce(response.promise);
  await renderRouter('app', { initialUrl: '/settings' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await act(() => mock.emit('SIGNED_OUT', null));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  await act(() => response.resolve({ error: new Error('private sign-out failure') }));
  expect(screen.getByRole('alert')).toHaveTextContent('Sign-out did not complete. Check your connection and try again.');
  await act(() => {
    mock.emit('TOKEN_REFRESHED', session);
    mock.emit('SIGNED_IN', session);
  });
  await act(() => router.navigate('/settings'));
  await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  expect(screen.getByRole('alert')).toHaveTextContent(/Sign-out did not complete/);
  expect(screen.queryByRole('header', { name: 'Settings' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('offline restoration shows retry without claiming sign-out; retry resumes the protected link', async () => {
  mock.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('offline') });
  await renderRouter('app', { initialUrl: '/settings' });
  await waitFor(() => expect(screen.getByRole('header', { name: 'Unable to restore session' })).toBeOnTheScreen());
  expect(screen.queryByLabelText('Password')).toBeNull();
  mock.auth.getSession.mockResolvedValueOnce({ data: { session: testSession() }, error: null });
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen());
});
