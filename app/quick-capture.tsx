import { router } from 'expo-router';

import { QuickCapture } from '../src/tasks/QuickCapture';

export default function QuickCaptureScreen() {
  return <QuickCapture onDismiss={() => router.dismissTo('/inbox')} />;
}
