import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import InboxScreen from '../app/(tabs)/inbox';
import { taskService, type Task } from '../src/tasks/taskService';

let mockUser: string | null = 'user-a';
let mockFocus: (() => void | (() => void)) | undefined;
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ status: mockUser ? 'signedIn' : 'signedOut', session: mockUser ? { user: { id: mockUser } } : null }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (callback: () => void | (() => void)) => { mockFocus = callback; require('react').useEffect(callback, [callback]); } }));
jest.mock('../src/tasks/taskService', () => ({ taskService: { fetchAllTasks: jest.fn(), fetchWorkspaceOptions: jest.fn() } }));

const task = (overrides: Partial<Task> = {}): Task => ({ id: '1', workspaceId: 'w', createdBy: 'user-a', title: 'First task', description: null, priority: 'normal', status: 'active', dueDate: null, isInbox: true, archivedAt: null, createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z', ...overrides });
const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (code: 'network' | 'database' | 'authentication') => ({ ok: false as const, error: { code, message: 'error', retryable: true } });
const workspaces = [{ id: 'w', name: 'Personal', slug: 'p', workspaceType: 'personal' as const, privacy: 'private' as const }];
const fetchTasks = jest.mocked(taskService.fetchAllTasks);
const fetchWorkspaces = jest.mocked(taskService.fetchWorkspaceOptions);

beforeEach(() => { mockUser = 'user-a'; jest.resetAllMocks(); fetchTasks.mockResolvedValue(ok([task()])); fetchWorkspaces.mockResolvedValue(ok(workspaces)); });

test('renders authorized Inbox tasks, workspace, dates and priority; filters inactive and non-Inbox tasks', async () => {
  fetchTasks.mockResolvedValue(ok([task({ id: 'later', title: 'Later', dueDate: '2099-01-01', priority: 'high' }), task({ id: 'old', title: 'Overdue', dueDate: '2000-01-01' }), task({ id: 'none', title: 'No date' }), task({ id: 'outside', title: 'Organized', isInbox: false }), task({ id: 'done', title: 'Completed', status: 'completed' }), task({ id: 'archived', title: 'Archived', archivedAt: '2026-01-01' })]));
  await render(<InboxScreen />);
  await waitFor(() => expect(fetchTasks).toHaveBeenCalled());
  expect(screen.getAllByText('Personal')).toHaveLength(3);
  expect(screen.getByText('High priority')).toBeOnTheScreen();
  expect(screen.getByText(/Overdue.*2000/)).toBeOnTheScreen();
  expect(screen.queryByText('Organized')).toBeNull();
  expect(screen.queryByText('Completed')).toBeNull();
  expect(screen.queryByText('Archived')).toBeNull();
  const rows = screen.getAllByText(/Overdue|Later|No date/).filter((x) => ['Overdue', 'Later', 'No date'].includes(String(x.props.children)));
  expect(rows.map((x) => x.props.children)).toEqual(['Overdue', 'Later', 'No date']);
  await fireEvent.press(screen.getByRole('radio', { name: 'All Tasks' }));
  expect(screen.getByText('Organized')).toBeOnTheScreen();
  expect(screen.queryByText('Completed')).toBeNull();
  expect(screen.queryByText('Archived')).toBeNull();
}, 60000);

test('shows loading and both empty states', async () => {
  let resolve!: (value: ReturnType<typeof ok<Task[]>>) => void;
  fetchTasks.mockReturnValue(new Promise((done) => { resolve = done; }));
  await render(<InboxScreen />);
  expect(screen.getByText('Loading tasks…')).toBeOnTheScreen();
  await act(() => resolve(ok([])));
  await waitFor(() => expect(screen.getByText('Your Inbox is empty')).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('radio', { name: 'All Tasks' }));
  expect(screen.getByText('No active tasks')).toBeOnTheScreen();
});

test.each(['network', 'database', 'authentication'] as const)('shows %s failure and retries', async (code) => {
  fetchTasks.mockResolvedValueOnce(fail(code)).mockResolvedValueOnce(ok([task()]));
  await render(<InboxScreen />);
  await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
  expect(screen.queryByText('Your Inbox is empty')).toBeNull();
  expect(screen.getByRole('alert').props.children).toContain(code === 'network' ? 'internet' : code === 'authentication' ? 'session' : 'Could not load');
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText('First task')).toBeOnTheScreen());
});

test('pull to refresh and renewed focus load new data', async () => {
  const view = await render(<InboxScreen />);
  await waitFor(() => expect(screen.getByText('First task')).toBeOnTheScreen());
  fetchTasks.mockResolvedValueOnce(ok([task({ title: 'Refreshed' })]));
  await act(() => screen.getByTestId('task-list').props.refreshControl.props.onRefresh());
  await waitFor(() => expect(screen.getByText('Refreshed')).toBeOnTheScreen());
  fetchTasks.mockResolvedValueOnce(ok([task({ title: 'Captured' })]));
  await act(() => { mockFocus?.(); });
  await waitFor(() => expect(screen.getByText('Captured')).toBeOnTheScreen());
});

test('discards older responses and previous account data on switch and sign-out', async () => {
  let resolve!: (value: ReturnType<typeof ok<Task[]>>) => void;
  fetchTasks.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(ok([task({ title: 'New result' })]));
  const view = await render(<InboxScreen />);
  await act(() => { mockFocus?.(); });
  await waitFor(() => expect(screen.getByText('New result')).toBeOnTheScreen());
  await act(() => resolve(ok([task({ title: 'Old result' })])));
  expect(screen.queryByText('Old result')).toBeNull();
  mockUser = 'user-b';
  fetchTasks.mockResolvedValueOnce(ok([task({ title: 'Other account' })]));
  await view.rerender(<InboxScreen />);
  expect(screen.queryByText('New result')).toBeNull();
  await waitFor(() => expect(screen.getByText('Other account')).toBeOnTheScreen());
  mockUser = null;
  await view.rerender(<InboxScreen />);
  expect(screen.queryByText('Other account')).toBeNull();
});
