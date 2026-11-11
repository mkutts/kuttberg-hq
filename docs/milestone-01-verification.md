# Milestone 01 verification

PASS indicates a completed check with a successful result. FAIL indicates a completed check with an unsuccessful result. PENDING marks outstanding verification or approval. BLOCKED identifies a missing prerequisite. NOT RUN records a check that was skipped in the stated task.

| Task | Android physical device | iPhone | Status |
| --- | --- | --- | --- |
| 01 — Repository and app foundation | PASS | PASS | Verified |
| 02 — Design system | PASS | PENDING | Provisionally approved |
| 03 — Five-tab navigation | PASS | PENDING | Provisionally approved |
| 04 — Today dashboard | PASS | PENDING | Provisionally approved |
| 05 — Settings and secondary screens | PASS | PENDING | Provisionally approved |
| 06 — Loading, empty, and error states | PASS for app regression. PENDING for direct state component checks. | PENDING | Provisionally approved |
| 07 — Quality checks and documentation | PASS per user approval after Android device checks | PENDING | Provisionally approved |
| 08 — Cross-platform build verification | PENDING | BLOCKED by EAS project and Apple signing prerequisites | PENDING user review |

## Task 07 automated checks

| Check | Result |
| --- | --- |
| ESLint and strict TypeScript | PASS |
| Jest default, Android, and iOS presets | PASS, 30 tests in 6 suites per preset |
| Expo dependency compatibility | PASS, online |
| Expo Doctor | PASS, 20 of 20 checks online |
| Android and iOS exports | PASS, one Hermes bundle per platform |

The first dependency check fell back to Expo’s local version map. The first Expo Doctor attempt could not resolve the npm registry. The first export attempt failed in the Hermes compiler under restricted Windows permissions. All three passed with standard host access. A first run of the new Today regression reused a previously registered Jest callback. Clearing the native mock’s call history before the test resolved it.

Expo’s resolved configuration disables the generated sitemap route. The design-system fixture remains outside the app routes and its demo content is absent from both export bundles.

## Task 07 runtime checks

- **Android emulator** — PASS for startup on Today, the local date and greeting, all five tabs and selected states, and both Settings return paths in SDK 58 Expo Go on the Medium Tablet emulator. The same emulator passed at a 720 × 1600 portrait viewport with 200% system text in dark mode. The app kept its light colors, the tab labels were readable, and Today and Settings scrolled to their last sections. No JavaScript or fatal runtime errors appeared during the run. The Pixel emulator could not install Expo Go because it was low on storage.
- **Android physical device** — NOT RUN during Task 07 workstation verification. The task table reflects the successful device checks reported later by the user.
- **iOS Simulator** — NOT RUN. The Windows workstation has no iOS Simulator.
- **iPhone** — NOT RUN. Physical checks for Tasks 02–07 remain PENDING.

## Accessibility

Headings, named tab controls, selection state, Settings and Back roles, busy progress, and Retry behavior are covered by source review and automated checks. The loading label remains visible and the progress control supplies its accessible name. Today’s gear button supplies the accessible name for its decorative icon.

| Representative color pair | Contrast |
| --- | --- |
| Body text on cream | 13.26:1 |
| Supporting text on sage tint | 6.08:1 |
| Active tab label on card | 7.47:1 |
| Inactive tab label on card | 6.91:1 |
| Active tab icon on sage tint | 6.58:1 |
| Primary button label on green | 7.65:1 |
| Disabled button label on its surface | 5.11:1 |

The active tab also uses an outline and heavier text. Device results for screen readers and the Task 06 fixture are tracked below.

## Task 08 automated checks

The Windows checkout was clean and matched the fetched milestone branch at Task 07 commit `e19db7ef4a6fd7499a671135b3c889139d854b81`. The app continues to use Expo SDK 58 and React Native 0.88.1.

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS, strict TypeScript |
| `npm.cmd test` | PASS, 30 tests in 6 suites |
| `npm.cmd test -- --preset jest-expo/android` | PASS, 30 tests in 6 suites |
| `npm.cmd test -- --preset jest-expo/ios` | PASS, 30 tests in 6 suites |
| `npm.cmd exec -- expo install --check` | PASS, dependencies up to date |
| `npm.cmd exec -- expo export --platform all` | PASS, one Hermes bundle for Android and one for iOS. The Task 06 fixture markers were absent from both. |
| `npm.cmd exec --yes -- expo-doctor` | PASS, 20 of 20 checks |
| `npm.cmd exec -- expo config --type introspect --json` | PASS, Expo resolves the dev-client plugin and both temporary identifiers |
| EAS CLI 27.5.0 local schema resolution | PASS, the CLI's `@expo/eas-json` library resolved both development profiles |
| `eas config --platform android --profile development --non-interactive` and the equivalent iOS command | BLOCKED, EAS requires a linked project to resolve project-backed configuration |

The Jest runs cover Today greeting and date updates, all five tabs, Settings and its return paths, and loading, empty, and error state behavior including the optional actions.

The default Jest suite timed out on one Today test during concurrent native compilation and export. The standalone rerun passed all 30 tests. Metro recovered from a cache read error by rebuilding its file map and exported both bundles.

The npm audit reported one low and 30 moderate advisories elsewhere in the dependency tree. It listed no advisories against the seven packages added for the development client.

## Task 08 native development builds

- **Android emulator** — PASS for the local x86_64 build, installation, startup, and Metro connection on the Medium Tablet emulator running Android 15. The first `expo run:android --no-bundler` attempt timed out at device discovery on ADB port 5037. A separate ADB server restored access, first on port 5039 and then on port 5041 for the final build. The first direct Gradle build failed at `:app:buildCMakeDebug[arm64-v8a]` because Ninja hit its 260-character Windows path limit. The local retry used `gradlew.bat :app:assembleDebug -Pexpo.android.cmakeObjectPathMax=240 -PreactNativeArchitectures=x86_64`. Kuttberg HQ opened its own development launcher and connected to Metro over ADB reverse port forwarding.
- **Android physical device** — PENDING. No physical device appeared in the available ADB device list.
- **iOS Simulator** — NOT RUN. This workstation runs Windows.
- **iPhone** — BLOCKED. Expo and EAS confirmed an active login, but the app has no linked EAS project and the intended account/project is unconfirmed. Apple Developer Program membership, signing access, and device registration are unconfirmed. No cloud build was submitted and no iPhone development app was installed. Confirm the Expo account/project, proposed bundle identifier `com.mkutts.kuttberghq` or another available identifier, and Apple team access before linking the project and registering the iPhone. Follow the [EAS cloud build steps](../README.md#eas-cloud-builds).

The existing `com.example.kuttberghq` identifier is usable for Android debug signing. The iOS export verifies JavaScript bundling. Native signing, installation, and runtime behavior require a separate build and device check.

The floating Expo Tools button initially intercepted a tap on the Settings gear at the 720 × 1600 portrait viewport. Disabling the button in the development-client plugin resolved the overlap, and both Settings return paths passed in the rebuilt APK. Changing font scale and dark mode while the app was running, then opening its root link, produced an Expo Router duplicate-linking diagnostic. Scrolling still worked. The diagnostic was absent after a cold start with those display settings already applied. No fatal crashes occurred during the emulator checks.

## Manual device checklist

Use the same session on each available development build. iPhone checks cover the outstanding Tasks 02–07 regressions and Task 08 acceptance. Earlier Expo Go results are recorded above.

| Check | Android emulator | Android physical device | iPhone |
| --- | --- | --- | --- |
| Install and open Kuttberg HQ, connect to Metro, open Today by default, and watch for runtime exceptions or crashes throughout the session | PASS for startup and Metro. See the display-change diagnostic above. | PENDING | BLOCKED pending signed build |
| Check cream-and-sage colors, typography, cards, spacing, button activation and reset, and disabled control behavior using the fixture | PASS | PENDING | PENDING |
| Open Today, Routines, Wellness, Responsibilities, and Inbox. Check selected states, the Responsibilities label and bottom safe area, and system Back to Today on Android. | PASS | PENDING | PENDING |
| Check local greeting and date, all dashboard sections, scrolling, and refresh on resume | PASS for current greeting and date, all sections, scrolling, and resuming. A clock change across a resume is covered by Jest. | PENDING | PENDING |
| Open Settings from the Today gear, check app information and unavailable preference labels, and return to Today. Repeat with system Back on Android. | PASS | PENDING | PENDING |
| Open the fixture and check loading spinner and message, both empty states, the optional action and its feedback, both error messages, and Retry feedback. Check that the error without a callback has no Retry button. | PASS | PENDING | PENDING |
| Enable larger system text and dark mode. Check that light colors stay readable, Today and Settings scroll, tab labels and safe areas work, and the fixture spinner, empty action, and Retry remain aligned and usable without clipping or overlap. | PASS at 200% system text in a 720 × 1600 portrait viewport | PENDING | PENDING |
| With TalkBack or VoiceOver, swipe through the app and fixture. Listen for tab names and selected states, Settings and Back labels, headings, loading status, the error message and Retry. Check logical focus order and activate Retry. | PENDING | PENDING | PENDING |

The fixture ran in the Android development app through a temporary local route. The route was removed after testing. The emulator UI hierarchy exposed tab labels and selection, the Settings and return controls, and the busy loading status. Spoken announcements and screen-reader focus order remain pending.

For direct state checks, use the [temporary development fixture route](../README.md#exercise-the-task-06-fixture-on-a-device). Enable TalkBack in Android **Settings → Accessibility → TalkBack**, or VoiceOver in iPhone **Settings → Accessibility → VoiceOver**. Increase the system text size before repeating the scrolling and layout checks. Milestone 01 acceptance remains pending.

## Standalone preview configuration

| Check | Result |
| --- | --- |
| Lint, strict TypeScript, and public Expo config | Pass |
| Jest default, Android, and iOS presets | Pass, 30 tests per preset |
| iOS EAS preview config | Pass. EAS resolved internal distribution, `developmentClient: false`, and `simulator: false`. The profile has no parent. |
| Expo dependency validation and Expo Doctor | The online checks flagged seven existing SDK 58 patch-version mismatches in `expo`, `expo-constants`, `expo-dev-client`, `expo-font`, `expo-linking`, `expo-router`, and `expo-status-bar`. Expo Doctor passed 19 of 20 checks. |
| Android and iOS bundle exports | Pass on retry with Hermes bytecode and assets for both platforms. The initial restricted-runner export failed during Hermes compilation. |

- **Android emulator** — Preview installation and launch were skipped.
- **Android physical device** — Preview installation and launch were skipped.
- **iOS Simulator** — The preview profile targets physical devices.
- **iPhone** — Signing, installation, and launch without Metro remain unverified. No cloud build was submitted.
