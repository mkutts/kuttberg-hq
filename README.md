# Kuttberg HQ

Kuttberg HQ is intended to be a private household command center for two people. The app shares one codebase across iOS and Android using Expo SDK 58, React Native, Expo Router, and strict TypeScript. Jest and React Native Testing Library cover navigation and component behavior.

## Milestone 01

Task 08 adds development-build setup for both platforms. See the [milestone verification record](docs/milestone-01-verification.md) for build results and outstanding checks.

- **Today** shows a greeting and date based on the device’s local time when the tab gains focus or the app returns to the foreground. The overview and four future sections describe what is planned.
- **Routines, Wellness, Responsibilities, and Inbox** each have a dedicated tab with a purpose statement and a **Coming soon** card.
- **Settings** shows installed app and build information, manual app updates, planned preferences, and privacy information. The gear on Today opens Settings, and **Back to Today** returns to the tabs.
- **Shared UI** includes theme tokens, buttons, cards, headings, safe-area screens, and reusable loading, empty, and error states. The design-system fixture exercises the states and demo actions under Jest. It lives in `src/dev/DesignSystemPreview.tsx`, outside the app routes.

Authentication, Supabase, household data storage and sync, functional household tasks, notifications, reminders, and AI are planned for later milestones.

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

The `development` profile uses the EAS development environment and internal distribution. It produces an Android APK and targets a physical iPhone for iOS. Confirm which Expo account and project should own the builds, and verify build allowance or cost before submitting either build.

1. Run `npx eas-cli whoami`. If signed out, run `npx eas-cli login` and enter credentials in the terminal or browser prompt. Use `npx eas-cli init --id <project-id>` to link the approved existing EAS project, or run `npx eas-cli init` and select the approved owner if a new project is needed. Confirm the link with `npx eas-cli project:info`.
2. For **Android**, run `npx eas-cli build --profile development --platform android`. Open the build link on the phone and install the APK. For an emulator, download the APK and run `adb install <path-to-apk>`.
3. For **iPhone**, confirm active Apple Developer Program membership, a team member with signing access, and an available bundle identifier. Run `npx eas-cli device:create` and follow its registration link on the test iPhone. Then run `npx eas-cli build --profile development --platform ios` interactively so EAS can prepare the signing certificate and an ad hoc provisioning profile that includes that iPhone. Open the build link on the registered phone to install and enable Developer Mode if prompted. Windows can submit this cloud build. Running the iOS Simulator requires a Mac. See [Expo's physical iPhone workflow](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/).

The iOS bundle identifier and Android application ID are both `com.mkutts.kuttberghq`. Use the iOS identifier with the intended Apple team. On Android, the new ID installs as a separate app from the `com.example.kuttberghq` preview and starts with its own local data. Both installs can handle `kuttberg-hq://` links if they coexist. Future updates to the new Android installation require compatible signing. Verify package ownership in Google Play Console and the intended Android signing credentials in EAS before distribution.

### Install a standalone preview on iPhone

The `development` build requires Metro to load the app during development. The `preview` build bundles JavaScript and assets so the installed app opens directly from its icon without Metro.

```sh
npx eas-cli@latest build --platform ios --profile preview
```

Run the build interactively when ready to create the preview. Your wife's registered iPhone must be included in the Ad Hoc provisioning profile used to sign the build. Select her device when EAS prompts for devices, then open the resulting installation link on her iPhone. See [Expo's internal distribution guide](https://docs.expo.dev/build/internal-distribution/).

### Connect to Metro

Run `npm run start:dev` if Metro is not already running. Put the test phone and computer on the same Wi-Fi network, open the installed Kuttberg HQ app, and scan the Metro QR code or select the server in its launcher. In an Android emulator, press **a** in the Metro terminal. If a phone cannot reach the server over Wi-Fi, use `npm run start:dev -- --tunnel` or check the local network and firewall. Rebuild the development client after changing native dependencies or native app configuration. The ignored `android/` folder generated for the previous preview may still contain `com.example.kuttberghq`. Preserve any local native edits you need, then regenerate that folder with `npx expo prebuild --platform android` before rebuilding locally. In SDK 58, the command regenerates the folder by default.

The floating Expo Tools button is disabled because it covered the Settings gear on narrow screens. Shake a physical test phone to open the developer menu.

## EAS Update infrastructure

The project `mkutts/kuttberg-hq` uses `https://u.expo.dev/32c14ce4-a3e8-4dcd-af19-49cdc676b3bb` for updates. New standalone builds select updates by platform, channel, and runtime version.

| Build profile | Distribution | Update channel | EAS environment |
| --- | --- | --- | --- |
| `development` | Internal development client with Metro | No fixed channel | `development` |
| `preview` | Internal standalone build for physical iPhone and Android | `preview` | `preview` |
| `production` | Store build for approved releases | `production` | `production` |

The `appVersion` runtime policy uses `expo.version`. Task 02.3 configured app and runtime version `1.1.0`, distinct from the previous `1.0.0` installs. Build numbers and Android version codes are managed separately from this runtime policy. When the Expo SDK, native dependencies, permissions, config plugins, or other native configuration change, bump `expo.version` and create new approved native builds for the affected platforms before publishing updates for that runtime. Keep the same runtime for compatible JavaScript and bundled asset changes. [Expo runtime version guide](https://docs.expo.dev/eas-update/runtime-versions/)

Standalone builds start immediately with a cached or embedded bundle. `updates.checkAutomatically` is `NEVER`, so there is no automatic server check at launch. In **Settings → App Updates**, **Check for Updates** calls `checkForUpdateAsync()`. When Expo offers a compatible update, **Download Update** calls `fetchUpdateAsync()`. A confirmed download enables **Restart to Update**, which calls `reloadAsync()` when pressed. Expo can also load a downloaded update on the next cold start. In Expo Go and Metro, Settings explains which builds support manual updates. **Show Update Details** displays the channel, runtime, and currently running update ID when available. [Expo SDK 58 Updates API](https://docs.expo.dev/versions/v58.0.0/sdk/updates/)

Task 02.4 adds `expo-application` to read installed version and build metadata from the native binary. Before releasing this change, bump `expo.version` above `1.1.0` and create separately approved native builds for iOS and Android. Publish this code only for the new runtime that includes the module. [Expo SDK 58 Application API](https://docs.expo.dev/versions/v58.0.0/sdk/application/)

Every OTA publication requires explicit owner approval and a manual release. GitHub Actions and EAS Workflows must never publish updates for this project. Use the environment that matches the approved channel and verify the channel's branch mapping and runtime before publishing. Before the first release, the owner must confirm the linked EAS project, remote channel mappings, environment values, signing access, and any connected release automation. The environments can have different values and the profiles can use different signing credentials. Keep secrets out of app config, source, and client bundles.

Validate without publishing by running the quality checks below and `npx expo config --type introspect --json`. Confirm the generated iOS plist and Android manifest/resources show updates enabled, the project URL, launch checking set to `NEVER`, and the intended runtime. Review both standalone profiles in `eas.json`. With authenticated EAS access, use `npx eas-cli project:info`, `npx eas-cli channel:list`, and `npx eas-cli config --platform <ios|android> --profile <preview|production> --non-interactive` to inspect remote project/channel state and resolved profiles without submitting builds. Check environment configuration in the Expo dashboard.

## Device verification

### Milestone 02 branding

The launcher icons and native splash use the approved Frances artwork. The `expo-splash-screen` plugin in `app.json` centers the transparent artwork at a width of 200 on a `#FEEED0` cream background on both platforms.

When standalone preview builds are available, verify the **Kuttberg HQ** home-screen label and Frances icon on both phones. On Android, check the icon in the launcher and app drawer, and confirm the new package installs alongside the previous preview. Fully close and cold-launch each app to check the centered artwork on the cream splash background. Then verify that Today, the five tabs, and Settings open as expected.

### Milestone 02 OTA verification

1. After separate approval for builds and a preview publication, install the new standalone preview on a physical iPhone and Android phone. Cold-launch each app with Metro disconnected. In Settings, confirm the installed version and build number against the binary. Open **Show Update Details** and record the `preview` channel, runtime version, and running update ID if present.
2. Before a compatible preview update is published, tap **Check for Updates** and verify the no-compatible-update result. With the app already open, disconnect the network, check again, then reconnect and use **Retry**.
3. Once an approved preview update for the same runtime and both platforms is published, check again and confirm **Download Update** appears. Verify that the running update ID and content stay the same while downloading and afterward, until you restart. Tap **Restart to Update**, reopen Settings, and compare the running ID and visible content with the published update. The installed native version and build number should remain the same.
4. Verify that an update available only on another channel or runtime is excluded on both phones. Check the busy and error announcements with VoiceOver on iPhone and TalkBack on Android. Production delivery requires its own approved release verification.

### App navigation and accessibility

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

Start Metro with `npm run start:dev`, connect the installed app, then open `kuttberg-hq://dev-state-preview` on the device. On an Android emulator, run `adb shell am start -a android.intent.action.VIEW -d kuttberg-hq://dev-state-preview com.mkutts.kuttberghq`. On iPhone, open the link from a local note and accept the prompt. Delete only the temporary file when finished, before exporting, building, or staging changes. The Jest fixture remains available at `src/dev/DesignSystemPreview.tsx`.

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
