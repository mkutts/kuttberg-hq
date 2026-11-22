# Milestone 03 / Task 03 — Authentication screens and secure sessions

Status: implemented for owner review; not accepted. Physical-device and hosted authentication verification are pending.

## Scope and baseline

- Repository: `C:\Users\mattk\Kutberg HQ`.
- Branch: `milestone-03-accounts-secure-data`.
- Baseline: `2027bd2418775f89f2ea9cc145238f2cab27be6b`.
- Origin: `https://github.com/mkutts/kuttberg-hq.git`.
- Initial working tree was clean; locally recorded upstream was equal to HEAD. Current hosted Git state was not independently checked.
- The explicit Task 03 branch instruction supersedes the older Milestone 02 branch prerequisite in `AGENTS.md`.
- All work remains unstaged. No Git-writing commands, hosted changes, provisioning, database edits, EAS publications, release builds, dependency changes, or `.env.local` edits.

## Implementation

- `src/auth/authController.ts`: authoritative in-memory session state around the existing singleton client. Explicit initialization, session restoration, auth-event updates, event/read ordering, sign-in, sign-out, recoverable errors, expiry checks, and foreground refresh lifecycle.
- `src/auth/AuthProvider.tsx`: root React context subscribes to that controller; consumers never construct another client or persist credentials.
- `app/sign-in.tsx`: approved Frances artwork, existing cream/sage tokens, accessible email/password inputs, Show/Hide, autofill hints, keyboard submission, scrolling, busy state, validation, redacted errors, and password-field clearing after an attempt.
- `app/_layout.tsx`: loading/error screens and protected routes. Both the tab group and Settings require a session. Sign-in is only available when signed out.
- `app/settings.tsx`: visible sign-out action, loading/error handling, and updated privacy copy.
- Created `__tests__/auth-controller.test.ts` and `__tests__/auth-navigation.test.tsx` for controller and real-router integration tests, with synthetic fixtures in `test-support/authClient.ts` and `test-support/signedInAuth.tsx`.
- Updated `__tests__/navigation.test.tsx`, `__tests__/settings.test.tsx`, and `__tests__/today.test.tsx`. These existing page tests isolate authentication so their original navigation and content assertions remain meaningful.
- Updated `README.md` and created `docs/milestone-03-task-03.md` to describe behavior and outstanding checks. There are 14 created/changed files in total.

### Decisions and limits

The existing Supabase client and chunked SecureStore adapter are unchanged. No new persistence library or dependencies are introduced. Passwords exist only in the input/request lifetime, and are never written to application persistence. Session values are held in memory by the SDK/controller and encrypted by the existing adapter. Application code does not log auth objects or display raw SDK errors.

Initialization is distinct from signed-out state. `getSession()` is authoritative for hydration; the SDK can emit `INITIAL_SESSION(null)` after a failed read, so that event cannot prove logout. Event revisions prevent stale reads from overwriting newer sign-in, sign-out, or refresh events. Subscription cleanup and generation checks prevent an old mount from updating a new lifecycle. Auth callbacks perform no asynchronous auth operations.

One controller manages one SDK auth subscription and one refresh AppState listener while subscribed. Async refresh starts/stops are serialized. Expired sessions cannot continue to expose protected content; retryable restoration failures preserve the possibility of a saved session. Retry occurs on demand, foreground entry, or every 30 seconds while active after a restoration failure. There is no network-connectivity dependency.

Sign-out explicitly uses global scope, as disclosed in Settings. The installed SDK's local scope can emit signed-out before returning a network/revocation error; global scope allows the app to show a failure without falsely claiming complete sign-out. Other devices can retain usable access tokens until they expire. On SDK/storage failure, the UI reports failure; it does not promise the server or every encrypted chunk was cleared. Existing storage tests cover cleanup failure behavior with mocks.

This does not continuously validate an unexpired token with the hosted server. A restored session is a local UX decision, not proof that an account is still authorized. Revocation is discovered through SDK refresh/sign-out events; adversarial API/JWT and profile/workspace authorization checks belong to later tasks. RLS remains the backend boundary.

No public signup route or action, registration, invitations, password reset, OAuth, magic links, provisioning, schema/RLS changes, household features, or update publications were added. Hosted signup settings have not been read or changed. Keep public signup and anonymous sign-ins disabled.

## Initial implementation verification (before final-review follow-up)

| Check | Final result |
| --- | --- |
| `npm run typecheck` | Passed; strict TypeScript remains enabled |
| `npm run lint` | Passed |
| `npm test` | Passed: 99 tests in 12 suites |
| `npm test -- --preset jest-expo/ios` | Passed: 99 tests in 12 suites |
| `npm test -- --preset jest-expo/android` | Passed: 99 tests in 12 suites |
| `npx expo config --type public --json` | Passed; local output only |
| `npx expo install --check` | Passed with normal host/network access; dependencies are up to date |
| `npx expo-doctor` | Passed: 20/20 checks |
| `npx expo export --platform all --output-dir .cache/task-03-export` | Passed for iOS and Android, including Hermes bundles |
| `git diff --check` | Passed |
| Source/route review | No signup route/action, excluded auth flows, auth logging, analytics, plaintext AsyncStorage, or second Supabase client added |
| Credential-pattern scan and diff review | No real tokens, passwords, database credentials, private keys, or service-role/secret keys added; tests contain explicitly synthetic nonfunctional values |
| Protected files and Git state | No dependency, native config, Supabase client/storage, database, or staged changes; `.env.local` was not edited |

The 31 new tests cover initialization, saved-session restoration, loading isolation, delayed reads versus newer events, null initial-event ambiguity, configuration recovery, successful/failed sign-in, password visibility and clearing, busy-state controls, sign-out success/failure, expiration while offline, retry/reconnect simulation, confirmed SDK revocation events, AppState refresh ownership/cleanup, remount isolation, and protected-route/deep-link behavior. Final runs reported no console warnings/errors. Restored authenticated cold-start links are retained; a link attempted while signed out redirects to sign-in, and successful sign-in then opens Today.

Initial restricted runs hit router-test timeouts and could not download Expo Doctor; the dependency check initially used the offline SDK map. Normal host-access reruns resolved those environment limitations. Implementation-time TypeScript/test failures were corrected, including React Native's input-ref type, test fixture setup, exact-text assertions, and remount/deep-link expectations. The final results above supersede those exploratory runs.

All authentication tests use synthetic sessions and mocked SDK responses; none authenticate a real account. Existing SecureStore tests mock native storage. Local checks here consist of source review, configuration resolution, dependency validation, Jest, and exports. No emulator, Expo Go, Metro-connected device, standalone phone, or hosted-auth smoke test was performed. JavaScript export is not device testing. No database tests were rerun because no schema/RLS/database files changed.

Implementation references: [Expo Router protected routes](https://docs.expo.dev/router/advanced/protected/), [Supabase React Native authentication lifecycle](https://supabase.com/docs/guides/auth/quickstarts/react-native), and the installed `@supabase/auth-js` source for initialization, refresh, and sign-out semantics.

## Physical-device checklist — run separately on standalone iOS and Android

Prerequisites: owner-approved standalone binaries containing SecureStore and this code, a runtime distinct from the old `1.1.0` binaries, correct publishable development configuration, and an existing manually enrolled test account. Builds and account creation are separate authorized work; none were performed here. Do not put credentials, account UUIDs, or tokens in screenshots, test records, logs, or Git. Record device model, OS, build/runtime, and pass/fail for each platform separately.

1. Disconnect Metro and launch the installed app from its home-screen icon. Verify the native splash, then the restoring state and sign-in screen for an installation without a saved session. No dashboard, Settings, or tab content should flash. If an iPhone has prior Keychain data, use successful sign-out to establish this state; uninstall/reinstall does not reliably erase Keychain sessions.
2. Inspect the Frances artwork, cream/sage styling, spacing, and readable text on a small display, in system dark mode, and with large text. Scroll with the keyboard open; both fields, Show/Hide, error text, and Sign in must stay reachable. Verify Next moves from email to password and Go submits. Test autofill and Show/Hide without losing characters.
3. With VoiceOver on iOS and TalkBack on Android, verify heading and field labels, focus order, Show/Hide labels, sign-in busy state, and error announcement. Verify that duplicate taps do not submit multiple requests.
4. Submit empty fields, malformed email, then an enrolled email with the wrong password. Verify recoverable generic errors, no account identifiers/server detail, no protected content, and password-field clearing after the failed request. Retry with the correct password; verify Today appears and sign-in is removed from navigation history.
5. Visit every existing tab and Settings. On Android, test system Back from a secondary tab and Settings. On iOS, test available back gestures. Verify that returning never exposes sign-in while authenticated.
6. Force-close the app (swipe it away in iOS's app switcher; use Android Settings → Apps → Kuttberg HQ → Force stop). Reopen with Metro disconnected. Verify the saved session restores without entering a password and protected content does not flash before hydration. Repeat after a phone restart and unlock. This is the standalone SecureStore persistence check.
7. While signed in and online, background the app, wait, and foreground it several times. Repeat across the configured access-token lifetime. Verify continued access after refresh, no repeated navigation/reload, and no unexpected logout. Record behavior without exposing tokens.
8. Enable airplane mode with a still-valid saved session and force-close/reopen. The existing shell may remain usable while the token is unexpired; this does not prove server access. Leave offline across expiry and foreground/reopen. Expect restoration/retry UI, no protected content, and no false “signed out” claim. Reconnect; use **Try again** or wait up to 30 seconds while foregrounded after a failed restoration. Verify recovery without re-entering credentials if the saved refresh session is still valid.
9. While signed in with an unexpired token, enable airplane mode and tap **Settings → Sign out**. Wait for the request to finish. Expect explicit failure, not a success claim. Reconnect and retry. Verify sign-in appears, protected routes become inaccessible, and the app remains signed out after force-close/reopen. If the token expires during this test, restoration may take over and must show a retry state instead of assuming logout.
10. Verify deep links while signed out: `kuttberg-hq://settings`, `kuttberg-hq://wellness`, `kuttberg-hq://routines`, `kuttberg-hq://responsibilities`, and `kuttberg-hq://inbox`. Open each from a local note/link on iOS; on Android use a tappable link or `adb shell am start -a android.intent.action.VIEW -d "kuttberg-hq://settings" com.mkutts.kuttberghq` (substitute the path). Expect sign-in, including after Android Back. While signed in, `kuttberg-hq://sign-in` must lead to the authenticated app.
11. If an already enrolled test account is available on two approved devices, sign into both, then successfully sign out on one. After the other device's access token expires and refresh runs, verify it loses protected access and prompts sign-in. Existing access tokens can remain usable until expiry; do not expect immediate remote logout. Administrative revocation and adversarial JWT checks remain Task 06 work.
12. Confirm no signup, invitation, password recovery, OAuth, or magic-link controls exist. Record iOS and Android results separately, including any failed accessibility, offline, or persistence checks. Never infer the second platform's result from the first.

## Not yet verified

No real sign-in, real password failure, hosted revocation, token refresh against Supabase, native encrypted persistence/removal, on-device rendering, keyboard/autofill, accessibility, or standalone force-close/reopen behavior has been verified by this task. Availability of real enrolled users has not been established. If no real users exist, live acceptance remains blocked until separately authorized enrollment and compatible builds are available. Task 03 acceptance is reserved for the owner.

## Final-review follow-up - November 16, 2026

Completed on the existing `milestone-03-accounts-secure-data` branch at the same HEAD. Task 03 remains unaccepted. The initial 14-file working tree was preserved; this follow-up edited four of those files and added no new repository files.

### Regression evidence and correction

The first controller run against unchanged production code reported **25 passing / 9 failing tests**. All seven new sign-in cases passed. Nine new sign-out cases exposed two problems: a queued session event could restore access after `SIGNED_OUT` or successful global sign-out, and a subsequent auth event could erase the failure message from an unsuccessful sign-out.

The only production correction is in `src/auth/authController.ts`. A lifecycle-local guard blocks session events and restoration reads after `SIGNED_OUT` or successful sign-out. Explicit password sign-in clears the guard; a new controller lifecycle still hydrates from the SDK normally. Auth events preserve the existing sign-out failure message, including repeated `SIGNED_OUT` notifications. A failure after local sign-out therefore remains an explicit failure on the sign-in screen; it is not treated as successful global revocation. Global scope, request error handling, generation/revision ordering, and synchronous event callbacks are retained. No authentication refactor or SDK/storage changes were made.

### Exact added tests

There are **17 new test cases**: 16 controller cases and one navigation case. The existing deferred helper and synthetic fixtures are unchanged.

| File | Test name / parameter expansion | Cases |
| --- | --- | ---: |
| `__tests__/auth-controller.test.ts` | `SIGNED_IN authenticates before the sign-in response and clears busy only when the request settles` | 1 |
| Same | `sign-in followed by newer %s` / `ignores a stale %s response and clears busy`: newer event `TOKEN_REFRESHED` or `SIGNED_OUT`, crossed with `success`, `returned error`, or `thrown error` | 6 |
| Same | `global sign-out rejects stale %s events during and after completion`: `SIGNED_IN` and `TOKEN_REFRESHED`; includes busy state, duplicate-request prevention, retry-read blocking, and successful deliberate sign-in afterward | 2 |
| Same | `global sign-out with %s during the request` / `preserves failure after settlement and later events (throws=%s)`: `SIGNED_IN`, `TOKEN_REFRESHED`, or `SIGNED_OUT`, crossed with returned or thrown failure | 6 |
| Same | `global sign-out success without an event still blocks late session events` | 1 |
| `__tests__/auth-navigation.test.tsx` | `sign-out failure after SIGNED_OUT stays visible on sign-in and stale events cannot reopen Settings` | 1 |

### Final verification

| Check | Follow-up result |
| --- | --- |
| Focused controller + real-router suites | PASS: 48 tests in 2 suites |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 116 tests in 12 suites |
| `node node_modules/jest/bin/jest.js --runInBand --preset=jest-expo/ios` | PASS: 116 tests in 12 suites |
| `node node_modules/jest/bin/jest.js --runInBand --preset=jest-expo/android` | PASS: 116 tests in 12 suites |
| Expo public configuration | PASS; output kept in ignored local cache |
| Offline Expo dependency check | Installed versions reported up to date; Expo warns offline validation is unreliable, so no current online compatibility claim |
| Expo Doctor | BLOCKED: npm registry DNS failure (`ENOTFOUND`); the earlier implementation's 20/20 result was not reverified |
| iOS / Android JavaScript exports | PASS for both; local ignored output only; emitted environment color-setting warnings |
| Diff / staged-file / scope review | PASS; empty index; no additional repository files |

The initial `npm test -- --preset ...` attempts lost the preset flag through the Windows npm wrapper and found no tests. Those empty runs are not counted as passes. Direct Jest invocations above used the actual iOS and Android presets and each ran all 116 tests. There were no failures, skips, or console warnings in the final Jest runs. No device or hosted-auth tests were performed.

File hashes captured before editing confirm that only the following four existing Task 03 files changed during this follow-up:

- `__tests__/auth-controller.test.ts`
- `__tests__/auth-navigation.test.tsx`
- `src/auth/authController.ts`
- `docs/milestone-03-task-03.md`

### Complete final working-tree inventory

| Git status | Path | Changed in this follow-up |
| --- | --- | --- |
| Modified, unstaged | `README.md` | No |
| Modified, unstaged | `__tests__/navigation.test.tsx` | No |
| Modified, unstaged | `__tests__/settings.test.tsx` | No |
| Modified, unstaged | `__tests__/today.test.tsx` | No |
| Modified, unstaged | `app/_layout.tsx` | No |
| Modified, unstaged | `app/settings.tsx` | No |
| Untracked | `__tests__/auth-controller.test.ts` | Yes |
| Untracked | `__tests__/auth-navigation.test.tsx` | Yes |
| Untracked | `app/sign-in.tsx` | No |
| Untracked | `docs/milestone-03-task-03.md` | Yes |
| Untracked | `src/auth/AuthProvider.tsx` | No |
| Untracked | `src/auth/authController.ts` | Yes |
| Untracked | `test-support/authClient.ts` | No |
| Untracked | `test-support/signedInAuth.tsx` | No |

No dependencies, credentials, schema/RLS files, native/release configuration, or unrelated project files were added or changed. New test values are explicitly synthetic; no real credentials are included. `.env.local` was not edited. No staging, commits, pushes, merges, provisioning, native builds, or publication occurred. Local configuration/export artifacts remain ignored and are not part of the review inventory.
