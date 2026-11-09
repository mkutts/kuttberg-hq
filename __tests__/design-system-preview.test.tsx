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

test('shows all state examples and gives local feedback for both demo actions', async () => {
  await render(<DesignSystemPreview />);

  expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  for (const name of ['Nothing here yet', 'No examples selected', 'Something didn’t load', 'Details unavailable']) {
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
  }

  await fireEvent.press(screen.getByRole('button', { name: 'Try demo action' }));
  expect(screen.getByText('Demo action tapped.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Demo retry tapped.')).toBeOnTheScreen();
});
