import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { QuickCapture } from '../src/tasks/QuickCapture';
import type { Task, WorkspaceOption } from '../src/tasks/taskService';

const personal: WorkspaceOption = { id: 'personal-workspace', name: 'Personal', slug: 'personal-1', workspaceType: 'personal', privacy: 'private' };
const shared: WorkspaceOption = { id: 'shared-workspace', name: 'Jersey City', slug: 'jersey-city', workspaceType: 'location', privacy: 'shared' };
const savedTask: Task = {
  id: 'task-1', workspaceId: personal.id, createdBy: 'user-1', title: 'Book the vet', description: null,
  priority: 'normal', status: 'active', dueDate: null, isInbox: true, archivedAt: null,
  createdAt: '2026-11-22T12:00:00.000Z', updatedAt: '2026-11-22T12:00:00.000Z',
};

function service(overrides: Partial<{ fetchWorkspaceOptions: jest.Mock; createTask: jest.Mock }> = {}) {
  return {
    fetchWorkspaceOptions: overrides.fetchWorkspaceOptions ?? jest.fn(async () => ({ ok: true as const, data: [shared, personal] })),
    createTask: overrides.createTask ?? jest.fn(async () => ({ ok: true as const, data: savedTask })),
  };
}

async function renderCapture(mockService = service(), onDismiss = jest.fn()) {
  await render(<QuickCapture service={mockService} onDismiss={onDismiss} />);
  await waitFor(() => expect(screen.getByText('Personal / Private')).toBeOnTheScreen());
  return { mockService, onDismiss };
}

test('renders Quick Capture with the private Personal workspace selected by default', async () => {
  const { mockService } = await renderCapture();
  expect(screen.getByRole('header', { name: 'Quick Capture' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Task title')).toHaveDisplayValue('');
  expect(mockService.fetchWorkspaceOptions).toHaveBeenCalledTimes(1);
});

test('submits a normal-priority Inbox task and shows confirmed success', async () => {
  const { mockService } = await renderCapture();
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Book the vet');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() => expect(screen.getByRole('header', { name: 'Task saved' })).toBeOnTheScreen());
  expect(mockService.createTask).toHaveBeenCalledWith({
    workspaceId: personal.id, title: 'Book the vet', description: null, priority: 'normal', dueDate: null, isInbox: true,
  });
});

test('requires a non-blank title before submitting', async () => {
  const { mockService } = await renderCapture();
  await fireEvent.changeText(screen.getByLabelText('Task title'), '   ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Task title is required.');
  expect(mockService.createTask).not.toHaveBeenCalled();
});

test('saves optional notes and permits an authorized shared workspace selection', async () => {
  const { mockService } = await renderCapture();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose workspace' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Use Jersey City / Shared' }));
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Replace filter');
  await fireEvent.changeText(screen.getByLabelText('Notes, optional'), 'Use the spare in the hall closet');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() => expect(mockService.createTask).toHaveBeenCalledWith(expect.objectContaining({
    workspaceId: shared.id, description: 'Use the spare in the hall closet',
  })));
});

test('retains entered values after a failed save and permits retry without false success', async () => {
  const createTask = jest.fn()
    .mockResolvedValueOnce({ ok: false as const, error: { code: 'network', message: 'Unable to reach the task service. Try again.', retryable: true } })
    .mockResolvedValueOnce({ ok: true as const, data: savedTask });
  await renderCapture(service({ createTask }));
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Buy groceries');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to reach the task service. Try again.'));
  expect(screen.queryByRole('header', { name: 'Task saved' })).toBeNull();
  expect(screen.getByDisplayValue('Buy groceries')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() => expect(screen.getByRole('header', { name: 'Task saved' })).toBeOnTheScreen());
  expect(createTask).toHaveBeenCalledTimes(2);
});

test('prevents a second submission while the first request is pending', async () => {
  let resolve!: (value: { ok: true; data: Task }) => void;
  const createTask = jest.fn(() => new Promise<{ ok: true; data: Task }>((done) => { resolve = done; }));
  await renderCapture(service({ createTask }));
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Call plumber');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  expect(createTask).toHaveBeenCalledTimes(1);
  resolve({ ok: true, data: savedTask });
  await waitFor(() => expect(screen.getByRole('header', { name: 'Task saved' })).toBeOnTheScreen());
});

test('cancels without creating a task', async () => {
  const onDismiss = jest.fn();
  const { mockService } = await renderCapture(undefined, onDismiss);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(mockService.createTask).not.toHaveBeenCalled();
});

test('does not report success when authentication expires during a save', async () => {
  const createTask = jest.fn(async () => ({ ok: false as const, error: { code: 'authentication', message: 'Your account changed. The task result was discarded.', retryable: false } }));
  await renderCapture(service({ createTask }));
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Private task');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your account changed. The task result was discarded.'));
  expect(screen.queryByRole('header', { name: 'Task saved' })).toBeNull();
});

test('shows a clear error instead of choosing an arbitrary workspace when Personal is unavailable', async () => {
  await render(<QuickCapture service={service({ fetchWorkspaceOptions: jest.fn(async () => ({ ok: true as const, data: [shared] })) })} onDismiss={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/private Personal workspace is unavailable/i));
  expect(screen.getByRole('button', { name: 'Save task' }).props.accessibilityState?.disabled).toBe(true);
});
