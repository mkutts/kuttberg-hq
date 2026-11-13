import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { useAppUpdates } from '../updates/useAppUpdates';
import { AppButton } from './ui/AppButton';
import { AppCard } from './ui/AppCard';
import { AppText } from './ui/AppText';
import { SectionHeader } from './ui/SectionHeader';

type UpdateControls = {
  status: string;
  button?: {
    label: string;
    action: 'check' | 'download' | 'restart';
    hint?: string;
    busy?: boolean;
  };
  error?: boolean;
};

function updateControls(state: ReturnType<typeof useAppUpdates>['state']): UpdateControls {
  const rollback = 'target' in state && state.target === 'rollback';
  const downloadLabel = rollback ? 'Prepare Rollback' : 'Download Update';
  const restartLabel = rollback ? 'Restart to Roll Back' : 'Restart to Update';

  switch (state.kind) {
    case 'unsupported':
      return { status: 'App updates can be checked in an installed Kuttberg HQ preview or production build.' };
    case 'idle':
      return { status: 'Ready to check for updates.', button: { label: 'Check for Updates', action: 'check' } };
    case 'checking':
      return {
        status: 'Checking for updates…',
        button: { label: 'Check for Updates', action: 'check', busy: true },
      };
    case 'upToDate':
      return {
        status: 'No compatible update is available for this build.',
        button: { label: 'Check for Updates', action: 'check' },
      };
    case 'available':
      return {
        status: rollback ? 'A rollback to the built-in version is available.' : 'An update is available.',
        button: { label: downloadLabel, action: 'download' },
      };
    case 'downloading':
      return {
        status: rollback ? 'Preparing the rollback…' : 'Downloading update…',
        button: { label: downloadLabel, action: 'download', busy: true },
      };
    case 'ready':
      return {
        status: rollback ? 'Rollback ready. Restart to load the built-in version.' : 'Update downloaded. Restart to apply it.',
        button: { label: restartLabel, action: 'restart' },
      };
    case 'restarting':
      return {
        status: 'Restarting the app…',
        button: { label: restartLabel, action: 'restart', busy: true },
      };
    case 'checkError':
      return {
        status: 'Could not check for updates. Check your connection and try again.',
        button: { label: 'Retry', hint: 'Checks for updates again', action: 'check' },
        error: true,
      };
    case 'downloadError':
      return {
        status: rollback ? 'Could not prepare the rollback. Try again.' : 'Could not download the update. Check your connection and try again.',
        button: {
          label: 'Retry',
          hint: rollback ? 'Tries to prepare the rollback again' : 'Tries to download the update again',
          action: 'download',
        },
        error: true,
      };
    case 'nothingDownloaded':
      return {
        status: 'No update was downloaded. Check again to see what’s available.',
        button: { label: 'Check for Updates', action: 'check' },
      };
    case 'restartError':
      return {
        status: 'Could not restart the app. Try again.',
        button: { label: 'Retry', hint: 'Tries to restart the app again', action: 'restart' },
        error: true,
      };
  }
}

export function AppUpdatesSection() {
  const updates = useAppUpdates();
  const [showDetails, setShowDetails] = useState(false);
  const { status, button, error } = updateControls(updates.state);
  const { kind } = updates.state;

  useEffect(() => {
    if (Platform.OS === 'ios' && kind !== 'idle' && kind !== 'unsupported') {
      AccessibilityInfo.announceForAccessibility(status);
    }
  }, [kind, status]);

  return (
    <AppCard style={styles.card}>
      <SectionHeader title="App Updates" />
      <View>
        <AppText variant="caption">Installed version {updates.version ?? 'Unavailable'}</AppText>
        <AppText variant="caption">Build number {updates.build ?? 'Unavailable'}</AppText>
      </View>
      <AppText
        accessibilityLiveRegion="polite"
        style={error ? styles.error : undefined}
      >
        {status}
      </AppText>
      {button && (
        <AppButton
          label={button.label}
          accessibilityHint={button.hint}
          loading={button.busy}
          onPress={() => { void updates[button.action](); }}
        />
      )}
      <AppText variant="caption">
        Some changes, including app icons and native features, require installing a new app version.
      </AppText>
      <AppButton
        label={showDetails ? 'Hide Update Details' : 'Show Update Details'}
        variant="secondary"
        onPress={() => setShowDetails((shown) => !shown)}
      />
      {showDetails && (
        <View style={styles.details}>
          <AppText variant="caption">Channel {updates.channel ?? 'Unavailable'}</AppText>
          <AppText variant="caption">Runtime version {updates.runtimeVersion ?? 'Unavailable'}</AppText>
          <AppText variant="caption">Running update ID {updates.updateId ?? 'Unavailable'}</AppText>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  details: { gap: spacing.xs },
  error: { color: colors.error },
});
