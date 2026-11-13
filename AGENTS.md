# Kuttberg HQ repository instructions

- Inspect the repository and Git status before editing. Preserve existing work and never delete or overwrite unrelated user files.
- Implement only the explicitly approved task. Finish implementation, testing, review, and verification before proceeding. Keep changes focused and understandable.
- Support iOS and Android equally using one shared codebase. Use strict TypeScript and keep dependencies minimal and compatible with the Expo SDK.
- Implement only real functionality. Keep private household information and secrets out of code and commits.
- Run lint, type checking, and relevant tests. Report completed work, failed or skipped checks, and verification limits.

## Milestone 02 - Branding and updates

Before editing, verify the working directory and Git root are
`C:\Users\mattk\Kutberg HQ`, the active branch is `milestone-02-branding-updates`,
and `origin` points to `https://github.com/mkutts/kuttberg-hq.git`. Check the
tracking branch and review existing changes. Preserve owner-authorized changes.
When remote access is restricted, use the locally recorded upstream and report
the verification limit.

Keep project changes inside the approved repository and leave the old OneDrive
project directory untouched. Commit, push, or merge only as authorized for the
task. Never force-push or rewrite history.

Keep preview and production on separate EAS channels and environments. Publish
updates manually with explicit owner approval for each publication, including
production. Keep publication out of GitHub Actions and EAS Workflows. Bump the
Expo app version and create new approved native builds when native compatibility
changes. See [EAS Update infrastructure](README.md#eas-update-infrastructure).

Run lint, strict TypeScript, the default Jest suite and both platform presets,
Expo configuration and dependency checks, Expo Doctor, and iOS and Android
JavaScript exports for relevant changes. Report automated results and device
verification separately for each platform.

Stop after each task for user review. Begin each subsequent task only after explicit approval.
