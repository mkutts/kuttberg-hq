import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';

test('shows the Kuttberg HQ welcome screen', async () => {
  await render(<HomeScreen />);

  expect(screen.getByRole('header', { name: 'Kuttberg HQ' })).toBeOnTheScreen();
  expect(screen.getByText('Your household command center is taking shape.')).toBeOnTheScreen();
});
