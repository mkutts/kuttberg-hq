import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { AppScreen } from '../components/ui/AppScreen';
import { AppText } from '../components/ui/AppText';
import { colors, radii, spacing } from '../theme';
import { taskService, type WorkspaceOption } from './taskService';

type QuickCaptureService = Pick<typeof taskService, 'createTask' | 'fetchWorkspaceOptions'>;

type QuickCaptureProps = {
  onDismiss: () => void;
  service?: QuickCaptureService;
};

function workspaceLabel(workspace: WorkspaceOption): string {
  return `${workspace.name} / ${workspace.privacy === 'private' ? 'Private' : 'Shared'}`;
}

export function QuickCapture({ onDismiss, service = taskService }: QuickCaptureProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [showWorkspaceChoices, setShowWorkspaceChoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const submittingRef = useRef(false);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await service.fetchWorkspaceOptions();
      if (!active) return;
      setLoadingWorkspaces(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      const personalWorkspace = result.data.find((workspace) =>
        workspace.workspaceType === 'personal' && workspace.privacy === 'private',
      );
      if (!personalWorkspace) {
        setError('Your private Personal workspace is unavailable. Capture cannot be saved until it is restored.');
        return;
      }
      setWorkspaces(result.data);
      setWorkspaceId(personalWorkspace.id);
    })();
    return () => { active = false; };
  }, [service]);

  const save = async () => {
    if (saving || submittingRef.current) return;
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    if (!workspaceId) {
      setError('Choose an authorized workspace before saving.');
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setError(null);
    const result = await service.createTask({
      workspaceId,
      title: title.trim(),
      description: notes.trim() || null,
      priority: 'normal',
      dueDate: null,
      isInbox: true,
    });
    submittingRef.current = false;
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    Keyboard.dismiss();
    setSaved(true);
  };

  const addAnother = () => {
    setTitle('');
    setNotes('');
    setError(null);
    setSaved(false);
  };

  if (saved) {
    return (
      <AppScreen scroll edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
        <View style={styles.heading}>
          <AppText variant="screenTitle" accessibilityRole="header">Task saved</AppText>
          <AppText variant="secondaryBody">It is in {selectedWorkspace?.name ?? 'your'} Inbox and ready when you are.</AppText>
        </View>
        <AppButton label="Add another task" onPress={addAnother} />
        <AppButton label="Done" variant="secondary" onPress={onDismiss} />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.heading}>
        <AppText variant="screenTitle" accessibilityRole="header">Quick Capture</AppText>
        <AppText variant="secondaryBody">Add it now. It will land in Inbox with normal priority.</AppText>
      </View>

      <AppCard style={styles.form}>
        <View style={styles.field}>
          <AppText variant="buttonLabel">Task title</AppText>
          <TextInput
            accessibilityLabel="Task title"
            autoFocus
            editable={!saving}
            maxLength={255}
            onChangeText={setTitle}
            onSubmitEditing={() => void save()}
            placeholder="What needs doing?"
            placeholderTextColor={colors.secondaryText}
            returnKeyType="done"
            style={styles.input}
            value={title}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="buttonLabel">Notes <AppText variant="caption">(optional)</AppText></AppText>
          <TextInput
            accessibilityLabel="Notes, optional"
            editable={!saving}
            multiline
            onChangeText={setNotes}
            placeholder="Add context if it helps"
            placeholderTextColor={colors.secondaryText}
            style={[styles.input, styles.notes]}
            textAlignVertical="top"
            value={notes}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="buttonLabel">Workspace</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose workspace"
            accessibilityHint="Select an authorized workspace for this task"
            disabled={loadingWorkspaces || saving || workspaces.length === 0}
            onPress={() => setShowWorkspaceChoices((visible) => !visible)}
            style={({ pressed }) => [styles.workspaceButton, pressed && styles.pressed]}
          >
            <AppText>{loadingWorkspaces ? 'Loading workspaces…' : selectedWorkspace ? workspaceLabel(selectedWorkspace) : 'Workspace unavailable'}</AppText>
            <AppText variant="caption">{showWorkspaceChoices ? 'Hide choices' : 'Change'}</AppText>
          </Pressable>
          {showWorkspaceChoices && workspaces.map((workspace) => (
            <Pressable
              key={workspace.id}
              accessibilityRole="button"
              accessibilityLabel={`Use ${workspaceLabel(workspace)}`}
              disabled={saving}
              onPress={() => { setWorkspaceId(workspace.id); setShowWorkspaceChoices(false); }}
              style={({ pressed }) => [styles.workspaceChoice, workspace.id === workspaceId && styles.workspaceChoiceSelected, pressed && styles.pressed]}
            >
              <AppText>{workspaceLabel(workspace)}</AppText>
              <AppText variant="caption">{workspace.workspaceType === 'personal' ? 'Personal' : 'Shared household'}</AppText>
            </Pressable>
          ))}
        </View>

        {error && <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText>}
      </AppCard>

      <View style={styles.actions}>
        <AppButton label="Save task" loading={saving} disabled={loadingWorkspaces || !workspaceId} onPress={() => void save()} />
        <AppButton label="Cancel" variant="secondary" disabled={saving} onPress={onDismiss} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', gap: spacing['2xl'] },
  heading: { gap: spacing.xs },
  form: { gap: spacing.xl },
  field: { gap: spacing.sm },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input, backgroundColor: colors.elevated, color: colors.text, fontSize: 17, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  notes: { minHeight: 104 },
  workspaceButton: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input, backgroundColor: colors.elevated, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center', gap: spacing.xs },
  workspaceChoice: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input, padding: spacing.md, gap: spacing.xs },
  workspaceChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.secondaryPressed },
  pressed: { opacity: 0.8 },
  error: { color: colors.error },
  actions: { gap: spacing.md },
});
