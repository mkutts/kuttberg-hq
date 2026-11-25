import { useFocusEffect, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useAuth } from '../../src/auth/AuthProvider';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppScreen } from '../../src/components/ui/AppScreen';
import { AppText } from '../../src/components/ui/AppText';
import { colors, radii, spacing } from '../../src/theme';
import { taskService, type Task, type WorkspaceOption } from '../../src/tasks/taskService';

type ViewMode = 'Inbox' | 'All Tasks';
type Loaded = { tasks: Task[]; workspaces: WorkspaceOption[] };

type State = { data: Loaded | null; loading: boolean; refreshing: boolean; error: string | null };

function errorMessage(code: string) {
  if (code === 'authentication') return 'Your session has expired. Please sign in again.';
  if (code === 'network') return 'Could not connect. Check your internet connection and try again.';
  return 'Could not load tasks. Please try again.';
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dueLabel(date: string, today: string) {
  const [year, month, day] = date.split('-').map(Number);
  const formatted = new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return date < today ? `Overdue · ${formatted}` : date === today ? `Due today · ${formatted}` : `Due ${formatted}`;
}

export default function InboxScreen() {
  const { status, session } = useAuth();
  const userId = status === 'signedIn' ? session?.user.id : undefined;
  return userId ? <TaskList key={userId} /> : null;
}

function TaskList() {
  const [mode, setMode] = useState<ViewMode>('Inbox');
  const [state, setState] = useState<State>({ data: null, loading: true, refreshing: false, error: null });
  const generation = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    setState((previous) => ({ ...previous, loading: !previous.data, refreshing: refresh, error: null }));
    try {
      const [tasks, workspaces] = await Promise.all([taskService.fetchAllTasks(), taskService.fetchWorkspaceOptions()]);
      if (generation.current !== request) return;
      if (!tasks.ok || !workspaces.ok) {
        const error = !tasks.ok ? tasks.error : !workspaces.ok ? workspaces.error : null;
        setState({ data: null, loading: false, refreshing: false, error: errorMessage(error?.code ?? 'database') });
        return;
      }
      setState({ data: { tasks: tasks.data, workspaces: workspaces.data }, loading: false, refreshing: false, error: null });
    } catch {
      if (generation.current === request) setState({ data: null, loading: false, refreshing: false, error: errorMessage('network') });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const today = localDate();
  const tasks = (state.data?.tasks ?? []).filter((task) => task.status === 'active' && !task.archivedAt && (mode === 'All Tasks' || task.isInbox))
    .sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const names = new Map(state.data?.workspaces.map((workspace) => [workspace.id, workspace.name]));

  return (
    <AppScreen edges={['top', 'left', 'right']} contentStyle={styles.screen}>
      <FlatList testID="task-list"
        data={tasks}
        keyExtractor={(task) => task.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl testID="task-refresh" refreshing={state.refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.heading}>
              <AppText variant="screenTitle" accessibilityRole="header">Inbox</AppText>
              <AppText variant="secondaryBody">Capture now. Organize later.</AppText>
            </View>
            <AppButton label="Capture a task" accessibilityHint="Open Quick Capture" onPress={() => router.push('/quick-capture')} />
            <View style={styles.switcher} accessibilityRole="radiogroup">
              {(['Inbox', 'All Tasks'] as const).map((item) => (
                <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: mode === item }} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.selected]}>
                  <AppText variant="buttonLabel">{item}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={state.loading ? (
          <AppText accessibilityLiveRegion="polite">Loading tasks…</AppText>
        ) : state.error ? (
          <AppCard style={styles.message}>
            <AppText accessibilityRole="alert">{state.error}</AppText>
            <AppButton label="Try again" onPress={() => void load()} />
          </AppCard>
        ) : (
          <AppCard style={styles.message}>
            <AppText variant="cardTitle">{mode === 'Inbox' ? 'Your Inbox is empty' : 'No active tasks'}</AppText>
            <AppText variant="secondaryBody">{mode === 'Inbox' ? 'Capture a task to get started.' : 'Your active tasks will appear here.'}</AppText>
          </AppCard>
        )}
        renderItem={({ item }) => (
          <AppCard style={styles.task} accessible accessibilityLabel={[item.title, names.get(item.workspaceId) ?? 'Workspace unavailable', item.dueDate ? dueLabel(item.dueDate, today) : null, item.priority !== 'normal' ? `${item.priority} priority` : null].filter(Boolean).join(', ')}>
            <AppText variant="cardTitle">{item.title}</AppText>
            <AppText variant="secondaryBody">{names.get(item.workspaceId) ?? 'Workspace unavailable'}</AppText>
            {item.dueDate && <AppText variant="caption" style={item.dueDate < today ? styles.overdue : undefined}>{dueLabel(item.dueDate, today)}</AppText>}
            {item.priority !== 'normal' && <AppText variant="caption">{item.priority === 'high' ? 'High priority' : 'Low priority'}</AppText>}
          </AppCard>
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingVertical: 0 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: spacing['2xl'], gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.xl, marginBottom: spacing.md },
  heading: { gap: spacing.xs },
  switcher: { flexDirection: 'row', borderRadius: radii.button, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, padding: spacing.xs },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.input, padding: spacing.sm },
  selected: { backgroundColor: colors.secondaryPressed },
  task: { gap: spacing.xs },
  message: { gap: spacing.md },
  overdue: { color: colors.error },
});
