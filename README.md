# Kuttberg HQ

Kuttberg HQ is intended to be a private household command center for two people. The app shares one codebase across iOS and Android using Expo SDK 58, React Native, Expo Router, and strict TypeScript. Jest and React Native Testing Library cover navigation and component behavior.

## Milestone 01

Task 08 adds development-build setup for both platforms. See the [milestone verification record](docs/milestone-01-verification.md) for build results and outstanding checks.

- **Today** shows a greeting and date based on the device’s local time when the tab gains focus or the app returns to the foreground. The overview and four future sections describe what is planned.
- **Routines, Wellness, Responsibilities, and Inbox** each have a dedicated tab with a purpose statement and a **Coming soon** card.
- **Settings** shows the app version, planned preferences, and privacy information. The gear on Today opens Settings, and **Back to Today** returns to the tabs.
- **Shared UI** includes theme tokens, buttons, cards, headings, safe-area screens, and reusable loading, empty, and error states. The design-system fixture exercises the states and demo actions under Jest. It lives in `src/dev/DesignSystemPreview.tsx`, outside the app routes.

Authentication, Supabase, household data storage and sync, functional household tasks, notifications, reminders, and AI are planned for later milestones. The current milestone has no household data or production service configuration.

## Install and run with Expo Go

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

## Install and run a development build

Run `npm ci` first. A development build installs Kuttberg HQ as a separate app with a launcher that connects to Metro, the development server.

### Android on Windows

Install the Android SDK, platform tools and emulator with Android Studio. Set `ANDROID_HOME` to the SDK path and `JAVA_HOME` to a compatible JDK, such as the JDK 21 bundled with this workstation's Android Studio. Add the SDK's `platform-tools` folder to your PATH. This SDK 58 project uses Android SDK Platform 37, Build-Tools 37.0.0, NDK 27.1.12297006, and CMake 3.22.1. Gradle can download the packages if their licenses are already accepted. Start an emulator in Device Manager, or connect a phone with USB debugging enabled and approve the prompt on the phone. Check that `adb devices -l` lists it as `device`, then run:

```sh
npx expo run:android --device
```

Pick the target when prompted. Expo generates the ignored `android/` folder, builds and installs the debug APK, and starts Metro. This workflow uses local Android debug signing and works without an Expo account. See [Expo's Android environment setup](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=emulator&mode=development-build&buildEnv=local).

If the default ADB server on port 5037 hangs, open a separate PowerShell session, run `$env:ANDROID_ADB_SERVER_PORT = '5039'`, and retry device discovery and the Expo command in that session.

If Ninja reports `Filename longer than 260 characters`, open PowerShell in the generated `android/` directory and run `.\gradlew.bat :app:assembleDebug '-Pexpo.android.cmakeObjectPathMax=240'`. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` relative to the repository root. Install it with `adb install <path-to-apk>`, then start Metro from the repository root. For an x86_64 emulator-only build, also pass `'-PreactNativeArchitectures=x86_64'`.

### EAS cloud builds

The sole EAS profile, `development`, uses the EAS development environment and internal distribution. It produces an Android APK and targets a physical iPhone for iOS. Confirm which Expo account and project should own the builds, and verify build allowance or cost before submitting either build.

1. Run `npx eas-cli whoami`. If signed out, run `npx eas-cli login` and enter credentials in the terminal or browser prompt. Use `npx eas-cli init --id <project-id>` to link the approved existing EAS project, or run `npx eas-cli init` and select the approved owner if a new project is needed. Confirm the link with `npx eas-cli project:info`.
2. For **Android**, run `npx eas-cli build --profile development --platform android`. Open the build link on the phone and install the APK. For an emulator, download the APK and run `adb install <path-to-apk>`.
3. For **iPhone**, confirm active Apple Developer Program membership, a team member with signing access, and an available bundle identifier. Run `npx eas-cli device:create` and follow its registration link on the test iPhone. Then run `npx eas-cli build --profile development --platform ios` interactively so EAS can prepare the signing certificate and an ad hoc provisioning profile that includes that iPhone. Open the build link on the registered phone to install and enable Developer Mode if prompted. Windows can submit this cloud build. Running the iOS Simulator requires a Mac. See [Expo's physical iPhone workflow](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/).

Both platforms currently use `com.example.kuttberghq`. It is suitable for locally debug-signed Android builds. Before the first iOS signing setup, confirm a stable identifier such as `com.mkutts.kuttberghq` and check its availability on the intended Apple team. Coordinate any change with Android as well, since changing an identifier changes the installed app's identity.

### Connect to Metro

Run `npm run start:dev` if Metro is not already running. Put the test phone and computer on the same Wi-Fi network, open the installed Kuttberg HQ app, and scan the Metro QR code or select the server in its launcher. In an Android emulator, press **a** in the Metro terminal. If a phone cannot reach the server over Wi-Fi, use `npm run start:dev -- --tunnel` or check the local network and firewall. Rebuild the development client after changing native dependencies or native app configuration. If the ignored `android/` folder already exists, run `npx expo prebuild --platform android` to apply app configuration changes before rebuilding locally.

The floating Expo Tools button is disabled because it covered the Settings gear on narrow screens. Shake a physical test phone to open the developer menu.

## Device verification

1. Open the app on each phone and confirm it starts on Today. Check the local greeting and date. Scroll through **Your daily overview**, **Up Next**, **Routines**, **Responsibilities**, and **Waiting On**.
2. Open all four secondary tabs. Check the heading, purpose statement, and **Coming soon** card. Confirm the selected tab shows an outline and its label is readable. On Android, use system Back from a secondary tab and confirm it returns to Today.
3. Open Settings from the Today gear. Check the app name and version, the three **Coming later** labels, and the Privacy section. Confirm the tab bar is hidden. Use **Back to Today** and, on Android, repeat with system Back.
4. Repeat in system dark mode and with larger text. Check the screen edges, scroll to the bottom of Today and Settings, and look for clipping. The tab bar caps label scaling at 160% and can wrap Responsibilities across two lines.
5. With VoiceOver on iPhone and TalkBack on Android, check tab names and selection, focus order, headings, the Settings button, and the return path. Use the [consolidated checklist](docs/milestone-01-verification.md#manual-device-checklist) for the design system and interface states.

### Exercise the Task 06 fixture on a device

With a development build already installed, create a temporary local file named `app/dev-state-preview.tsx` that contains only:

```tsx
export { default } from '../src/dev/DesignSystemPreview';
```

Start Metro with `npm run start:dev`, connect the installed app, then open `kuttberg-hq://dev-state-preview` on the device. On an Android emulator, run `adb shell am start -a android.intent.action.VIEW -d kuttberg-hq://dev-state-preview com.example.kuttberghq`. On iPhone, open the link from a local note and accept the prompt. Delete only the temporary file when finished, before exporting, building, or staging changes. The Jest fixture remains available at `src/dev/DesignSystemPreview.tsx`.

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
