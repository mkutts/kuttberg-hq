# Kuttberg HQ repository instructions

- Inspect the repository and Git status before editing. Preserve existing work and never delete or overwrite unrelated user files.
- Implement only the explicitly approved task. Finish implementation, testing, review, and verification before proceeding. Keep changes focused and understandable.
- Support iOS and Android equally using one shared codebase. Use strict TypeScript and keep dependencies minimal and compatible with the Expo SDK.
- Implement only real functionality. Keep private household information and secrets out of code and commits.
- Milestone 01 excludes authentication, Supabase integration, production databases, functional household tasks, reminders, and AI features.
- Run lint, type checking, and relevant tests. Report completed work, failed or skipped checks, and verification limits.

## Milestone 01 — App Foundation

Before each coding task, verify that the working directory and Git root are
`C:\Users\mattk\Kutberg HQ`, the active branch is `milestone/01-app-foundation`,
and `origin` points to `https://github.com/mkutts/kuttberg-hq.git`. Confirm the
branch tracks `origin/milestone/01-app-foundation`. Read this file, fetch `origin`,
and verify that the local and upstream milestone branches point to the same
commit and that the working tree is clean before editing. Stop if any check fails.

Keep project changes inside the approved repository and leave the old OneDrive
project directory untouched. Scope commits and pushes to the approved task and
milestone branch. Commits and merges to `main` require explicit authorization.
Never force-push or rewrite history. Verify the push and confirm the working
tree is clean.

Validate both iOS and Android. Run lint, strict TypeScript, Jest, the Android and
iOS Jest presets when supported, Expo dependency validation, Expo Doctor, and
bundle exports for both platforms. Report automated checks, Android emulator,
Android physical device, iOS Simulator, and iPhone separately. Record failures,
skipped checks, and verification limits in `docs/milestone-01-verification.md`.

1. **Repository Inspection and App Foundation Setup.** Inspect the repository and establish Expo, React Native, TypeScript, Expo Router, basic testing, and documentation.
2. **Design System.** Create reusable colors, typography, spacing, UI components, and accessibility foundations.
3. **Five-Tab Navigation.** Implement Today, Routines, Wellness, Responsibilities, and Inbox navigation.
4. **Today Dashboard Shell.** Build a polished Today screen with clearly labeled future sections and no fictional functionality.
5. **Settings and Secondary Screens.** Implement Settings navigation and purposeful placeholder screens for the remaining tabs.
6. **Loading, Empty, and Error States.** Create reusable, accessible interface states and relevant tests.
7. **Quality Checks and Project Documentation.** Finalize linting, TypeScript validation, automated tests, README, and AGENTS.md.
8. **iPhone and Android Build Verification.** Configure development-build readiness and verify the application on both platforms.

Stop after each task for user review. Begin each subsequent task only after explicit approval.
