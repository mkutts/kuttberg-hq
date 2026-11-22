# Milestone 03 / Task 04 correction — Eight-digit recovery codes

**Status: implemented locally for owner review; NOT accepted. Task 03 live authentication/RLS verification remains pending.**

This report supersedes the former Task 04 token-hash/deep-link implementation and its configuration instructions. The final recovery-event follow-up below records 217 passing tests on each preset and confirms that no production event-handling correction is needed.

## Scope and verified prerequisites

- Repository: `C:\Users\mattk\Kutberg HQ`; branch: `milestone-03-accounts-secure-data`.
- Starting commit: `c4d72a1d5b4e9e2865e257315e96ed0d12c849da`. Initial worktree was clean; locally recorded upstream matched HEAD. No fetch or Git-writing command was used.
- The task's explicit Milestone 03 branch instruction supersedes the older Milestone 02 prerequisite in AGENTS.md.
- Owner verified Development Email settings: OTP enabled, **8 digits**, **3,600-second email OTP expiry**, server password minimum 6. These are owner-reported hosted observations, not an independent dashboard inspection by this implementation run.
- Kuttberg HQ retains **12–128 characters** with at least one non-whitespace character and matching confirmation. The password is not trimmed. A long unique passphrase is supported.
- The in-app recovery authorization deadline remains the earlier of **10 minutes after successful verification** or the returned session expiry. The 60-minute email-code lifetime does not extend this deadline.
- Gmail SMTP delivery already works according to the owner. No mail was sent during this work.

## SDK support confirmed before implementation

Installed `@supabase/supabase-js` 2.119.0 and its `@supabase/auth-js` source support the exact required sequence:

```ts
await supabase.auth.resetPasswordForEmail(email);
// The Reset Password email template renders {{ .Token }}.
await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
// Only after validating that operation's session and identity:
await supabase.auth.updateUser({ password });
```

`VerifyEmailOtpParams` accepts email/token, and `EmailOtpType` includes `recovery`. `GoTrueClient.verifyOtp` POSTs those parameters to `/verify`, saves the returned session and emits `PASSWORD_RECOVERY` for this type. `resetPasswordForEmail` POSTs to `/recover`; options are optional. The existing client uses the implicit-flow default with URL session detection disabled. It does not generate a PKCE verifier for this request.

Supabase supports `{{ .Token }}` as an alternative to a confirmation URL. Its generic documentation describes six digits in some places; **the actual owner-verified eight-digit project setting governs this implementation**. No `signInWithOtp`, `type: 'email'`, second client, service-role key, or administrator API was added.

References: [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Final user experience

1. From sign-in, **Forgot password?** opens the existing Frances-branded email form. **Send recovery code** validates the email, stops normal refresh, enters guarded recovery navigation and safely removes any current local session before requesting the code.
2. The code screen shows the same neutral confirmation for a successful request and recognized account-specific responses, including a nonexistent account. It retains the normalized email only in memory. Request/network/rate errors use fixed sanitized text.
3. Enter or paste **exactly eight ASCII numeric digits**. Leading zeros survive. Outer whitespace from copying is trimmed; letters, internal spaces, six/seven/nine digits and non-ASCII digits are rejected. Input is never silently truncated into a valid code. A numeric keyboard and native OTP autofill hints are supplied; paste/manual entry remain available regardless of OS email autofill support.
4. **Verify recovery code** calls Supabase with the bound email, code and fixed recovery type. Duplicate operations are blocked. Wrong/expired/used/replaced codes remain unauthorized and receive sanitized errors. Only Supabase decides whether a code is valid or superseded.
5. **Send replacement code** becomes available after a visible 60-second request cooldown. It calls `resetPasswordForEmail` again, preserves the email and clears the input. Hosted rate limits remain authoritative. To change the email, cancel safely and begin again. The in-memory cooldown survives cancellation/provider remount in the same controller; process restart does not preserve it, so server limits remain essential.
6. Only a verified recovery response opens **Choose a new password**. Existing confirmation, Show/Hide, accessibility announcements, keyboard navigation and 12–128-character validation remain.
7. After a confirmed password update, local session cleanup must finish before returning to sign-in with success. If cleanup fails, the guarded screen offers **Retry session cleanup**; it cannot repeat the password update. Cancellation also requires cleanup and returns signed out.
8. Code/password inputs clear on background and submission. Recovery email is cleared on completion/cancellation or lifecycle teardown. If verification throws after an uncertain SDK write, authorization is invalidated and cleanup/new recovery is required. Network errors returned normally can be retried on the code screen. An uncertain password-update response never claims success.

## Authorization, isolation and interruption protection

The existing client, controller, provider, SecureStore session adapter and non-secret interruption marker are retained. There are no new dependencies or persistence mechanisms.

- Request entry sets `status: 'recovering'` synchronously, increments the auth-event revision and hides the normal session. Existing root route guards expose only the recovery route; household tabs, Settings, sign-in and the request route cannot be navigated into during recovery.
- A SecureStore marker is written before any recovery SDK mutation. Normal refresh is stopped and awaited. Any previous local session is signed out before the request and again before verification. A failed marker write or preparatory sign-out blocks verification.
- The code exists only in the input/request lifetime. It is never placed in controller snapshots, route parameters, storage or logs. The email is memory-only. SDK session persistence still uses the existing encrypted SecureStore adapter.
- Only the `verifyOtp` result can authorize a password change. Auth events, including ordinary `SIGNED_IN` and `PASSWORD_RECOVERY`, do not grant recovery authorization. Sign-in/out or unexpected session events while verification is pending invalidate its result.
- The result must have a nonempty user ID, matching returned user/session IDs, both emails matching the requested normalized email, nonempty access/refresh tokens, bearer token type, and finite future expiration. Recovery SDK tokens are not exposed as the provider's normal session.
- Authorization is memory-only and time-limited. `getUser()` revalidates the current server user ID and email before `updateUser`; the authorization identity and deadline are checked again after that await. An ordinary signed-in account cannot update another account by changing the entered email. A different account can be recovered only with a verified response for that account.
- Successful update requires a matching returned user and unchanged authorization identity. Failure or missing/mismatched confirmation never produces success. Concurrent request/verify/update/cancel operations are blocked by busy state and tracked SDK work.
- Lifecycle generation checks discard stale completions. On remount, initialization waits for previous SDK writes before reading the marker. An interrupted recovery is signed out and its marker cleared before any normal session restoration. Failure stays guarded until cleanup retry succeeds. The app does not restore recovery authorization after restart.
- Cleanup remains local scope; Settings sign-out remains global. Task 03 sign-in/sign-out event-ordering regressions are unchanged.

These guards isolate application navigation, **not Supabase backend privileges**. A recovery session is an authenticated Supabase session and existing RLS remains the backend data boundary. No claim is made that a password reset immediately revokes every access token on other devices.

## Removed link complexity

Removed the recovery URL parser, recovery redirect constant, token-hash intake/pending queue, recovery link routing and obsolete parser tests. No parallel recovery implementation remains. `app/+native-intent.tsx` is retained solely for existing ordinary navigation allowlisting and stripping external query/fragment data. Old credential-bearing recovery URLs are discarded and never authorize a reset. `detectSessionInUrl: false` is unchanged.

## Exact replacement Supabase email template — owner action, not performed

In **Kuttberg HQ Development** → **Authentication → Email Templates** (or **Emails → Templates**) → **Reset Password**, replace the old link template with this body. Suggested subject: **Your Kuttberg HQ recovery code**.

```html
<h2>Reset your Kuttberg HQ password</h2>
<p>Enter this eight-digit recovery code in Kuttberg HQ:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
<p>This code expires after 60 minutes. If you requested another code, use the latest email.</p>
<p>After the code is verified, you have up to 10 minutes to choose your new password.</p>
<p>Do not share this code. If you did not request a password reset, you can ignore this email.</p>
```

Do not include `ConfirmationURL`, `TokenHash`, a native reset anchor or a verification URL. Keep the verified OTP length/expiry and SMTP settings unchanged. The old `kuttberg-hq://reset-password` Redirect URL is no longer used by this flow and can remain without affecting code verification. Remove that stale allowlist entry in a separately authorized cleanup once older link-based app versions are retired; preserve unrelated redirects and the app's scheme for other navigation.

No domain, HTTPS handoff page, universal link or app link is required. The updated template must be in place before device acceptance: the old link-based email cannot supply the required visible code. A hosted CAPTCHA, MFA or secure-password-change requirement needing another challenge remains a blocker for a separate approved implementation; do not weaken hosted protection to bypass it.

## Automated verification — initial code correction

| Check | Result |
| --- | --- |
| Strict TypeScript (`npm run typecheck`) | PASS |
| ESLint (`npm run lint`) | PASS after lazy countdown initialization correction |
| Default Jest | PASS: 208 tests / 15 suites; zero failures or skips |
| iOS Jest (`--preset=jest-expo/ios`) | PASS: 208 tests / 15 suites; zero failures or skips |
| Android Jest (`--preset=jest-expo/android`) | PASS: 208 tests / 15 suites; zero failures or skips |
| Expo public configuration | PASS; iOS/Android, version 1.1.0, scheme and identifiers preserved |
| Expo dependency check | Offline installed-version map reports dependencies up to date; online compatibility unverified |
| Expo Doctor | BLOCKED: npm registry DNS lookup failed (`ENOTFOUND registry.npmjs.org`); no Doctor pass claimed |
| iOS JavaScript export | PASS: Hermes bundle generated |
| Android JavaScript export | PASS: Hermes bundle generated |
| Whitespace / staged-file / scope review | PASS: `git diff --check`, index empty, exactly 13 changed files, branch/HEAD unchanged |

The first full Jest runs passed 208/208 tests on each preset. Lint then identified eager `Date.now()` evaluation during countdown render; changing it to a lazy state initializer resolved the purity error. A direct URL-polyfill import preserves the retained native-intent handler's previous initialization dependency after removing its auth imports. Final results include both corrections. Expo export emits the environment's `NO_COLOR`/`FORCE_COLOR` warning; it does not prevent bundle generation.

The initial code-correction recovery suites contain 92 cases (75 controller/validation, 9 router/UI and 8 native-intent cases); the remaining 116 tests preserve the prior application/Task 03 suite.

All recovery accounts, codes, errors and sessions in automated tests are synthetic/mocked; no hosted Supabase operation is executed. Invalid/expired/reused/superseded tests model the provider rejection response; they do not prove the hosted server's actual expiry, replay or supersession behavior. Those require the device checklist below.

Coverage includes requests and account privacy, request/resend cooldown and rate limits, exact code validation/paste, verification authorization, response integrity, ordinary-sign-in bypass prevention, recovery while signed in, password validation, failed/successful update, cleanup/retry, duplicate calls, stale events, background/short session expiry/ten-minute limit, remount during requests/verification/update, and actual Expo Router guards. Existing Task 03 controller/navigation tests are unchanged.

## Standalone iPhone and Android acceptance checklist

Run each row separately on **both platforms** with approved compatible standalone builds and an existing account whose owner authorizes the live password change. Record device/OS/build/runtime/mail app and result privately. Do not record codes, passwords, tokens or full auth responses.

| Check | iPhone | Android |
| --- | --- | --- |
| Home-screen launch without Metro; Frances branding, small/large text, keyboard scrolling | Pending | Pending |
| VoiceOver / TalkBack labels, announcements, numeric keyboard, paste and available autofill | Pending | Pending |
| Invalid email rejected; authorized existing account request produces neutral confirmation and an eight-digit email | Pending | Pending |
| Approved nonexistent-address comparison uses the same confirmation; avoid exhausting quotas | Pending | Pending |
| Resend disabled for 60 seconds; replacement arrives; most recent code works | Pending | Pending |
| Six/seven/nine digits, letters and internal spaces rejected; eight digits with a leading zero accepted as input | Pending | Pending |
| Wrong code fails; old code after successful replacement fails; consumed code fails; code older than 60 minutes fails | Pending | Pending |
| Valid code alone opens password form; no household/Settings access or flash through Back, gestures or ordinary links | Pending | Pending |
| 12-character minimum, maximum 128, nonblank password, mismatch and Show/Hide behavior | Pending | Pending |
| Background clears entered code/passwords; return within deadline permits continuation; after 10 minutes requires fresh recovery | Pending | Pending |
| Successful update clears local recovery, returns to sign-in, blocks back navigation; new password works and old password fails | Pending | Pending |
| Offline request/verification/update show sanitized errors without false success; restore connection and retry appropriately | Pending | Pending |
| Cancellation returns signed out; interrupted recovery/force-close cannot restore household access or password authority | Pending | Pending |
| Cleanup failure remains guarded; reconnect/retry cleanup without a second password update (storage failure covered by mocks) | Pending | Pending |
| Normal sign-in and global Settings sign-out, including offline failure/retry, still work | Pending | Pending |

The forgot-password route is intentionally signed-out-only. For a previously authenticated user on device, use normal Settings sign-out before starting recovery. The controller also safely handles a recovery request with a preexisting session; synthetic tests cover both identity mismatch rejection and valid recovery of a different email. Task 03's live authentication/RLS acceptance is a separate pending procedure.

## Native build impact and limits

This correction changes only JavaScript/TypeScript, tests and documentation. No app scheme, identifiers, dependencies, native plugins, runtime policy, app version, EAS channel or environment changed. **No new native build is required solely because of this correction if the installed binary already contains the Milestone 03 native dependencies.** Delivery is a separate owner-approved release action and was not performed.

Older Milestone 02 binaries lack the Milestone 03 SecureStore prerequisite recorded in Task 03 documentation. Do not send this change to those binaries via OTA. If a compatible Milestone 03 standalone build does not exist, the existing native-build/runtime-version prerequisite still applies. This task does not resolve or change release versioning.

Physical device behavior, Gmail OTP autofill, live code replay/expiry/supersession, actual password update and native persistence/cleanup are unverified. Clipboard contents are not read or altered by application code beyond normal user paste; native OTP hints do not guarantee Gmail extraction. No promise is made that a lost update response means the password stayed unchanged.

## Cumulative changed-file inventory relative to c4d72a1

| Change | File | Purpose |
| --- | --- | --- |
| Modified | `README.md` | Describe code recovery and link this report |
| Modified | `docs/milestone-03-task-04.md` | Replace obsolete link flow/configuration with this report |
| Modified | `app/+native-intent.tsx` | Remove recovery intake; preserve ordinary navigation sanitization |
| Modified | `app/forgot-password.tsx` | Request-code wording and form |
| Modified | `app/reset-password.tsx` | Code/request/verification states and existing password form |
| Modified | `src/auth/authController.ts` | Bound-email recovery, server verification, response checks and lifecycle protections |
| Modified | `src/auth/AuthProvider.tsx` | Expose recovery-code verification |
| Modified | `src/auth/recovery.ts` | Eight-digit validation and sanitized messages; remove parser/redirect |
| Created | `src/auth/RecoveryCodeForm.tsx` | Numeric/autofill/paste input, resend countdown, field clearing |
| Modified | `test-support/authClient.ts` | Synthetic email/token SDK signatures and email identity |
| Modified | `__tests__/password-recovery.test.ts` | Recovery controller/validation/security regressions |
| Modified | `__tests__/recovery-navigation.test.tsx` | Real-router request/code/password, guarded navigation and mobile input tests |
| Modified | `__tests__/recovery-native-intent.test.ts` | Retained navigation sanitization and discarded legacy URLs |
| Created | `__tests__/recovery-sdk-events.test.ts` | Nine final regressions executing the installed SDK and controller |

All changes remain unstaged. No commits, pushes, merges, hosted configuration, migrations, accounts, real password resets, `.env.local`, dependencies, EAS builds or publications were changed. Temporary verification output is ignored under `.cache/task-04-code`. **Task 04 remains pending owner acceptance.**

## Final recovery-event regression follow-up

**Conclusion: no production correction is necessary.** The installed Supabase JS and auth-js packages are both **2.119.0**. Their executed recovery verification path emits `PASSWORD_RECOVERY` only, not `SIGNED_IN` and not both. The existing controller correctly handles that event without authorizing from it alone.

### Observed implementation and ordering

Inspected installed `node_modules/@supabase/auth-js/src/GoTrueClient.ts`:

- `verifyOtp` (line 2479) performs the HTTP request/response transformation, awaits `_saveSession`, then awaits `_notifyAllSubscribers(params.type == 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', session)` before returning the result.
- `_saveSession` (line 5288) persists the session; it emits no auth event.
- `_notifyAllSubscribers` (line 5234) invokes subscribers and awaits their completion. App initialization has already completed before the controller permits recovery verification.

The regression suite executes the **actual installed SDK through `jest.requireActual('@supabase/supabase-js').createClient`**, including its request transformation, persistence and event notification implementations. It supplies only synthetic HTTP responses and an asynchronous memory storage adapter. No auth methods or event-producing internals are replaced, no event is manually emitted, and no SDK implementation is copied into the tests. A test subscriber deliberately delays completion to verify ordering; production auth callbacks remain synchronous.

Observed isolated successful `verifyOtp({ email, token, type: 'recovery' })` sequence:

```text
session saved
PASSWORD_RECOVERY
verifyOtp resolved
```

There is no `SIGNED_IN` in that sequence. `INITIAL_SESSION` belongs to subscription initialization, not code verification. The controller's preparatory local sign-out can separately emit `SIGNED_OUT` before calling `verifyOtp`; it resets its interruption check after that sign-out finishes. A separate real `signInWithPassword` call generates `SIGNED_IN`, and must continue to invalidate recovery even if it signs in the same email.

### Nine added regression cases

New file: `__tests__/recovery-sdk-events.test.ts`.

1. Real SDK persists the session, emits only `PASSWORD_RECOVERY`, awaits the subscriber, then resolves verification; asserts the actual outbound recovery email/token/type payload.
2. Controller remains unauthorized while the real verification callback is pending, then authorizes only on successful response; actual SDK `getUser`, password update, local sign-out and storage cleanup complete successfully.
3. Real same-account password sign-in during pending verification invalidates recovery.
4. Real different-account password sign-in during pending verification invalidates recovery.
5. Real same-account password sign-in after authorization invalidates recovery.
6. Real different-account password sign-in after authorization invalidates recovery.
7. A real `PASSWORD_RECOVERY` event with a mismatched server email cannot authorize an update.
8. A real SDK rejected verification response emits neither recovery nor sign-in and cannot authorize an update.
9. Remount during a real SDK verification waits for the previous operation, then clears the persisted recovery session before normal restoration.

No event allowlist relaxation or production refactor was made. Existing restart, deadlines, cleanup and Task 03 authentication behavior remain unchanged and are included in the full suites.

### Follow-up verification and inventory

| Check | Final follow-up result |
| --- | --- |
| Strict TypeScript (`npm run typecheck`) | PASS |
| ESLint (`npm run lint`) | PASS |
| Default Jest | PASS: 217 tests / 16 suites; no failures or skips |
| iOS Jest (`--preset=jest-expo/ios`) | PASS: 217 tests / 16 suites; no failures or skips |
| Android Jest (`--preset=jest-expo/android`) | PASS: 217 tests / 16 suites; no failures or skips |
| Whitespace, index and preservation review | PASS; index empty; only report changed among preexisting files |

No configuration/export rerun was needed for this test/documentation-only follow-up; no runtime or native configuration changed. The preceding code-correction configuration/export results and Expo Doctor network limitation remain recorded above.

Changes made specifically in this follow-up: **one new test file** (`__tests__/recovery-sdk-events.test.ts`) and **this report** (`docs/milestone-03-task-04.md`). A pre-edit file-hash inventory confirms all other existing tracked and untracked project files are unchanged from the start of this follow-up. The previous 13-file correction remains intact and unstaged; the cumulative Task 04 correction now contains 14 files.

These tests establish the installed SDK's event behavior against controlled HTTP responses, not actual hosted OTP acceptance or device storage behavior. No hosted requests, recovery emails, real passwords, builds, publication, commits or other Git-writing operations occurred. Task 04 acceptance and Task 03 live verification remain pending.
