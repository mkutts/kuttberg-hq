import { fireEvent, render, screen } from '@testing-library/react-native';

import DesignSystemPreview from '../src/dev/DesignSystemPreview';

test('shows the Kuttberg HQ design system preview', async () => {
  await render(<DesignSystemPreview />);

  expect(screen.getByRole('header', { name: 'Kuttberg HQ' })).toBeOnTheScreen();
  expect(screen.getByText('DESIGN SYSTEM PREVIEW')).toBeOnTheScreen();
  expect(screen.getByText('Sage green')).toBeOnTheScreen();
});

test('activates and resets the local preview', async () => {
  await render(<DesignSystemPreview />);

  await fireEvent.press(screen.getByRole('button', { name: 'Activate demo' }));
  expect(screen.getByText('Demo active.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Reset demo' }));
  expect(screen.getByText('Demo ready.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Disabled demo' })).toBeDisabled();
});
