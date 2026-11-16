import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';

import config from '../app.json';

test('opens Settings from Today and returns using the visible back control', async () => {
  await renderRouter('app');
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));

  expect(screen).toHavePathname('/settings');
  expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
  expect(screen).toHavePathname('/');
  expect(screen.getByRole('header', { name: 'Your daily overview' })).toBeOnTheScreen();
});

test('a navigation back action from Settings restores Today', async () => {
  await renderRouter('app');
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  await testRouter.back('/');
  expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
});

test('the visible back control returns to Today when Settings is opened directly', async () => {
  await renderRouter('app', { initialUrl: '/settings' });
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));

  expect(screen).toHavePathname('/');
  expect(screen.getByRole('header', { name: 'Your daily overview' })).toBeOnTheScreen();
});

test('shows app information, the App Updates section, and informational future preferences', async () => {
  await renderRouter('app', { initialUrl: '/settings' });

  expect(screen.getByRole('header', { name: config.expo.name })).toBeOnTheScreen();
  expect(screen.getByText('Your household command center.')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'App Updates' })).toBeOnTheScreen();
  expect(screen.getByText(/^Installed version /)).toBeOnTheScreen();
  expect(screen.getByText(/^Build number /)).toBeOnTheScreen();
  for (const name of ['Notifications', 'Appearance preferences', 'Account settings']) {
    expect(screen.getByText(name)).toBeOnTheScreen();
  }
  expect(screen.getAllByText('Coming later')).toHaveLength(3);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.getByText(/private accounts and household data synchronization are planned/i)).toBeOnTheScreen();
});
