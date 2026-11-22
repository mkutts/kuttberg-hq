import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import * as Updates from 'expo-updates';
import type { ReactNode } from 'react';

import config from '../app.json';
import { AppUpdatesSection } from '../src/components/AppUpdatesSection';
import { AppUpdatesProvider, useAppUpdates } from '../src/updates/useAppUpdates';

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  isRunningInExpoGo: jest.fn(),
  requireOptionalNativeModule: jest.fn(),
}));

const mockApplication = { nativeApplicationVersion: '2.3.4', nativeBuildVersion: '57' };
jest.mock('expo-application', () => mockApplication);

const mockDiagnostics = {
  isEnabled: true,
  channel: 'preview' as string | null,
  runtimeVersion: '2.3.4' as string | null,
  updateId: 'c2e8d0c4-688a-4142-86aa-c7252cbbd186' as string | null,
  checkAutomatically: 'ON_LOAD' as 'ON_LOAD' | 'NEVER',
};
const mockNativeState = {
  isStartupProcedureRunning: false,
  isChecking: false,
  isDownloading: false,
  isUpdatePending: false,
  availableUpdate: undefined as { type: Updates.UpdateInfoType } | undefined,
  downloadedUpdate: undefined as { type: Updates.UpdateInfoType } | undefined,
  checkError: undefined as Error | undefined,
  downloadError: undefined as Error | undefined,
};

jest.mock('expo-updates', () => ({
  get isEnabled() { return mockDiagnostics.isEnabled; },
  get channel() { return mockDiagnostics.channel; },
  get runtimeVersion() { return mockDiagnostics.runtimeVersion; },
  get updateId() { return mockDiagnostics.updateId; },
  get checkAutomatically() { return mockDiagnostics.checkAutomatically; },
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  useUpdates: jest.fn(() => mockNativeState),
}));

const check = jest.mocked(Updates.checkForUpdateAsync);
const fetchUpdate = jest.mocked(Updates.fetchUpdateAsync);
const reload = jest.mocked(Updates.reloadAsync);
const lookupNativeModule = jest.mocked(requireOptionalNativeModule);
const runningInExpoGo = jest.mocked(isRunningInExpoGo);
const checkLabel = 'Check for Updates';
const downloadLabel = 'Download Update';
const restartLabel = 'Restart to Update';
const manifest = { id: 'b42ae4e3-40d1-4a0f-b652-432e0b4cb83d' } as Updates.Manifest;
const available: Updates.UpdateCheckResult = {
  isAvailable: true, isRollBackToEmbedded: false, manifest, reason: undefined,
};
const noUpdate: Updates.UpdateCheckResult = {
  isAvailable: false, isRollBackToEmbedded: false, manifest: undefined,
  reason: 'noUpdateAvailableOnServer' as Updates.UpdateCheckResultNotAvailableReason,
};
const downloaded: Updates.UpdateFetchResult = { isNew: true, isRollBackToEmbedded: false, manifest };
const reactNativeGlobals = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDev = reactNativeGlobals.__DEV__;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(Updates.useUpdates).mockImplementation(() => mockNativeState as ReturnType<typeof Updates.useUpdates>);
  reactNativeGlobals.__DEV__ = false;
  lookupNativeModule.mockReturnValue({});
  runningInExpoGo.mockReturnValue(false);
  Object.assign(mockDiagnostics, {
    isEnabled: true,
    channel: 'preview',
    runtimeVersion: '2.3.4',
    updateId: 'c2e8d0c4-688a-4142-86aa-c7252cbbd186',
    checkAutomatically: 'ON_LOAD',
  });
  Object.assign(mockNativeState, {
    isStartupProcedureRunning: false,
    isChecking: false,
    isDownloading: false,
    isUpdatePending: false,
    availableUpdate: undefined,
    downloadedUpdate: undefined,
    checkError: undefined,
    downloadError: undefined,
  });
  check.mockResolvedValue(available);
  fetchUpdate.mockResolvedValue(downloaded);
  reload.mockResolvedValue(undefined);
});

afterEach(() => {
  reactNativeGlobals.__DEV__ = originalDev;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function UpdatesView({ showSection = true }: { showSection?: boolean }) {
  return <AppUpdatesProvider>{showSection && <AppUpdatesSection />}</AppUpdatesProvider>;
}

function press(name: string) {
  return fireEvent.press(screen.getByRole('button', { name }));
}

test('native launch policy downloads in the background for the appVersion runtime', () => {
  expect(config.expo.updates).toMatchObject({ checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 });
  expect(config.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
});

test('an older NEVER binary retains manual controls without claiming automatic downloads', async () => {
  mockDiagnostics.checkAutomatically = 'NEVER';
  await render(<UpdatesView />);
  expect(screen.getByRole('button', { name: checkLabel })).toBeOnTheScreen();
  expect(screen.queryByText(/compatible updates download automatically/i)).toBeNull();
});

test('native startup check and download block competing manual requests', async () => {
  mockNativeState.isStartupProcedureRunning = true;
  mockNativeState.isChecking = true;
  const wrapper = ({ children }: { children: ReactNode }) => <AppUpdatesProvider>{children}</AppUpdatesProvider>;
  const { result, rerender } = await renderHook(useAppUpdates, { wrapper });
  expect(result.current.state.kind).toBe('checking');
  await act(() => result.current.check());
  expect(check).not.toHaveBeenCalled();

  mockNativeState.isChecking = false;
  mockNativeState.isDownloading = true;
  await rerender({});
  expect(result.current.state.kind).toBe('downloading');
  await act(() => result.current.check());
  expect(check).not.toHaveBeenCalled();
  expect(fetchUpdate).not.toHaveBeenCalled();

  mockNativeState.isStartupProcedureRunning = false;
  mockNativeState.isDownloading = false;
  await rerender({});
  await act(() => result.current.check());
  expect(check).toHaveBeenCalledTimes(1);
});

test('native download is ready for a later cold launch, with optional manual restart', async () => {
  mockNativeState.isUpdatePending = true;
  mockNativeState.downloadedUpdate = { type: 'new' as Updates.UpdateInfoType };
  await render(<UpdatesView />);
  expect(screen.getByText('Update downloaded. Close and reopen the app, or restart now.')).toBeOnTheScreen();
  expect(reload).not.toHaveBeenCalled();
  expect(check).not.toHaveBeenCalled();
  await press(restartLabel);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('native rollback and startup failures remain recoverable in Settings', async () => {
  mockNativeState.isUpdatePending = true;
  mockNativeState.downloadedUpdate = { type: 'rollback' as Updates.UpdateInfoType };
  const { rerender } = await render(<UpdatesView />);
  expect(screen.getByText('Rollback ready. Close and reopen to load the built-in version, or restart now.')).toBeOnTheScreen();
  expect(reload).not.toHaveBeenCalled();

  mockNativeState.isUpdatePending = false;
  mockNativeState.downloadedUpdate = undefined;
  mockNativeState.checkError = new Error('offline');
  await rerender(<UpdatesView />);
  expect(screen.getByText(/could not check for updates/i)).toBeOnTheScreen();
  await press('Retry');
  expect(check).toHaveBeenCalledTimes(1);
});

test('a failed native startup download can be retried manually', async () => {
  mockNativeState.downloadError = new Error('offline');
  mockNativeState.availableUpdate = { type: 'new' as Updates.UpdateInfoType };
  await render(<UpdatesView />);
  expect(screen.getByText(/could not download the update/i)).toBeOnTheScreen();
  await press('Retry');
  expect(fetchUpdate).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
});

test.each(['upToDate', 'checkError', 'available', 'nothingDownloaded', 'downloadError', 'ready', 'restartError'] as const)
  ('a native pending update replaces stale manual %s without another request', async (manualKind) => {
    const wrapper = ({ children }: { children: ReactNode }) => <AppUpdatesProvider>{children}</AppUpdatesProvider>;
    const { result, rerender } = await renderHook(useAppUpdates, { wrapper });

    if (manualKind === 'upToDate') check.mockResolvedValueOnce(noUpdate);
    if (manualKind === 'checkError') check.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.check());
    if (manualKind === 'nothingDownloaded') {
      fetchUpdate.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: false, manifest: undefined });
    }
    if (manualKind === 'downloadError') fetchUpdate.mockRejectedValueOnce(new Error('offline'));
    if (['nothingDownloaded', 'downloadError', 'ready', 'restartError'].includes(manualKind)) {
      await act(() => result.current.download());
    }
    if (manualKind === 'restartError') {
      reload.mockRejectedValueOnce(new Error('reload error'));
      await act(() => result.current.restart());
    }
    expect(result.current.state.kind).toBe(manualKind);

    const priorCalls = [check.mock.calls.length, fetchUpdate.mock.calls.length, reload.mock.calls.length];
    mockNativeState.isUpdatePending = true;
    mockNativeState.downloadedUpdate = { type: 'new' as Updates.UpdateInfoType };
    await rerender({});
    expect(result.current.state).toEqual({ kind: 'ready', target: 'update' });
    await act(async () => {
      await Promise.all([result.current.check(), result.current.download()]);
    });
    expect([check.mock.calls.length, fetchUpdate.mock.calls.length, reload.mock.calls.length]).toEqual(priorCalls);
    await act(() => result.current.restart());
    expect(reload).toHaveBeenCalledTimes(priorCalls[2] + 1);
  });

test('native check, download, and rollback supersede a stale no-update result', async () => {
  check.mockResolvedValueOnce(noUpdate);
  const wrapper = ({ children }: { children: ReactNode }) => <AppUpdatesProvider>{children}</AppUpdatesProvider>;
  const { result, rerender } = await renderHook(useAppUpdates, { wrapper });
  await act(() => result.current.check());
  expect(result.current.state.kind).toBe('upToDate');

  mockNativeState.isChecking = true;
  await rerender({});
  expect(result.current.state.kind).toBe('checking');
  await act(() => result.current.check());
  expect(check).toHaveBeenCalledTimes(1);

  mockNativeState.isChecking = false;
  mockNativeState.isDownloading = true;
  mockNativeState.availableUpdate = { type: 'rollback' as Updates.UpdateInfoType };
  await rerender({});
  expect(result.current.state).toEqual({ kind: 'downloading', target: 'rollback' });
  await act(() => result.current.download());
  expect(fetchUpdate).not.toHaveBeenCalled();

  mockNativeState.isDownloading = false;
  mockNativeState.isUpdatePending = true;
  mockNativeState.downloadedUpdate = { type: 'rollback' as Updates.UpdateInfoType };
  await rerender({});
  expect(result.current.state).toEqual({ kind: 'ready', target: 'rollback' });
  mockNativeState.downloadedUpdate = { type: 'new' as Updates.UpdateInfoType };
  await rerender({});
  expect(result.current.state).toEqual({ kind: 'ready', target: 'update' });
  mockNativeState.downloadedUpdate = { type: 'rollback' as Updates.UpdateInfoType };
  await rerender({});
  await act(() => result.current.restart());
  expect(reload).toHaveBeenCalledTimes(1);
});

test('an active manual check finishes before the native pending result is displayed', async () => {
  const pending = deferred<Updates.UpdateCheckResult>();
  check.mockReturnValueOnce(pending.promise);
  const wrapper = ({ children }: { children: ReactNode }) => <AppUpdatesProvider>{children}</AppUpdatesProvider>;
  const { result, rerender } = await renderHook(useAppUpdates, { wrapper });
  let request!: Promise<void>;
  await act(async () => { request = result.current.check(); });
  mockNativeState.isUpdatePending = true;
  mockNativeState.downloadedUpdate = { type: 'new' as Updates.UpdateInfoType };
  await rerender({});
  expect(result.current.state.kind).toBe('checking');
  await act(() => result.current.restart());
  expect(reload).not.toHaveBeenCalled();

  await act(async () => { pending.resolve(noUpdate); await request; });
  expect(result.current.state).toEqual({ kind: 'ready', target: 'update' });
  expect(check).toHaveBeenCalledTimes(1);
});

test('shows native version and build, starts idle, and reveals running diagnostics on demand', async () => {
  await render(<UpdatesView />);

  expect(screen.getByText('Installed version 2.3.4')).toBeOnTheScreen();
  expect(screen.getByText('Build number 57')).toBeOnTheScreen();
  expect(screen.getByText('Ready to check for updates.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: checkLabel, disabled: false })).toBeOnTheScreen();
  expect(screen.queryByText('Channel preview')).toBeNull();
  expect(check).not.toHaveBeenCalled();

  await press('Show Update Details');
  expect(screen.getByText('Channel preview')).toBeOnTheScreen();
  expect(screen.getByText('Runtime version 2.3.4')).toBeOnTheScreen();
  expect(screen.getByText(`Running update ID ${mockDiagnostics.updateId}`)).toBeOnTheScreen();
  await press('Hide Update Details');
  expect(screen.queryByText('Channel preview')).toBeNull();
});

test('shows a busy check and reports when no compatible update is available', async () => {
  const pending = deferred<Updates.UpdateCheckResult>();
  check.mockReturnValueOnce(pending.promise);
  await render(<UpdatesView />);
  await press(checkLabel);

  expect(screen.getByText('Checking for updates…')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: checkLabel, disabled: true, busy: true })).toBeOnTheScreen();
  await act(() => pending.resolve(noUpdate));

  expect(screen.getByText('No compatible update is available for this build.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: checkLabel, disabled: false })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: downloadLabel })).toBeNull();
  expect(fetchUpdate).not.toHaveBeenCalled();
});

test('downloads an available update and restarts only on explicit request', async () => {
  const pending = deferred<Updates.UpdateFetchResult>();
  fetchUpdate.mockReturnValueOnce(pending.promise);
  await render(<UpdatesView />);
  await press(checkLabel);
  expect(screen.getByText('An update is available.')).toBeOnTheScreen();
  expect(fetchUpdate).not.toHaveBeenCalled();

  await press(downloadLabel);
  expect(screen.getByText('Downloading update…')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: downloadLabel, disabled: true, busy: true })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: restartLabel })).toBeNull();
  await act(() => pending.resolve(downloaded));

  expect(screen.getByText('Update downloaded. Close and reopen the app, or restart now.')).toBeOnTheScreen();
  expect(reload).not.toHaveBeenCalled();
  await press(restartLabel);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Restarting the app…')).toBeOnTheScreen();
});

test('retries a failed check', async () => {
  check.mockRejectedValueOnce(new Error('network error'));
  await render(<UpdatesView />);
  await press(checkLabel);

  expect(screen.getByText(/could not check for updates/i)).toBeOnTheScreen();
  await press('Retry');
  expect(check).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: downloadLabel })).toBeOnTheScreen();
});

test('retries a failed download without restarting or checking again', async () => {
  fetchUpdate.mockRejectedValueOnce(new Error('network error'));
  await render(<UpdatesView />);
  await press(checkLabel);
  await press(downloadLabel);

  expect(screen.getByText(/could not download the update/i)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: restartLabel })).toBeNull();
  await press('Retry');
  expect(check).toHaveBeenCalledTimes(1);
  expect(fetchUpdate).toHaveBeenCalledTimes(2);
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: restartLabel })).toBeOnTheScreen();
});

test('allows a fresh check when the fetch resolves without an update', async () => {
  fetchUpdate.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: false, manifest: undefined });
  await render(<UpdatesView />);
  await press(checkLabel);
  await press(downloadLabel);

  expect(screen.getByText(/no update was downloaded/i)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: restartLabel })).toBeNull();
  expect(screen.getByRole('button', { name: checkLabel, disabled: false })).toBeOnTheScreen();
});

test('retries a failed restart without fetching again', async () => {
  reload.mockRejectedValueOnce(new Error('reload error'));
  await render(<UpdatesView />);
  await press(checkLabel);
  await press(downloadLabel);
  await press(restartLabel);

  expect(screen.getByText(/could not restart the app/i)).toBeOnTheScreen();
  await press('Retry');
  expect(fetchUpdate).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(2);
});

test('requires explicit preparation and restart for an Expo rollback directive', async () => {
  check.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: true, manifest: undefined, reason: undefined });
  fetchUpdate.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: true, manifest: undefined });
  await render(<UpdatesView />);
  await press(checkLabel);

  expect(screen.getByText('A rollback to the built-in version is available.')).toBeOnTheScreen();
  await press('Prepare Rollback');
  expect(screen.getByText('Rollback ready. Close and reopen to load the built-in version, or restart now.')).toBeOnTheScreen();
  expect(reload).not.toHaveBeenCalled();
  await press('Restart to Roll Back');
  expect(reload).toHaveBeenCalledTimes(1);
});

test.each(['Expo Go', 'Metro', 'missing native modules', 'disabled updates', 'missing channel'])
  ('guides users to a standalone build in %s', async (environment) => {
    if (environment === 'Expo Go') runningInExpoGo.mockReturnValue(true);
    if (environment === 'Metro') reactNativeGlobals.__DEV__ = true;
    if (environment === 'missing native modules') lookupNativeModule.mockReturnValue(null);
    if (environment === 'disabled updates') mockDiagnostics.isEnabled = false;
    if (environment === 'missing channel') mockDiagnostics.channel = null;
    await render(<UpdatesView />);

    expect(screen.getByText('App updates can be checked in an installed Kuttberg HQ preview or production build.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: checkLabel })).toBeNull();
    expect(screen.queryByText(/no compatible update/i)).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

test('reports unavailable metadata without presenting Expo Go host version or build', async () => {
  runningInExpoGo.mockReturnValue(true);
  await render(<UpdatesView />);
  await press('Show Update Details');

  for (const label of ['Installed version', 'Build number', 'Channel', 'Runtime version', 'Running update ID']) {
    expect(screen.getByText(`${label} Unavailable`)).toBeOnTheScreen();
  }
});

test('retains a download in progress and its result when the Settings section remounts', async () => {
  const pending = deferred<Updates.UpdateFetchResult>();
  fetchUpdate.mockReturnValueOnce(pending.promise);
  const { rerender } = await render(<UpdatesView />);
  await press(checkLabel);
  await press(downloadLabel);
  await rerender(<UpdatesView showSection={false} />);
  await rerender(<UpdatesView />);
  expect(screen.getByRole('button', { name: downloadLabel, disabled: true, busy: true })).toBeOnTheScreen();

  await rerender(<UpdatesView showSection={false} />);
  await act(() => pending.resolve(downloaded));
  await rerender(<UpdatesView />);
  expect(screen.getByRole('button', { name: restartLabel, disabled: false })).toBeOnTheScreen();
  expect(fetchUpdate).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
});

test('guards duplicate and conflicting calls before React renders the busy state', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => <AppUpdatesProvider>{children}</AppUpdatesProvider>;
  const { result } = await renderHook(useAppUpdates, { wrapper });

  for (const action of ['check', 'download', 'restart'] as const) {
    const actions = result.current;
    await act(async () => {
      await Promise.all([actions[action](), actions.check(), actions.download(), actions.restart()]);
    });
  }

  expect(check).toHaveBeenCalledTimes(1);
  expect(fetchUpdate).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
});
