import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState, ErrorState, LoadingState } from '../src/components/states';

test('shows the default loading message and exposes busy progress', async () => {
  await render(<LoadingState />);

  expect(screen.getByText('Loading…')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Loading…', busy: true })).toBeOnTheScreen();
});

test('uses the custom loading message for visible text and the accessible label', async () => {
  await render(<LoadingState message="Preparing your overview…" />);

  expect(screen.getByText('Preparing your overview…')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Preparing your overview…', busy: true })).toBeOnTheScreen();
});

test('describes the empty result without requiring an action', async () => {
  await render(<EmptyState title="Nothing here yet" description="New items appear here." icon="inbox" />);

  expect(screen.getByRole('header', { name: 'Nothing here yet' })).toBeOnTheScreen();
  expect(screen.getByText('New items appear here.')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});

test('runs the supplied empty-state action when pressed', async () => {
  const onPress = jest.fn();
  await render(<EmptyState title="No items" action={{ label: 'Add item', onPress }} />);

  expect(onPress).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('displays a default error heading and a user-facing message', async () => {
  await render(<ErrorState message="The overview is unavailable." />);

  expect(screen.getByRole('header', { name: 'Something didn’t load' })).toBeOnTheScreen();
  expect(screen.getByText('The overview is unavailable.')).toBeOnTheScreen();
});

test('calls Retry only when the accessible button is pressed', async () => {
  const onRetry = jest.fn();
  await render(<ErrorState onRetry={onRetry} />);

  expect(onRetry).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again', disabled: false }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('omits Retry when no callback is supplied', async () => {
  await render(<ErrorState title="Details unavailable" />);

  expect(screen.getByRole('header', { name: 'Details unavailable' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
