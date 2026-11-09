# Kuttberg HQ

Kuttberg HQ is a private household command center for two people. The app targets iOS and Android and uses Expo SDK 58, React Native, Expo Router, and strict TypeScript. It uses npm and is intended for source control on GitHub.

## Get started

Install Git, npm, and Node.js 22.13 or newer on the Node 22 release line, or a newer supported LTS release such as Node 24.3 or later. Open a terminal in the project folder and run:

```sh
npm ci
npm start
```

To open the app on a physical phone, install an Expo Go release that supports SDK 58, connect the phone and computer to the same Wi-Fi network, and scan the QR code. On iOS, use Camera. On Android, use Expo Go. Check current SDK compatibility at [Expo Go downloads](https://expo.dev/go).

## Run on iOS or Android

| Platform | Setup | Command |
| --- | --- | --- |
| iOS Simulator | On a Mac, install a compatible Xcode and an iOS Simulator runtime. Open the simulator. | `npm run ios` |
| Android Emulator | Install Android Studio and the Android SDK, configure Android SDK platform tools, then start an emulator in Device Manager. | `npm run android` |

If compatible Expo Go is unavailable for your target, use `npx expo run:ios` on a Mac with Xcode or `npx expo run:android` with the Android SDK and JDK configured. These commands build and install the app locally. See [Expo's local build setup](https://docs.expo.dev/guides/local-app-development/).

Run `npm start` on your computer and open the project in Expo Go on each phone using the QR code. Check that the app opens to **Today** and shows a greeting and date that match your phone. Scroll from **Your daily overview** through **Up Next**, **Routines**, **Responsibilities**, and **Waiting On**. Check that the last row is readable above the tab bar. Tap the other four tabs and look for the matching heading and **Coming soon** card, then return to Today. Check that the active tab has an outlined sage pill, every label is readable, and the tab bar clears the system controls. On Android, press Back from a secondary tab to return to Today. Close and reopen the app and tap the tabs again.

Repeat with larger system text and system dark mode. With VoiceOver or TalkBack, check that each tab announces its full name and selected state. The Responsibilities label can wrap across two lines on smaller screens or at larger text sizes. Tab labels scale up to 160% and fit to the available width. Screen content follows the system text size.

On each phone, tap the gear at the top of Today. Check that **Settings** shows the app name, version, and privacy information, and that each future preference says **Coming later**. The tab bar is hidden on Settings. Tap **Back to Today** and confirm all five tabs are visible again. On Android, reopen Settings and repeat with the system Back button or gesture. Open Routines, Wellness, Responsibilities, and Inbox and check each tab's purpose and **Coming soon** card. Repeat the Settings flow with larger system text and confirm you can scroll to Privacy.

## Development checks

```sh
npm run lint
npm run typecheck
npm test
npx expo install --check
npx expo export --platform all
npx expo-doctor
```

Jest and React Native Testing Library cover the five tabs, Settings navigation and content, shared components, and the Today dashboard, including its local greeting and date on return. Task 01 was verified on an iPhone and an Android phone. Tasks 02–05 were verified on a physical Android phone and still need physical iPhone checks.

## Milestone 01, Task 05 of 8

The five main routes live in `app/(tabs)`. Today has a scrollable dashboard with a welcome header that refreshes when the tab gains focus, a daily overview card, and four sections labeled **Coming later**. Routines, Wellness, Responsibilities, and Inbox share an informational layout with a distinct icon and a preview of planned features. The gear on Today opens `app/settings.tsx` in the root stack. Settings reads the version from the Expo configuration and displays future preferences as informational text.

Shared colors, typography, spacing, and radii live in `src/theme`. `AppText`, `AppButton`, `AppCard`, `AppScreen`, and `SectionHeader` live in `src/components/ui`. The original design-system preview remains in `src/dev/DesignSystemPreview.tsx` for development reference.

Both platforms use the temporary development identifier `com.example.kuttberghq`. Confirm and replace it before a production release. Expo generates the native project directories locally when needed.

## Milestone 01, Task 06 of 8

`src/components/states` exports `LoadingState`, `EmptyState`, and `ErrorState` for use inside cards or screen sections. `LoadingState` displays an indeterminate indicator and an optional custom message. `EmptyState` describes an empty result and can show a decorative icon or a caller-supplied action. Keep **Coming soon** for planned features. `ErrorState` accepts a user-facing message and shows **Try again** when the caller provides `onRetry`.

The design-system preview includes all three states and both variants of the optional actions. Its demo buttons update local preview text. Run `npm test -- design-system-preview states` to exercise the fixture and components. The fixture is outside the app routes. Viewing it on a phone requires a separate development-only entry point.
