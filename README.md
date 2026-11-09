# Kuttberg HQ

Kuttberg HQ is intended to be a private household command center for two people. The app shares one codebase across iOS and Android using Expo SDK 58, React Native, Expo Router, and strict TypeScript. Jest and React Native Testing Library cover navigation and component behavior.

## Milestone 01

Task 07 is the quality and documentation checkpoint for the app foundation. See the [milestone verification record](docs/milestone-01-verification.md) for platform results and outstanding checks.

- **Today** shows a greeting and date based on the device’s local time when the tab gains focus or the app returns to the foreground. The overview and four future sections describe what is planned.
- **Routines, Wellness, Responsibilities, and Inbox** each have a dedicated tab with a purpose statement and a **Coming soon** card.
- **Settings** shows the app version, planned preferences, and privacy information. The gear on Today opens Settings, and **Back to Today** returns to the tabs.
- **Shared UI** includes theme tokens, buttons, cards, headings, safe-area screens, and reusable loading, empty, and error states. The design-system fixture exercises the states and demo actions under Jest. It lives in `src/dev/DesignSystemPreview.tsx`, outside the app routes.

Authentication, Supabase, household data storage and sync, functional household tasks, notifications, reminders, and AI are planned for later milestones. The current milestone has no household data or production service configuration. Both platforms use the temporary identifier `com.example.kuttberghq`. Development-build configuration and verification are planned for Task 08.

## Install and run

Install Git and a supported Node.js LTS release with npm. Use Node 22.13 or newer on the Node 22 line, or Node 24.3 or later on the Node 24 line. From the repository root:

```sh
npm ci
npm start
```

On a physical phone, install [Expo Go with SDK 58 support](https://expo.dev/go), connect the phone and computer to the same Wi-Fi network, and scan the terminal QR code. On iPhone, scan with Camera. On Android, use the scanner in Expo Go. If SDK 58 Expo Go is unavailable on your device, record the check as pending for development-build verification.

| Target | Setup | Command |
| --- | --- | --- |
| Android Emulator | Install Android Studio and the SDK platform tools. Start an emulator in Device Manager. | `npm run android` |
| iOS Simulator | On a Mac, install Xcode and a compatible iOS Simulator runtime. Open the simulator. | `npm run ios` |

## Device verification

1. Open the app on each phone and confirm it starts on Today. Check the local greeting and date. Scroll through **Your daily overview**, **Up Next**, **Routines**, **Responsibilities**, and **Waiting On**.
2. Open all four secondary tabs. Check the heading, purpose statement, and **Coming soon** card. Confirm the selected tab shows an outline and its label is readable. On Android, use system Back from a secondary tab and confirm it returns to Today.
3. Open Settings from the Today gear. Check the app name and version, the three **Coming later** labels, and the Privacy section. Confirm the tab bar is hidden. Use **Back to Today** and, on Android, repeat with system Back.
4. Repeat in system dark mode and with larger text. Check the screen edges, scroll to the bottom of Today and Settings, and look for clipping. The tab bar caps label scaling at 160% and can wrap Responsibilities across two lines.
5. With VoiceOver on iPhone and TalkBack on Android, check tab names and selection, focus order, headings, the Settings button, and the return path. For the Task 06 fixture, a separate development-only entry point is needed for direct device checks. Verify that the spinner and loading text align, the loading message is announced once, and **Try again** remains readable and tappable at larger text sizes.

## Quality checks

```sh
npm run lint
npm run typecheck
npm test
npm test -- --preset jest-expo/android
npm test -- --preset jest-expo/ios
npx expo install --check
npx expo export --platform all
npx expo-doctor
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy blocks the PowerShell wrappers. The export checks JavaScript bundles for both platforms. Native install, rendering, and screen-reader behavior require device or simulator checks.
