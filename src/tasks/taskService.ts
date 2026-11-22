import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient } from '../supabase/client';

export const taskPriorities = ['low', 'normal', 'high'] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskStatus = 'active' | 'completed';
export type TaskEventType = 'completed' | 'reopened';

export type Task = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  isInbox: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskEvent = {
  id: string;
  taskId: string;
  eventType: TaskEventType;
  actorUserId: string;
  occurredAt: string;
};

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  workspaceType: 'location' | 'pet' | 'hoa' | 'personal';
  privacy: 'shared' | 'private';
};

export type CreateTaskInput = {
  workspaceId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  isInbox?: boolean;
};

export type EditTaskInput = {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
};

export type TaskServiceErrorCode = 'validation' | 'authentication' | 'permission' | 'notFound' | 'network' | 'conflict' | 'database';
export type TaskServiceError = { code: TaskServiceErrorCode; message: string; retryable: boolean };
export type TaskResult<T> = { ok: true; data: T } | { ok: false; error: TaskServiceError };

type SessionIdentity = { userId: string };
type SupabaseError = { code?: string; message?: string; status?: number };

const taskColumns = 'id, workspace_id, created_by, title, description, priority, status, due_date, is_inbox, archived_at, created_at, updated_at';
const eventColumns = 'id, task_id, event_type, actor_user_id, occurred_at';
const workspaceColumns = 'id, name, slug, workspace_type, privacy';
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function failure<T>(code: TaskServiceErrorCode, message: string, retryable = false): TaskResult<T> {
  return { ok: false, error: { code, message, retryable } };
}

function validDateOnly(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateTitle(value: string): TaskServiceError | null {
  if (value.trim().length === 0) return { code: 'validation', message: 'Task title is required.', retryable: false };
  if (value.length > 255) return { code: 'validation', message: 'Task title must be 255 characters or fewer.', retryable: false };
  return null;
}

function validateInput(input: CreateTaskInput | EditTaskInput, creating: boolean): TaskServiceError | null {
  if (creating && !('workspaceId' in input && input.workspaceId.trim())) return { code: 'validation', message: 'A workspace is required.', retryable: false };
  if (creating && !('title' in input)) return { code: 'validation', message: 'Task title is required.', retryable: false };
  if ('title' in input && input.title !== undefined) {
    const titleError = validateTitle(input.title);
    if (titleError) return titleError;
  }
  if ('priority' in input && input.priority !== undefined && !taskPriorities.includes(input.priority)) {
    return { code: 'validation', message: 'Task priority is invalid.', retryable: false };
  }
  if ('dueDate' in input && input.dueDate !== undefined && input.dueDate !== null && !validDateOnly(input.dueDate)) {
    return { code: 'validation', message: 'Due date must be a valid YYYY-MM-DD calendar date.', retryable: false };
  }
  return null;
}

function mapTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.workspace_id !== 'string' || typeof row.created_by !== 'string' ||
    typeof row.title !== 'string' || typeof row.priority !== 'string' || typeof row.status !== 'string' ||
    typeof row.is_inbox !== 'boolean' || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null;
  if (!taskPriorities.includes(row.priority as TaskPriority) || (row.status !== 'active' && row.status !== 'completed')) return null;
  if (row.description !== null && typeof row.description !== 'string') return null;
  if (row.due_date !== null && typeof row.due_date !== 'string') return null;
  if (row.archived_at !== null && typeof row.archived_at !== 'string') return null;
  return { id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by, title: row.title,
    description: row.description as string | null, priority: row.priority as TaskPriority, status: row.status,
    dueDate: row.due_date as string | null, isInbox: row.is_inbox, archivedAt: row.archived_at as string | null,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapEvent(value: unknown): TaskEvent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.task_id !== 'string' || typeof row.actor_user_id !== 'string' ||
    typeof row.occurred_at !== 'string' || (row.event_type !== 'completed' && row.event_type !== 'reopened')) return null;
  return { id: row.id, taskId: row.task_id, eventType: row.event_type, actorUserId: row.actor_user_id, occurredAt: row.occurred_at };
}

function mapWorkspace(value: unknown): WorkspaceOption | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.slug !== 'string' ||
    !['location', 'pet', 'hoa', 'personal'].includes(row.workspace_type as string) || !['shared', 'private'].includes(row.privacy as string)) return null;
  return { id: row.id, name: row.name, slug: row.slug, workspaceType: row.workspace_type as WorkspaceOption['workspaceType'], privacy: row.privacy as WorkspaceOption['privacy'] };
}

function databaseFailure<T>(error: SupabaseError): TaskResult<T> {
  if (error.status === 401) return failure('authentication', 'Sign in to manage tasks.');
  if (error.code === '42501' || error.status === 403) return failure('permission', 'You no longer have access to this task.', false);
  const network = error.status === 0 || /network|fetch|timed out|offline/i.test(error.message ?? '');
  return failure(network ? 'network' : 'database', network ? 'Unable to reach the task service. Try again.' : 'The task request could not be completed.', network);
}

function thrownFailure<T>(error: unknown): TaskResult<T> {
  const candidate = error && typeof error === 'object' ? error as SupabaseError : {};
  return databaseFailure(candidate);
}

/**
 * Task data access is deliberately stateless. Every request establishes the current
 * authenticated identity, and checks it again before returning data to the caller.
 */
export function createTaskService(getClient: () => SupabaseClient = getSupabaseClient) {
  const identity = async (client: SupabaseClient): Promise<TaskResult<SessionIdentity>> => {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user.id || (data.session.expires_at !== undefined && data.session.expires_at * 1000 <= Date.now())) {
        return failure('authentication', 'Sign in to manage tasks.');
      }
      return { ok: true, data: { userId: data.session.user.id } };
    } catch {
      return failure('network', 'Unable to verify your session. Try again.', true);
    }
  };

  const sameIdentity = async <T>(client: SupabaseClient, before: SessionIdentity, value: T): Promise<TaskResult<T>> => {
    const after = await identity(client);
    if (!after.ok) return after;
    if (after.data.userId !== before.userId) return failure('authentication', 'Your account changed. The task result was discarded.');
    return { ok: true, data: value };
  };

  const run = async <T>(work: (client: SupabaseClient, session: SessionIdentity) => Promise<TaskResult<T>>): Promise<TaskResult<T>> => {
    let client: SupabaseClient;
    try {
      client = getClient();
    } catch {
      return failure('database', 'The task service is unavailable.');
    }
    const session = await identity(client);
    if (!session.ok) return session;
    let result: TaskResult<T>;
    try {
      result = await work(client, session.data);
    } catch (error) {
      return thrownFailure(error);
    }
    if (!result.ok) return result;
    return sameIdentity(client, session.data, result.data);
  };

  const one = async (query: PromiseLike<{ data: unknown; error: SupabaseError | null }>): Promise<TaskResult<Task>> => {
    const { data, error } = await query;
    if (error) return databaseFailure(error);
    const task = mapTask(data);
    return task ? { ok: true, data: task } : failure('notFound', 'Task was not found or is no longer available.');
  };

  return {
    async createTask(input: CreateTaskInput): Promise<TaskResult<Task>> {
      const validation = validateInput(input, true);
      if (validation) return { ok: false, error: validation };
      return run(async (client, session) => one(client.from('tasks').insert({ workspace_id: input.workspaceId, created_by: session.userId,
        title: input.title, description: input.description ?? null, priority: input.priority ?? 'normal', due_date: input.dueDate ?? null,
        is_inbox: input.isInbox ?? true }).select(taskColumns).single()));
    },
    async fetchActiveInboxTasks(): Promise<TaskResult<Task[]>> {
      return run(async (client) => {
        const { data, error } = await client.from('tasks').select(taskColumns).eq('is_inbox', true).eq('status', 'active').is('archived_at', null).order('created_at', { ascending: false });
        if (error) return databaseFailure(error);
        const tasks = (data as unknown[] ?? []).map(mapTask);
        return tasks.every(Boolean) ? { ok: true, data: tasks as Task[] } : failure('database', 'Task data was malformed.');
      });
    },
    async fetchAllTasks(): Promise<TaskResult<Task[]>> {
      return run(async (client) => {
        const { data, error } = await client.from('tasks').select(taskColumns).order('created_at', { ascending: false });
        if (error) return databaseFailure(error);
        const tasks = (data as unknown[] ?? []).map(mapTask);
        return tasks.every(Boolean) ? { ok: true, data: tasks as Task[] } : failure('database', 'Task data was malformed.');
      });
    },
    async fetchTask(taskId: string): Promise<TaskResult<Task>> {
      return run(async (client) => one(client.from('tasks').select(taskColumns).eq('id', taskId).maybeSingle()));
    },
    async updateTask(taskId: string, input: EditTaskInput): Promise<TaskResult<Task>> {
      const validation = validateInput(input, false);
      if (validation) return { ok: false, error: validation };
      const patch: Record<string, string | null> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate;
      if (!Object.keys(patch).length) return failure('validation', 'Choose at least one task field to update.');
      return run(async (client) => one(client.from('tasks').update(patch).eq('id', taskId).select(taskColumns).maybeSingle()));
    },
    async moveTask(taskId: string, workspaceId: string): Promise<TaskResult<Task>> {
      if (!workspaceId.trim()) return failure('validation', 'A workspace is required.');
      return run(async (client) => one(client.from('tasks').update({ workspace_id: workspaceId }).eq('id', taskId).select(taskColumns).maybeSingle()));
    },
    async completeTask(taskId: string): Promise<TaskResult<Task>> { return transition(taskId, 'active', 'completed'); },
    async reopenTask(taskId: string): Promise<TaskResult<Task>> { return transition(taskId, 'completed', 'active'); },
    async archiveTask(taskId: string): Promise<TaskResult<Task>> {
      return run(async (client) => one(client.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', taskId).select(taskColumns).maybeSingle()));
    },
    async restoreTask(taskId: string): Promise<TaskResult<Task>> {
      return run(async (client) => one(client.from('tasks').update({ archived_at: null }).eq('id', taskId).select(taskColumns).maybeSingle()));
    },
    async fetchTaskEvents(taskId: string): Promise<TaskResult<TaskEvent[]>> {
      return run(async (client) => {
        const { data, error } = await client.from('task_events').select(eventColumns).eq('task_id', taskId).order('occurred_at', { ascending: false });
        if (error) return databaseFailure(error);
        const events = (data as unknown[] ?? []).map(mapEvent);
        return events.every(Boolean) ? { ok: true, data: events as TaskEvent[] } : failure('database', 'Task history data was malformed.');
      });
    },
    async fetchWorkspaceOptions(): Promise<TaskResult<WorkspaceOption[]>> {
      return run(async (client) => {
        const { data, error } = await client.from('workspaces').select(workspaceColumns).order('name', { ascending: true });
        if (error) return databaseFailure(error);
        const workspaces = (data as unknown[] ?? []).map(mapWorkspace);
        return workspaces.every(Boolean) ? { ok: true, data: workspaces as WorkspaceOption[] } : failure('database', 'Workspace data was malformed.');
      });
    },
  };

  async function transition(taskId: string, from: TaskStatus, to: TaskStatus): Promise<TaskResult<Task>> {
    return run(async (client) => {
      const result = await one(client.from('tasks').update({ status: to }).eq('id', taskId).eq('status', from).select(taskColumns).maybeSingle());
      if (result.ok || result.error.code !== 'notFound') return result;
      const current = await one(client.from('tasks').select(taskColumns).eq('id', taskId).maybeSingle());
      if (current.ok && current.data.status === to) return failure('conflict', `Task is already ${to}.`);
      return current;
    });
  }
}

export const taskService = createTaskService();
