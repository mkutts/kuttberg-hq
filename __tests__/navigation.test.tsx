import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { Platform } from 'react-native';

const destinations = [
  ['Today', '/'],
  ['Routines', '/routines'],
  ['Wellness', '/wellness'],
  ['Responsibilities', '/responsibilities'],
  ['Inbox', '/inbox'],
] as const;
const tabRole = Platform.OS === 'ios' ? 'button' : 'tab';

test('opens Today and switches between all five named tabs', async () => {
  await renderRouter('app');
  expect(screen).toHavePathname('/');
  expect(screen.getAllByRole(tabRole)).toHaveLength(5);
  expect(screen.getByRole(tabRole, { name: 'Today', selected: true })).toBeOnTheScreen();

  for (const [title, pathname] of [...destinations.slice(1), destinations[0]]) {
    await fireEvent.press(screen.getByRole(tabRole, { name: title, selected: false }));
    expect(screen).toHavePathname(pathname);
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Coming soon' })).toBeOnTheScreen();
    expect(screen.getByRole(tabRole, { name: title, selected: true })).toBeOnTheScreen();
    expect(screen.getAllByRole(tabRole, { selected: true })).toHaveLength(1);
  }
});

test('going back from a secondary tab returns to Today', async () => {
  await renderRouter('app');
  await fireEvent.press(screen.getByRole(tabRole, { name: 'Wellness' }));
  await fireEvent.press(screen.getByRole(tabRole, { name: 'Inbox' }));
  await testRouter.back('/');
  expect(screen.getByRole(tabRole, { name: 'Today', selected: true })).toBeOnTheScreen();
});
