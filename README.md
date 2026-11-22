# Kuttberg HQ

Kuttberg HQ is intended to be a private household command center for two people. The app shares one codebase across iOS and Android using Expo SDK 58, React Native, Expo Router, and strict TypeScript. Jest and React Native Testing Library cover navigation and component behavior.

## Milestone 01

Task 08 adds development-build setup for both platforms. See the [milestone verification record](docs/milestone-01-verification.md) for build results and outstanding checks.

- **Today** shows a greeting and date based on the device’s local time when the tab gains focus or the app returns to the foreground. The overview and four future sections describe what is planned.
- **Routines, Wellness, Responsibilities, and Inbox** each have a dedicated tab with a purpose statement and a **Coming soon** card.
- **Settings** shows installed app and build information, manual app updates, planned preferences, and privacy information. The gear on Today opens Settings, and **Back to Today** returns to the tabs.
- **Shared UI** includes theme tokens, buttons, cards, headings, safe-area screens, and reusable loading, empty, and error states. The design-system fixture exercises the states and demo actions under Jest. It lives in `src/dev/DesignSystemPreview.tsx`, outside the app routes.

Email/password authentication and secure session handling are implemented in Milestone 03 Task 03. Household data storage and sync, functional household tasks, notifications, reminders, and AI remain planned for later tasks.

## Milestone 02

Kuttberg HQ has official Frances branding and automatic startup downloads in new standalone builds, with manual update controls in Settings. See the [Milestone 02 closure report](docs/milestone-02-closure.md) for the owner-reported iPhone and Android results and preview update record. Use the [release and rollback playbook](docs/release-playbook.md) for future releases.

## Milestone 03 development Supabase setup

1. Create a separate development project in the [Supabase Dashboard](https://supabase.com/dashboard). Keep the database password in your password manager. Under **Authentication**, verify that new-user signup and anonymous sign-ins are disabled. Account creation belongs to a later task.
2. In the project's **Connect** dialog, copy the **Project URL** and the **Publishable key**. Use the HTTPS origin, such as `https://YOUR_PROJECT_REF.supabase.co`, and the key with the `sb_publishable_` prefix. See the [Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native).
3. From the repository root, copy `.env.example` to `.env.local` and replace both placeholders. Keep `.env.local` out of Git. Expo inlines `EXPO_PUBLIC_` values into the JavaScript bundle, so reserve these variables for the project URL and publishable key. Keep secret and service-role keys, database passwords, user passwords, and access and refresh tokens out of app config, client code, and logs. The Task 02 database schema enforces access through RLS once applied. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
4. Run `npm ci` and `npm start`, then launch the app in SDK 58 Expo Go. Task 03 requires valid project configuration before sign-in or authenticated navigation. Missing or invalid configuration shows a recoverable setup error. Restart Metro after an independently authorized environment configuration change.

`getSupabaseClient()` in `src/supabase/client.ts` validates the two settings on first use and returns one client per JavaScript runtime. Missing and malformed settings produce errors naming the affected setting. Construction leaves session restoration, automatic refresh, and URL-based sign-in detection disabled. On iOS and Android, the supplied storage adapter uses Expo SecureStore for session data. It splits large entries into small encrypted items and uses device-only Keychain accessibility while unlocked on iOS. The Expo config plugin excludes SecureStore data from Android backup. iOS Keychain data can survive uninstall, so reinstalling is an unreliable way to clear a session. Other platforms use SDK in-memory storage. Avoid using real accounts or household data until authorization is implemented and tested.

Run `npm test -- supabase-` to exercise validation, lazy client wiring, and storage behavior with mocks, and `npm test -- auth-` for session and navigation tests. Task 03 uses the normal sign-in route for authentication checks; do not add an unguarded development route. SDK construction checks configuration shape, not that the URL and key belong to the same hosted project.

The Milestone 02 standalone iOS and Android binaries were built before SecureStore was added. An OTA update cannot add that native module. Before releasing code that loads SecureStore, bump the Expo app version so the existing `appVersion` policy assigns a runtime distinct from `1.1.0`. Build and verify new iOS and Android binaries with SecureStore on the preview channel before publishing a compatible update. See [Expo SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) and the [Expo runtime version guide](https://docs.expo.dev/eas-update/runtime-versions/).

The Milestone 03 Task 01 review accepted 30 reported npm audit findings as existing technical debt. Task 02 adds no npm dependencies and leaves that dependency review for separate work.

### Household schema and access control (Task 02)

| Table | Relationship | Authenticated read access |
| --- | --- | --- |
| `profiles` | One profile per Auth identity | The caller's profile |
| `households` | Parent of household memberships and workspaces | Households where the caller has a membership |
| `household_members` | One membership per household and Auth identity | The caller's memberships |
| `workspaces` | A household owns each workspace. A private workspace also has one owner who belongs to its household | Explicit grant for a shared workspace, or ownership of a private workspace |
| `workspace_members` | One grant per shared workspace and household member | The caller's grants |

All five tables enable RLS. The Data API roles receive no write grants. `anon` and `service_role` receive no grants on these tables. The read policies use the signed request subject via `auth.uid()` and deny Supabase anonymous sign-in sessions. Household and workspace policies look up the caller's membership in tables whose policies access only the request identity. This keeps the policy dependencies acyclic and requires no `SECURITY DEFINER` functions. Composite foreign keys prevent cross-household grants and grants on private workspaces. Household and workspace membership keys, workspace slugs, and a partial unique index for personal workspaces enforce uniqueness. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Data API privileges](https://supabase.com/docs/guides/api/securing-your-api).

### Local migrations and database tests

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and start a local Docker engine. From the repository root, use a disposable local stack. The reset command deletes data in that local stack and replays both migrations. Automatic seeding and local public signup are disabled.

```powershell
supabase start
supabase db reset --local --no-seed
supabase test db --local
supabase db lint --local --level warning --fail-on error
```

The pgTAP suite uses synthetic Auth records and sets the `anon` and `authenticated` PostgreSQL roles with simulated request claims. All fixtures roll back. It tests SQL policy and privilege behavior. Live JWT validation and Data API behavior, hosted settings, and device session behavior require separate integration checks. The local config pins PostgreSQL 17. Before a future hosted migration, check the development project's `SHOW server_version;` result and replay and test on the same major version. See [Supabase database tests](https://supabase.com/docs/guides/local-development/cli/testing-and-linting) and [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config).

### Administrator provisioning

1. After local tests pass and the owner authorizes hosted deployment, apply the reviewed versioned migrations to the separate development project through the Supabase CLI. Verify the target project before linking, dry-run the migration plan with `supabase db push --dry-run`, and apply only after reviewing that plan. In the Dashboard, confirm Auth signup and anonymous sign-ins are off and `kuttberg_private` is absent from the Data API exposed schemas.
2. In **Authentication → Users**, retrieve the UUIDs of two existing permanent accounts. Decide which account owns Nashville and which owns HOA. One account may own both. Keep the UUIDs and any credentials out of repository files.
3. In the development project's SQL Editor as the database administrator, run the full block with the approved UUIDs. The first run rolls back. Review its workspace output, then rerun the full block with `commit;` in place of `rollback;` after approval.

   ```sql
   begin;
   select kuttberg_private.provision_household(
     first_user_id => '<FIRST_AUTH_UUID>'::uuid,
     second_user_id => '<SECOND_AUTH_UUID>'::uuid,
     nashville_owner_id => '<NASHVILLE_OWNER_UUID>'::uuid,
     hoa_owner_id => '<HOA_OWNER_UUID>'::uuid
   );
   select workspace.slug, workspace.privacy, workspace.owner_user_id
   from public.workspaces as workspace
   join public.households as household on household.id = workspace.household_id
   where household.slug = 'kuttberg-hq'
   order by workspace.slug;
   rollback;
   ```

The routine uses caller privileges in the private schema. It creates the household, the two profiles and memberships, Jersey City, Martha's Vineyard and Frances with two explicit grants each, and Nashville, HOA and one Personal workspace per account with owner-only access. Repeating it with the same accounts and ownership preserves existing matching rows and restores missing expected grants. A conflicting account, workspace type, privacy, or ownership aborts the call without overwriting records. Use a separate reviewed administrative change for account removal, grant revocation, or ownership transfer. The membership foreign keys require an administrator to resolve ownership and membership before deleting an enrolled Auth account.

To roll back a failed provisioning attempt, roll back its transaction. For a disposable local database, replay the intended migration set with `supabase db reset --local --no-seed`. For an applied hosted schema, keep migration history intact and use a reviewed forward corrective migration. Take a backup before a change that could affect data. Any future authorized teardown must remove the provisioning function before removing its tables, and remove child tables before their parents. Hosted resets are outside this workflow.

Task 03 implements the app's session lifecycle, including explicit `auth.initialize()`, foreground refresh, and restoration. Device verification of persistence and removal remains separate. Use the signed-in Supabase session to query the read-only tables in a later task. Treat an empty authorized result as a valid state and verify both accounts through the Data API before storing household data. Structural writes remain administrative.

### Authentication and secure sessions (Task 03)

The root `AuthProvider` observes one session controller using the existing singleton Supabase client. It initializes the SDK, reads `auth.getSession()`, and listens to auth events. Loading and unavailable states show no protected pages. Newer events supersede pending session reads; an `INITIAL_SESSION` event with a null session is not sufficient evidence of sign-out because it can also represent a network failure. The existing encrypted SecureStore adapter persists and removes the session on iOS and Android.

The branded sign-in page supports email/password sign-in only. Today, all other tabs, and Settings use Expo Router `Stack.Protected`. Authenticated users are redirected away from sign-in. Settings offers **Sign out**, using Supabase's global scope: it removes this device's saved session on success and revokes refresh sessions on other devices. A failure stays visible and does not claim success. An already issued access token on another device may remain usable until expiry.

One AppState listener starts SDK auto-refresh in the foreground and stops it in the background. Foreground entry also rechecks the session. At access-token expiry, protected content is hidden pending restoration. A transient failure shows **Try again** and retries every 30 seconds while active without intentionally deleting saved credentials. Confirmed SDK sign-out events remove protected access. A locally restored, unexpired session is not a live server validation; remote revocation may only be discovered during refresh or a later server request. Route guards are UX controls; backend RLS remains the data security boundary.

Task 04 adds password recovery using an emailed eight-digit code, server verification, and an isolated password-change session. See the [Task 04 implementation report, email template and device checklist](docs/milestone-03-task-04.md). Task 04 acceptance and Task 03 live authentication/RLS verification remain pending. No signup, account creation, invitations, OAuth, or magic links are exposed. Public and anonymous signup must remain disabled in the hosted project; this task does not change or verify hosted settings. See the [Task 03 verification record and physical-device checklist](docs/milestone-03-task-03.md). Do not deliver this code to the old `1.1.0` standalone binaries; the SecureStore native-build prerequisite above still applies.

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

The `appVersion` runtime policy uses `expo.version`. Task 02.3 configured app and runtime version `1.1.0`, distinct from the previous `1.0.0` installs; Milestone 03 uses `1.2.0`. Build numbers and Android version codes are managed separately. Changes to the Expo SDK, native dependencies, permissions, config plugins, or native compatibility require a bumped `expo.version` and new approved native builds before publishing updates for that runtime. The `ON_LOAD` startup policy also requires a replacement binary, but changes no JavaScript/native compatibility and retains runtime `1.2.0`. Keep the same runtime for compatible JavaScript and bundled asset changes. [Expo runtime version guide](https://docs.expo.dev/eas-update/runtime-versions/)

New standalone builds use `updates.checkAutomatically: ON_LOAD` and `fallbackToCacheTimeout: 0`. On a cold launch, Expo checks and downloads compatible updates in the background while the app starts from a cached or embedded bundle. A completed download loads on the next cold launch. The native startup flow does not reload a running session. Settings observes native check, download, and pending states and avoids competing manual requests. **Check for Updates** calls `checkForUpdateAsync()` when idle; **Download Update** calls `fetchUpdateAsync()` when available. A confirmed download offers an optional **Restart to Update** control (`reloadAsync()`). Offline or failed startup checks leave the running bundle usable; Settings offers a retry. Expo Go and Metro do not support this standalone flow. **Show Update Details** displays the channel, runtime, and running update ID. The existing `1.2.0` builds have the old native `NEVER` policy and require one replacement binary per platform to gain automatic checks; an OTA cannot change that embedded policy. JavaScript compatibility remains tied to the `appVersion` runtime, currently `1.2.0`. [Expo SDK 58 Updates API](https://docs.expo.dev/versions/v58.0.0/sdk/updates/) · [Downloading updates](https://docs.expo.dev/eas-update/download-updates/)

Task 02.4 added `expo-application` to read installed version and build metadata from the native binary. The owner-tested `1.1.0` preview binaries for iPhone and Android include this native module. The Milestone 02 test update delivered a JavaScript-only Settings caption to both installed previews. [Expo SDK 58 Application API](https://docs.expo.dev/versions/v58.0.0/sdk/application/)

Every OTA publication requires explicit owner approval. The [release and rollback playbook](docs/release-playbook.md) covers target verification, manual publication, and recovery.

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
