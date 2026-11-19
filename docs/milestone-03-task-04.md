# Milestone 03 / Task 04 — Secure password recovery

Date: November 19, 2026.

**Status: implemented locally for review; NOT accepted. Hosted setup, real emailed links, and standalone iPhone/Android verification remain pending. Task 03 live authentication/RLS testing remains separately pending.**

## Scope and repository

- Repository: `C:\Users\mattk\Kutberg HQ`.
- Branch: `milestone-03-accounts-secure-data`.
- Starting/current commit: `35351c8d7a590997404a90fe2a943c5f0bd25d2a`.
- Origin: `https://github.com/mkutts/kuttberg-hq.git`; recorded upstream: `origin/milestone-03-accounts-secure-data`. No fetch performed.
- Initial worktree was clean. All Task 04 changes are unstaged. No Git-writing commands were used.
- Task 04's explicit branch instruction supersedes AGENTS.md's older Milestone 02 branch requirement.
- No real accounts were created or reset. No hosted settings, database/schema/RLS, `.env.local`, dependencies, native configuration, release versions, channels, builds, or publications were changed.

## Complete implemented flow

1. **Forgot password?** on sign-in opens a Frances-branded email form. Local email validation runs before `resetPasswordForEmail(email, { redirectTo: 'kuttberg-hq://reset-password' })` on the existing singleton client.
2. Success and recognized account-specific errors use the same neutral confirmation. SDK messages never appear. Network errors and rate limits have fixed user-facing text. An in-memory 60-second request cooldown and controller busy state prevent rapid/duplicate requests; hosted rate limits remain authoritative.
3. Expo Router's `app/+native-intent.tsx` receives both cold-start and foreground native links. It accepts credentials only at the exact `kuttberg-hq://reset-password` destination, with exactly one `type=recovery` and one bounded `token_hash`. Credentials are passed directly to the controller; Router receives only `/reset-password`. Other native URLs have query strings and fragments removed before navigation.
4. Recovery immediately hides tabs, Settings, sign-in, and request routes. Existing in-flight sign-in/sign-out work settles before verification. Automatic refresh is stopped for recovery.
5. Before the SDK can save any recovery session, a non-secret SecureStore interruption marker is written. The existing local SDK session is signed out. The controller calls `verifyOtp({ token_hash, type: 'recovery' })`. Only a successful server response containing a consistent user and unexpired session authorizes the password form. Neither `SIGNED_IN`, `PASSWORD_RECOVERY`, nor a URL type label grants authorization by itself. A newer sign-in/sign-out while verification is pending invalidates its result.
6. Authorization is in memory only and expires at the earlier of the session's expiry or ten minutes. The controller exposes no recovery session through its normal `session` state. A normal signed-in session cannot invoke the recovery password update. Unexpected session changes invalidate authorization.
7. New/confirm password fields support Show/Hide, autofill hints, keyboard navigation, accessible labels, live error announcements, disabled busy controls, and local mismatch/length validation. App policy is 12–128 characters with at least one non-whitespace character; passwords are not trimmed. Supabase's hosted password policy still applies.
8. Before `updateUser({ password })`, `getUser()` revalidates the current SDK user against the verified recovery user and checks the deadline again. Duplicate requests and cancel/update races are blocked. Input fields clear immediately on submission, when authorization is lost, and when backgrounded. Passwords are never written to application storage or logs.
9. A confirmed update removes authorization and performs local SDK sign-out. Only successful cleanup clears the interruption marker and returns to normal sign-in with a success message. Cleanup failure keeps the recovery guard active and offers cleanup retry; retry cannot repeat the password update. Cancellation also requires cleanup.
10. On process restart/provider remount, any prior SDK mutation settles before hydration. A saved interruption marker forces session cleanup before normal session restoration. Interrupted recovery cannot resume password-changing authority or become ordinary authenticated navigation. A fresh link is required after an interrupted verified reset.

## SDK investigation and hosted compatibility blocker

Inspected installed Expo `58.0.25`, Expo Router `58.0.31`, Supabase JS `2.119.0`, its auth-js source, the existing singleton client, and chunked SecureStore adapter. The client retains `detectSessionInUrl: false`, `skipAutoInitialize: true`, native encrypted persistence, and its existing implicit-flow default. No second client or service/secret key was introduced.

The installed `verifyOtp` sends `token_hash` and the fixed recovery type to the Auth server, saves a returned session, and emits `PASSWORD_RECOVERY`. The controller waits for the actual operation result rather than trusting that event. The installed Router invokes `redirectSystemPath` for initial and foreground URLs.

**The current hosted email template and redirect allowlist have not been inspected or changed. The standard implicit ConfirmationURL flow produces access/refresh tokens and a caller-controlled recovery label; this implementation deliberately rejects that format. PKCE codes are also rejected because this client does not start a PKCE recovery flow.** App-generated recovery links require the explicit token-hash template below. It would be incorrect to claim that the current hosted email flow already works.

This is a complete implementation of the documented token-hash contract, but end-to-end availability is blocked until the owner approves/configures that contract and tests actual email delivery. Existing legacy links must be replaced by newly requested emails after configuration. A browser consuming the normal ConfirmationURL first would use up the one-time token and must not be part of this template.

## Authentication controller changes and regression findings

The existing controller/subscription/provider architecture is retained. Added a `recovering` status, explicit recovery phases, recovery operations, scoped crash barrier, native-link intake, and guards around restoration and auth events. Normal Settings sign-out still uses global scope, preserves errors, and blocks stale session events. Its existing regression cases remain intact.

Regression tests exposed and corrected three implementation edge cases:

- Provider remount during an old password sign-in could allow that SDK write to finish after recovery verification. Track and await prior normal session mutations before hydration/recovery.
- Keeping the reset route available while signed out left it visible after success. It is now available only while recovering, so successful cleanup removes it from navigation history.
- A newer sign-in/sign-out event between verification and response settlement could authorize stale recovery state. Such events invalidate that verification result.

## Owner-only Supabase configuration instructions — not performed

These are future configuration steps, not authorization to change settings now.

1. Open **Kuttberg HQ Development**, project reference `gwjpuerlsjoxgzuyniwy`, in the Supabase Dashboard. Confirm the project before editing. Leave production untouched.
2. Under **Authentication → URL Configuration → Redirect URLs**, add exactly:

   ```text
   kuttberg-hq://reset-password
   ```

   This one entry serves iPhone and Android. Do not add a wildcard, Expo Go URL, localhost callback, token-bearing URL, or extra trailing slash. Preserve unrelated approved entries and the existing Site URL. The app supplies this exact `redirectTo`.
3. Under **Authentication → Email Templates** (or **Emails → Templates**, depending on Dashboard layout), open **Reset Password**. Save the previous template for rollback. Use a fixed native destination and Supabase's `TokenHash` variable:

   ```html
   <h2>Reset your Kuttberg HQ password</h2>
   <p>Open this link on the iPhone or Android phone where Kuttberg HQ is installed.</p>
   <p><a href="kuttberg-hq://reset-password?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>
   <p>If you did not request this, you can ignore this email.</p>
   ```

   The rendered URL must have the exact scheme/host above and the two query parameters. `&amp;` is HTML escaping and becomes `&` in the link. Do not use `ConfirmationURL`, `Token`, a `/auth/v1/verify` hop, arbitrary `RedirectTo`, session fragments, or a code-exchange callback in this template. Keep token URLs out of screenshots and support messages.
4. Inspect **Authentication → Providers → Email** / email settings for OTP expiry and the existing password policy; record their values in the owner's private test record. Do not weaken them. The UI enforces 12–128 characters; stricter server restrictions can still reject a password. Confirm existing CAPTCHA/secure password-change/MFA requirements do not require an additional flow; if they do, treat that as a blocker for follow-up instead of disabling protection.
5. Inspect Auth email delivery/SMTP and rate limits. Confirm delivery is permitted to the intended already-enrolled recipients. Supabase's default email service can restrict recipients and volume; if that prevents delivery, approved SMTP setup is a separate prerequisite. Do not create test accounts or loosen signup settings for this task.
6. Disable recovery-link click tracking/rewriting in the email provider if it alters the native URL. Test the actual mail apps used by each owner: some clients/security filters may strip or refuse custom-scheme anchors. If the link is not tappable/openable reliably, stop acceptance and plan an approved HTTPS app-link/universal-link or handoff page. This task does not deploy a web endpoint or claim cross-mail-client compatibility.
7. Request a fresh recovery email from the app only during separately approved live testing. Verify the native destination without copying or retaining the complete token URL. Test each platform independently.

References: [Supabase email-template variables](https://supabase.com/docs/guides/auth/auth-email-templates), [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [Supabase mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Expo Router native intent](https://docs.expo.dev/router/advanced/native-intent/).

## Native configuration and binary requirements

`app.json` already declares `scheme: kuttberg-hq`, iOS bundle ID and Android package `com.mkutts.kuttberghq`. Task 04 needs no new scheme, associated domain, intent filter, native dependency, or native config edit. Runtime/version `1.1.0` and preview/production channels are unchanged here.

**The old Milestone 02 binaries are not suitable for Milestone 03:** the Task 03 report records the SecureStore native-build prerequisite. An approved standalone build containing the current Milestone 03 native dependencies and JS is required for the immediate use case unless the owner can establish that a compatible Milestone 03 binary already exists. The release owner must resolve the native runtime/version bump before those builds or any update publication; do not deliver the new native dependency into the old `1.1.0` binary via OTA. Task 04 itself adds only JavaScript/TypeScript on top of Milestone 03 and introduces no further native compatibility change. No build or update was made.

## Automated verification

All auth responses, users, credentials, native storage behavior, and links in tests are synthetic or mocked. These tests do not contact hosted Supabase.

| Check | Result |
| --- | --- |
| Strict TypeScript | PASS: final post-review `npm run typecheck` |
| ESLint | PASS: final post-review `npm run lint` |
| Default Jest | PASS: 198 tests / 15 suites |
| iOS Jest | PASS: 198 tests / 15 suites, explicit `jest-expo/ios` preset |
| Android Jest | PASS: 198 tests / 15 suites, explicit `jest-expo/android` preset |
| Expo public configuration | PASS; app-specific scheme and identifiers preserved |
| Expo dependency check | Installed versions up to date using offline dependency map; online compatibility not verified |
| Expo Doctor | BLOCKED: npm registry DNS failure, `ENOTFOUND registry.npmjs.org`; no Doctor pass claimed |
| iOS JavaScript export | PASS: Hermes bundle generated |
| Android JavaScript export | PASS: Hermes bundle generated |
| Whitespace / staged-file review | PASS: `git diff --check`; empty index; branch and HEAD unchanged |

There are **82 added tests**: 67 recovery controller/parser/validation cases, nine native-intent cases, and six real-Router UI/navigation cases. Coverage includes all requested acceptance areas: known/unknown request outcomes, rate limits, bad URLs, missing/expired/reused/rejected tokens, cold/foreground delivery, session isolation, password validation/update errors/success, duplicates, navigation guards, interruption cleanup, and authentication event ordering. Existing Task 03 tests are unchanged and included in all full-suite runs.

Earlier focused recovery Router runs emitted development-only `REMOVE_ROUTES` / `ROUTE_NAMES_CHANGED` warnings during some cold-start guarded navigation. The final full default/iOS/Android runs contain no such warnings, no failures, and no skipped tests; no warning suppression was added. Protected-route and back-navigation assertions pass. On-device routing remains a required acceptance check. Export emits the environment's `NO_COLOR`/`FORCE_COLOR` warning, which does not prevent either bundle from being generated.

Final source review found no auth logging, AsyncStorage, second Supabase client, or secret/service-role key in the new recovery implementation. Git's changed-file inventory is exactly the 15 files below; dependency, app/native/release configuration, Supabase client/storage adapter, and database files are unchanged. `.env.local` was not edited. Full-suite commands were `node node_modules/jest/bin/jest.js --runInBand`, plus separate runs with `--preset=jest-expo/ios` and `--preset=jest-expo/android`. Exports used `npx expo export --platform all --output-dir .cache/task-04-export`.

## Standalone device test checklist — run separately on BOTH platforms

Prerequisites: approved compatible standalone binaries, correct development publishable configuration, approved hosted template/allowlist/delivery setup, an existing enrolled account whose owner authorizes password changes, and a private results record. Do not put real emails, passwords, token URLs, or SDK responses in Git/screenshots/logs. Record device model, OS, build/runtime, mail app, and each result separately for iPhone and Android.

1. Disconnect Metro; launch from the home-screen icon. Check the Frances branding, sign-in → Forgot password navigation, keyboard avoidance, small-screen/large-text layout, and ability to return to sign-in. Verify VoiceOver (iPhone) / TalkBack (Android) labels, order, busy states, Show/Hide labels, and error announcements.
2. Submit an invalid email: local validation, no request. Request recovery for the authorized enrolled account. Observe neutral confirmation, no account disclosure, no duplicate taps. Under approved testing, use a known nonexistent address only to compare confirmation wording. Check the 60-second cooldown; avoid deliberately exhausting hosted email quotas.
3. **Cold start:** after email delivery, close the app completely. On iPhone, swipe it away in the app switcher; on Android, remove it from recents (separately test Settings → Force stop if supported by the mail app's launch behavior). Tap the email's Reset password link on that same phone. Expect verification then the password form, with no household/Settings screen flashing. Confirm no credential-bearing URL appears on-screen.
4. Cancel via Back to sign-in and confirm cleanup completes. Request a fresh email after the cooldown. **Foreground/background:** keep the app running or backgrounded and tap the new email link. Expect the same guarded recovery form. Repeat while already normally signed in; household screens must become inaccessible until recovery ends.
5. While recovering, try ordinary links such as `kuttberg-hq://settings` and `kuttberg-hq://wellness`, Android Back, and available iPhone back gestures. None may expose protected content or normal sign-in while recovery remains active. Test a tokenless `kuttberg-hq://reset-password`; it must not enable password entry. Wrong schemes/hosts and unrelated callbacks must not authorize recovery.
6. Enter short, all-space, over-128-character, and mismatched passwords. Verify local rejection before update. Test Show/Hide, autofill, Next/Go, and announcements. Background the app; fields should clear. Leave authorization open past ten minutes; submission must be disabled by invalidation and a fresh recovery flow required.
7. Using a fresh authorized link, enter a valid unique password and submit once; rapid extra taps must not duplicate it. Verify cleared fields, successful cleanup, explicit success on normal sign-in, and no back-navigation into the password form. Sign in with the new password during this approved test; verify the old password fails with neutral sign-in wording.
8. Reopen the consumed email after success/cancellation and test a deliberately expired email after the recorded server OTP expiry. Neither may authorize another update. Do not paste tokens into command lines, tickets, or logs. Test a harmless fabricated hash separately for malformed/rejected-link handling.
9. Exercise offline failure while requesting/verifying/updating. No raw SDK response or false success should appear. An update response lost to a network failure is ambiguous: follow the displayed retry/new-link path rather than assuming the password stayed unchanged. Reconnect before retrying cleanup. Never declare global revocation based on local cleanup.
10. Force-close during an authorized recovery session, then reopen normally. The interruption marker must force cleanup before any saved session restoration; no password form or household access should resume from that recovery session. Repeat with airplane mode: cleanup may remain blocked until reconnection. Reconnect and retry. Test again after a completed reset: it should remain signed out until an explicit sign-in.
11. Verify normal sign-in and global Settings sign-out still behave correctly, including an offline sign-out failure and eventual retry. Task 03 hosted auth/RLS tests remain a separate test procedure and acceptance decision.

## Security limits and remaining blockers

- Hosted template, allowlist, email delivery, OTP expiry/password policy, and actual recovery token response are unverified. The current default implicit callback is intentionally unsupported; the documented template is mandatory.
- Custom schemes are not OS-verified domains. A malicious installed app can claim the same scheme. The server-verified one-time hash prevents invented recovery authorization, but it is still a bearer credential if intercepted. Verified HTTPS app/universal links would reduce that interception risk and require separately approved domain/native/hosted work.
- An email client may suppress custom-scheme links; actual delivery and tapping on both intended phones are acceptance blockers until tested.
- Recovery authorization is an app navigation/control boundary, not a new server permission model. A Supabase recovery session is still an authenticated SDK session. Existing backend RLS remains the data boundary; no RLS change was made.
- Cleanup uses local scope to remove this recovery session. Existing global Settings sign-out remains unchanged. No claim is made that every other device's session or already-issued access token is immediately revoked by reset/cleanup.
- If native storage or server cleanup fails, recovery stays blocked and retry is required. SDK-required session persistence remains encrypted by the existing adapter. Only the non-secret `1` interruption marker is added to application persistence.
- No real account reset, mail delivery, physical-device rendering/accessibility, OS link routing, or native persistence/removal has been live verified. JavaScript exports and mocked tests do not establish those results.

## Created and modified files

| Change | File | Purpose |
| --- | --- | --- |
| Modified | `app/sign-in.tsx` | Forgot password action |
| Modified | `app/_layout.tsx` | Recovery-only navigation guard and new routes |
| Modified | `src/auth/authController.ts` | Recovery lifecycle, authorization, cleanup, race protections |
| Modified | `src/auth/AuthProvider.tsx` | Expose controller recovery operations |
| Modified | `test-support/authClient.ts` | Synthetic recovery SDK responses |
| Created | `app/+native-intent.tsx` | Cold/foreground native callback validation and sanitization |
| Created | `app/forgot-password.tsx` | Branded neutral recovery-request screen |
| Created | `app/reset-password.tsx` | Authorized password form and cleanup states |
| Created | `src/auth/RecoveryForm.tsx` | Shared recovery branding, styling, accessible announcements |
| Created | `src/auth/recovery.ts` | Strict link parser, fixed messages, email/password validation |
| Created | `src/auth/recoveryLock.ts` | Non-secret SecureStore interruption marker |
| Created | `__tests__/password-recovery.test.ts` | Controller, parsing, validation, interruption/race coverage |
| Created | `__tests__/recovery-native-intent.test.ts` | Native URL sanitization/initial/foreground coverage |
| Created | `__tests__/recovery-navigation.test.tsx` | Real-Router screens, guards, forms, cleanup coverage |
| Created | `docs/milestone-03-task-04.md` | This report and owner checklists |

Temporary verification output is under ignored `.cache/task-04-*`. Task 04 is not accepted; no release action is authorized by this report.
