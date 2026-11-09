import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppScreen } from '../src/components/ui/AppScreen';
import { AppText } from '../src/components/ui/AppText';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { colors, typography } from '../src/theme';

test('AppText applies the supporting variant and accepts overrides', async () => {
  await render(<AppText variant="caption" style={{ textAlign: 'center' }}>Supporting detail</AppText>);

  expect(screen.getByText('Supporting detail')).toHaveStyle({
    ...typography.caption,
    color: colors.secondaryText,
    textAlign: 'center',
  });
});

test('AppButton renders an accessible label and handles a press', async () => {
  const onPress = jest.fn();
  await render(<AppButton label="Try demo" onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Try demo', disabled: false });
  expect(screen.getByText('Try demo')).toBeOnTheScreen();
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('AppButton blocks presses when disabled', async () => {
  const onPress = jest.fn();
  await render(<AppButton label="Disabled demo" disabled onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Disabled demo', disabled: true });
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('AppButton shows progress, keeps its label, and blocks presses while loading', async () => {
  const onPress = jest.fn();
  await render(<AppButton label="Save" loading onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Save', disabled: true, busy: true });
  expect(screen.getByTestId('app-button-spinner')).toBeOnTheScreen();
  expect(screen.getByText('Save')).toBeOnTheScreen();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('AppCard renders nested content', async () => {
  await render(<AppCard><Text>Card content</Text></AppCard>);

  expect(screen.getByText('Card content')).toBeOnTheScreen();
});

test.each([false, true])('AppScreen renders content with scroll=%s', async (scroll) => {
  const { container } = await render(
    <AppScreen scroll={scroll}><Text>Screen content</Text></AppScreen>,
  );

  expect(screen.getByText('Screen content')).toBeOnTheScreen();
  const scrollContainers = container.queryAll(
    (node) => node.props.keyboardShouldPersistTaps === 'handled',
  );
  expect(scrollContainers).toHaveLength(scroll ? 1 : 0);
});

test('SectionHeader exposes a heading and optional supporting text', async () => {
  await render(<SectionHeader title="Palette" description="Brand accents" />);

  expect(screen.getByRole('header', { name: 'Palette' })).toBeOnTheScreen();
  expect(screen.getByText('Brand accents')).toBeOnTheScreen();
});
