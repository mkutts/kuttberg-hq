import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

type UpdateTarget = 'update' | 'rollback';

type UpdateState =
  | { kind: 'unsupported' | 'idle' | 'checking' | 'upToDate' | 'checkError' | 'nothingDownloaded' }
  | { kind: 'available' | 'downloading' | 'downloadError' | 'ready' | 'restarting' | 'restartError'; target: UpdateTarget };

type NativeUpdateState = ReturnType<typeof import('expo-updates')['useUpdates']>;

function displayedState(state: UpdateState, native: NativeUpdateState | null): UpdateState {
  // Keep a manual request visible until it settles; then native progress takes precedence.
  if (!native || state.kind === 'unsupported' || state.kind === 'checking' ||
      state.kind === 'downloading' || state.kind === 'restarting') return state;
  const target: UpdateTarget = (native.downloadedUpdate?.type ?? native.availableUpdate?.type) === 'rollback'
    ? 'rollback' : 'update';
  if (native.isUpdatePending) return { kind: 'ready', target };
  if (native.isDownloading) return { kind: 'downloading', target };
  if (native.isChecking || native.isStartupProcedureRunning) return { kind: 'checking' };
  if (state.kind !== 'idle') return state;
  if (native.downloadError) return { kind: 'downloadError', target };
  if (native.checkError) return { kind: 'checkError' };
  return state;
}

function readNativeUpdates() {
  const isExpoGo = isRunningInExpoGo();
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
  // An older Metro client can load this bundle before it has these native modules.
  const application: typeof import('expo-application') | null =
    isMobile && !isExpoGo && requireOptionalNativeModule('ExpoApplication')
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- The SDK wrapper requires its native module at import time.
      ? require('expo-application')
      : null;
  const updates: typeof import('expo-updates') | null =
    isMobile && !isExpoGo && !__DEV__ && requireOptionalNativeModule('ExpoUpdates')
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- The SDK wrapper requires its native module at import time.
      ? require('expo-updates')
      : null;

  return {
    api: updates?.isEnabled && updates.channel ? updates : null,
    version: application?.nativeApplicationVersion ?? null,
    build: application?.nativeBuildVersion ?? null,
    channel: updates?.channel ?? null,
    runtimeVersion: updates?.runtimeVersion ?? null,
    updateId: updates?.updateId ?? null,
    automatic: updates?.checkAutomatically === 'ON_LOAD',
  };
}

type AppUpdates = Omit<ReturnType<typeof readNativeUpdates>, 'api'> & {
  state: UpdateState;
  check: () => Promise<void>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
};

const AppUpdatesContext = createContext<AppUpdates | null>(null);

export function AppUpdatesProvider({ children }: { children: ReactNode }) {
  const [{ api, ...metadata }] = useState(readNativeUpdates);
  if (api) return <NativeAppUpdatesProvider api={api} metadata={metadata}>{children}</NativeAppUpdatesProvider>;
  return <AppUpdatesManager api={null} metadata={metadata}>{children}</AppUpdatesManager>;
}

type UpdateApi = NonNullable<ReturnType<typeof readNativeUpdates>['api']>;
type UpdateMetadata = Omit<ReturnType<typeof readNativeUpdates>, 'api'>;

function NativeAppUpdatesProvider({ api, metadata, children }: { api: UpdateApi; metadata: UpdateMetadata; children: ReactNode }) {
  const native = api.useUpdates();
  return <AppUpdatesManager api={api} metadata={metadata} native={native}>{children}</AppUpdatesManager>;
}

function AppUpdatesManager({ api, metadata, native = null, children }: {
  api: UpdateApi | null; metadata: UpdateMetadata; native?: NativeUpdateState | null; children: ReactNode;
}) {
  const [state, setState] = useState<UpdateState>({ kind: api ? 'idle' : 'unsupported' });
  const current = useRef(state);

  function isNativeBusy() {
    return !!native && (native.isChecking || native.isDownloading || native.isStartupProcedureRunning);
  }

  function transition(next: UpdateState) {
    // Guard subsequent presses immediately, before React renders the disabled control.
    current.current = next;
    setState(next);
  }

  async function check() {
    const { kind } = displayedState(current.current, native);
    const canCheck = kind === 'idle' || kind === 'upToDate' || kind === 'checkError' || kind === 'nothingDownloaded';
    if (!api || !canCheck || isNativeBusy() || native?.isUpdatePending) {
      return;
    }

    transition({ kind: 'checking' });
    try {
      const result = await api.checkForUpdateAsync();
      if (result.isRollBackToEmbedded) {
        transition({ kind: 'available', target: 'rollback' });
      } else if (result.isAvailable) {
        transition({ kind: 'available', target: 'update' });
      } else {
        transition({ kind: 'upToDate' });
      }
    } catch {
      transition({ kind: 'checkError' });
    }
  }

  async function download() {
    const next = displayedState(current.current, native);
    if (!api || (next.kind !== 'available' && next.kind !== 'downloadError') || isNativeBusy() || native?.isUpdatePending) return;

    const { target } = next;
    transition({ kind: 'downloading', target });
    try {
      const result = await api.fetchUpdateAsync();
      if (result.isRollBackToEmbedded) {
        transition({ kind: 'ready', target: 'rollback' });
      } else if (result.isNew) {
        transition({ kind: 'ready', target: 'update' });
      } else {
        transition({ kind: 'nothingDownloaded' });
      }
    } catch {
      transition({ kind: 'downloadError', target });
    }
  }

  async function restart() {
    const next = displayedState(current.current, native);
    if (!api || (next.kind !== 'ready' && next.kind !== 'restartError')) return;

    const { target } = next;
    transition({ kind: 'restarting', target });
    try {
      await api.reloadAsync();
    } catch {
      transition({ kind: 'restartError', target });
    }
  }

  return (
    <AppUpdatesContext.Provider value={{ ...metadata, state: displayedState(state, native), check, download, restart }}>
      {children}
    </AppUpdatesContext.Provider>
  );
}

export function useAppUpdates() {
  const updates = useContext(AppUpdatesContext);
  if (!updates) throw new Error('useAppUpdates requires AppUpdatesProvider');
  return updates;
}
