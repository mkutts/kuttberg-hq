import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { createTaskService, type Task } from '../src/tasks/taskService';
import { testSession } from '../test-support/authClient';

type Reply = { data: unknown; error: { code?: string; message?: string; status?: number } | null };

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1', workspace_id: 'workspace-1', created_by: 'synthetic-user', title: 'Buy groceries', description: null,
  priority: 'normal', status: 'active', due_date: null, is_inbox: true, archived_at: null,
  created_at: '2026-11-22T12:00:00.000Z', updated_at: '2026-11-22T12:00:00.000Z', ...overrides,
});

function reply(data: unknown, error: Reply['error'] = null): Reply { return { data, error }; }

function query(result: Reply, calls: { method: string; value?: unknown }[]) {
  const done = Promise.resolve(result);
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'insert', 'update']) {
    chain[method] = jest.fn((value?: unknown) => { calls.push({ method, value }); return chain; });
  }
  chain.single = () => done;
  chain.maybeSingle = () => done;
  chain.then = done.then.bind(done);
  return chain;
}

function setup(results: Reply[], sessions: (Session | null)[] = [testSession()]) {
  const calls: { table: string; method?: string; value?: unknown }[] = [];
  let sessionIndex = 0;
  const auth = { getSession: jest.fn(async () => ({ data: { session: sessions[Math.min(sessionIndex++, sessions.length - 1)] }, error: null })) };
  const from = jest.fn((table: string) => {
    calls.push({ table });
    const next = results.shift();
    if (!next) throw new Error(`Missing mocked reply for ${table}`);
    const builderCalls: { method: string; value?: unknown }[] = [];
    const builder = query(next, builderCalls);
    Object.defineProperty(builder, '__calls', { value: builderCalls });
    return builder;
  });
  const client = {
    auth,
    from,
  } as unknown as SupabaseClient;
  return { service: createTaskService(() => client), auth, from, calls };
}

test('creates a valid task using the authenticated identity, not caller data', async () => {
  const { service, from } = setup([reply(taskRow())]);
  const result = await service.createTask({ workspaceId: 'workspace-1', title: 'Buy groceries' });
  expect(result).toEqual({ ok: true, data: expect.objectContaining({ createdBy: 'synthetic-user', title: 'Buy groceries' }) });
  const builder = from.mock.results[0].value as Record<string, jest.Mock>;
  expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: 'synthetic-user', priority: 'normal', is_inbox: true }));
});

test.each([
  [{ workspaceId: 'workspace-1', title: '   ' }, 'validation'],
  [{ workspaceId: 'workspace-1', title: 'Valid', priority: 'urgent' as never }, 'validation'],
])('rejects invalid creation input before querying the database', async (input, code) => {
  const { service, from } = setup([]);
  const result = await service.createTask(input);
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(from).not.toHaveBeenCalled();
});

test('fetches only active, unarchived Inbox tasks', async () => {
  const { service, from } = setup([reply([taskRow()])]);
  const result = await service.fetchActiveInboxTasks();
  expect(result).toMatchObject({ ok: true, data: [expect.objectContaining({ id: 'task-1' })] });
  const builder = from.mock.results[0].value as Record<string, jest.Mock>;
  expect(builder.eq).toHaveBeenCalledWith('is_inbox', true);
  expect(builder.eq).toHaveBeenCalledWith('status', 'active');
  expect(builder.is).toHaveBeenCalledWith('archived_at', null);
});

test('fetches all authorized tasks without client-side workspace assumptions', async () => {
  const { service, from } = setup([reply([taskRow(), taskRow({ id: 'task-2', workspace_id: 'workspace-2' })])]);
  const result = await service.fetchAllTasks();
  expect(result).toMatchObject({ ok: true, data: [expect.anything(), expect.anything()] });
  expect(from).toHaveBeenCalledWith('tasks');
});

test('returns missing for an unavailable task without claiming whether RLS hid it', async () => {
  const { service } = setup([reply(null)]);
  const result = await service.fetchTask('gone');
  expect(result).toMatchObject({ ok: false, error: { code: 'notFound' } });
});

test('edits supported task fields and preserves a date-only due date', async () => {
  const { service, from } = setup([reply(taskRow({ title: 'New title', description: 'Notes', priority: 'high', due_date: '2026-12-25' }))]);
  const result = await service.updateTask('task-1', { title: 'New title', description: 'Notes', priority: 'high', dueDate: '2026-12-25' });
  expect(result).toEqual({ ok: true, data: expect.objectContaining({ dueDate: '2026-12-25', priority: 'high' }) });
  const builder = from.mock.results[0].value as Record<string, jest.Mock>;
  expect(builder.update).toHaveBeenCalledWith({ title: 'New title', description: 'Notes', priority: 'high', due_date: '2026-12-25' });
});

test('rejects invalid calendar dates without timezone conversion', async () => {
  const { service, from } = setup([]);
  const result = await service.updateTask('task-1', { dueDate: '2026-02-30' });
  expect(result).toMatchObject({ ok: false, error: { code: 'validation' } });
  expect(from).not.toHaveBeenCalled();
});

test('rejects an edit with only undefined fields before sending an empty update', async () => {
  const { service, from } = setup([]);
  expect(await service.updateTask('task-1', { title: undefined })).toMatchObject({ ok: false, error: { code: 'validation' } });
  expect(from).not.toHaveBeenCalled();
});

test('moves a task by relying on the database RLS check for the destination workspace', async () => {
  const { service, from } = setup([reply(taskRow({ workspace_id: 'workspace-2' }))]);
  const result = await service.moveTask('task-1', 'workspace-2');
  expect(result).toMatchObject({ ok: true, data: { workspaceId: 'workspace-2' } });
  const builder = from.mock.results[0].value as Record<string, jest.Mock>;
  expect(builder.update).toHaveBeenCalledWith({ workspace_id: 'workspace-2' });
});

test('completes and reopens through conditional status updates, allowing the database trigger to record events', async () => {
  const completed = setup([reply(taskRow({ status: 'completed' }))]);
  const done = await completed.service.completeTask('task-1');
  expect(done).toMatchObject({ ok: true, data: { status: 'completed' } });
  const completeBuilder = completed.from.mock.results[0].value as Record<string, jest.Mock>;
  expect(completeBuilder.update).toHaveBeenCalledWith({ status: 'completed' });
  expect(completeBuilder.eq).toHaveBeenCalledWith('status', 'active');

  const reopened = setup([reply(taskRow())]);
  const again = await reopened.service.reopenTask('task-1');
  expect(again).toMatchObject({ ok: true, data: { status: 'active' } });
  const reopenBuilder = reopened.from.mock.results[0].value as Record<string, jest.Mock>;
  expect(reopenBuilder.update).toHaveBeenCalledWith({ status: 'active' });
  expect(reopenBuilder.eq).toHaveBeenCalledWith('status', 'completed');
});

test('reports duplicate completion as a conflict and does not create another transition', async () => {
  const { service } = setup([reply(null), reply(taskRow({ status: 'completed' }))]);
  const result = await service.completeTask('task-1');
  expect(result).toMatchObject({ ok: false, error: { code: 'conflict' } });
});

test('archives and restores without changing completion state', async () => {
  const archived = setup([reply(taskRow({ status: 'completed', archived_at: '2026-11-22T13:00:00.000Z' }))]);
  const archiveResult = await archived.service.archiveTask('task-1');
  expect(archiveResult).toMatchObject({ ok: true, data: { status: 'completed', archivedAt: expect.any(String) } });
  const restored = setup([reply(taskRow({ status: 'completed', archived_at: null }))]);
  const restoreResult = await restored.service.restoreTask('task-1');
  expect(restoreResult).toMatchObject({ ok: true, data: { status: 'completed', archivedAt: null } });
});

test('fetches transition history and RLS-authorized workspace options', async () => {
  const { service, from } = setup([
    reply([{ id: 'event-1', task_id: 'task-1', event_type: 'completed', actor_user_id: 'synthetic-user', occurred_at: '2026-11-22T14:00:00.000Z' }]),
    reply([{ id: 'workspace-1', name: 'Personal', slug: 'personal-1', workspace_type: 'personal', privacy: 'private' }]),
  ]);
  expect(await service.fetchTaskEvents('task-1')).toMatchObject({ ok: true, data: [expect.objectContaining({ eventType: 'completed' })] });
  expect(await service.fetchWorkspaceOptions()).toMatchObject({ ok: true, data: [expect.objectContaining({ workspaceType: 'personal' })] });
  expect(from).toHaveBeenCalledWith('task_events');
  expect(from).toHaveBeenCalledWith('workspaces');
});

test('maps permission and network errors without reporting success', async () => {
  const denied = setup([reply(null, { code: '42501', status: 403 })]);
  expect(await denied.service.fetchAllTasks()).toMatchObject({ ok: false, error: { code: 'permission', retryable: false } });
  const offline = setup([reply(null, { status: 0, message: 'network fetch failed' })]);
  expect(await offline.service.fetchAllTasks()).toMatchObject({ ok: false, error: { code: 'network', retryable: true } });
});

test('discards a response if the authenticated account changes while it is in flight', async () => {
  const other = { ...testSession(), user: { ...testSession().user, id: 'other-user' } };
  const { service, auth } = setup([reply([taskRow()])], [testSession(), other]);
  const result = await service.fetchAllTasks();
  expect(result).toMatchObject({ ok: false, error: { code: 'authentication' } });
  expect(auth.getSession).toHaveBeenCalledTimes(2);
});

// Compile-time assurance that the public result remains strongly typed for callers.
const typedTask: Task = { id: 'id', workspaceId: 'workspace', createdBy: 'user', title: 'title', description: null, priority: 'normal', status: 'active', dueDate: null, isInbox: true, archivedAt: null, createdAt: '', updatedAt: '' };
void typedTask;
