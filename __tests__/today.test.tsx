import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Platform } from 'react-native';

const tabRole = Platform.OS === 'ios' ? 'button' : 'tab';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test.each([
  [11, 'Good morning'],
  [12, 'Good afternoon'],
  [18, 'Good evening'],
])('shows the local date and greeting at hour %i', async (hour, greeting) => {
  const localTime = new Date(2026, 10, 9, hour);
  jest.setSystemTime(localTime);

  await renderRouter('app');

  expect(screen.getByRole('header', { name: greeting })).toBeOnTheScreen();
  expect(screen.getByText(dateFormat.format(localTime))).toBeOnTheScreen();
  expect(screen.getByText('Your day, at a glance.')).toBeOnTheScreen();
});

test('refreshes the greeting and date when returning to Today', async () => {
  jest.setSystemTime(new Date(2026, 10, 9, 23, 55));
  await renderRouter('app');
  expect(screen.getByRole('header', { name: 'Good evening' })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole(tabRole, { name: 'Inbox' }));
  const nextDay = new Date(2026, 10, 10, 0, 5);
  jest.setSystemTime(nextDay);
  await fireEvent.press(screen.getByRole(tabRole, { name: 'Today' }));

  expect(screen).toHavePathname('/');
  expect(screen.getByRole('header', { name: 'Good morning' })).toBeOnTheScreen();
  expect(screen.getByText(dateFormat.format(nextDay))).toBeOnTheScreen();
});

test('describes every dashboard section as future functionality', async () => {
  await renderRouter('app');

  expect(screen.getByText('Coming later')).toBeOnTheScreen();
  const sections = [
    ['Your daily overview', 'Your priorities and household updates will appear here as Kuttberg HQ takes shape.'],
    ['Up Next', 'Upcoming events and important dates will appear here.'],
    ['Routines', 'Your daily routines will appear here.'],
    ['Responsibilities', 'Household and property responsibilities will appear here.'],
    ['Waiting On', "Follow-ups and things you're waiting on will appear here."],
  ];

  for (const [title, description] of sections) {
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(description)).toBeOnTheScreen();
  }
  expect(screen.getAllByRole(tabRole)).toHaveLength(Platform.OS === 'ios' ? 6 : 5);
  expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(Platform.OS === 'ios' ? 6 : 1);
});
