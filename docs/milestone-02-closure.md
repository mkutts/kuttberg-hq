# Milestone 02 closure

Milestone 02 added official Frances branding, standalone preview builds and manual EAS Update delivery on both platforms. The owner accepted the native previews and the JavaScript-only **OTA Test: Milestone 02** update. This record covers preview acceptance. Production release approval and verification are separate.

## Source and working tree

| Item | Verified result |
| --- | --- |
| Branch | `milestone-02-branding-updates` |
| HEAD and OTA source | `0b4c1837ea06730119638b415c1589a1760ee3dc` |
| Recorded upstream | `origin/milestone-02-branding-updates` at the same commit, 0 ahead and 0 behind |
| Recorded merge base | Local `main` and `origin/main` at `1deda159d93ba9eebb9efa445ffbd244ae63180d`, four commits behind the milestone |
| Origin | `https://github.com/mkutts/kuttberg-hq.git` |
| Working tree | Clean at preflight. Closure changes are limited to `README.md`, this report, and `docs/release-playbook.md`, all left uncommitted. |

The four committed implementation changes are branding (`18a28c6`), EAS Update infrastructure (`58fb34a`), manual update controls (`d109d41`), and the OTA test caption (`0b4c183`). The caption commit changes one line in the shared Settings component. GitHub DNS resolution failed during a read-only `git ls-remote`, so current remote branch tips and PR status still need a live check.

## Build and update settings

Both platforms use `com.mkutts.kuttberghq`. The project is `mkutts/kuttberg-hq` and the update URL is `https://u.expo.dev/32c14ce4-a3e8-4dcd-af19-49cdc676b3bb`. The app version and resolved `appVersion` runtime are both `1.1.0`. The native update configs enable EAS Update and set launch checking to `NEVER` with a zero launch wait. Settings provides the manual check, download, and restart flow and displays the native app version, build number, channel, runtime, and running update ID when available.

| Profile | Distribution | Channel | Environment |
| --- | --- | --- | --- |
| `development` | Internal Metro development client | No fixed channel | `development` |
| `preview` | Internal standalone for iPhone and Android | `preview` | `preview` |
| `production` | Store build | `production` | `production` |

## Installed branding assets

The original approved files under `assets/images/` are the artwork used by the native app configuration. All five files are 1024 × 1024 PNGs. The splash plugin uses the transparent image with `contain`, width `200`, and background `#FEEED0` on both platforms.

| Installed role | File |
| --- | --- |
| iOS launcher | [`KuttbergHQ_iOS_App_Icon_1024.png`](../assets/images/KuttbergHQ_iOS_App_Icon_1024.png) |
| Android legacy launcher | [`KuttbergHQ_Android_Legacy_App_Icon_1024.png`](../assets/images/KuttbergHQ_Android_Legacy_App_Icon_1024.png) |
| Android adaptive foreground | [`KuttbergHQ_Android_Adaptive_Foreground_1024.png`](../assets/images/KuttbergHQ_Android_Adaptive_Foreground_1024.png) |
| Android adaptive background | [`KuttbergHQ_Android_Adaptive_Background_1024.png`](../assets/images/KuttbergHQ_Android_Adaptive_Background_1024.png) |
| iPhone and Android splash | [`KuttbergHQ_Splash_Screen_Logo_1024_Transparent.png`](../assets/images/KuttbergHQ_Splash_Screen_Logo_1024_Transparent.png) |

## Physical-device acceptance

The owner reported these results for both physical phones running standalone preview builds. Closure verification used that report and the local automated checks.

| Check | iPhone | Android |
| --- | --- | --- |
| Task 02.5 native preview checklist | **PASS 9/9** | **PASS 9/9** |
| Task 02.6B preview OTA checklist | **PASS 10/10** | **PASS 10/10** |
| Official Frances launcher icon and splash | Pass | Pass |
| Standalone launch without Expo Go and five working tabs | Pass | Pass |
| Installed version, runtime, and channel | `1.1.0`, `1.1.0`, `preview` | `1.1.0`, `1.1.0`, `preview` |
| Update detection, download, and explicit **Restart to Update** | Pass | Pass |
| New running update ID and visible `OTA Test: Milestone 02` caption after restart | Pass | Pass |
| Same native version and runtime, with normal app operation after restart | Pass | Pass |

## Preview OTA publication record

| Field | Recorded value |
| --- | --- |
| Update group | `72fd03d3-2794-4283-b11a-482a532f1441` |
| Channel | `preview` |
| Runtime | `1.1.0` |
| Source commit | `0b4c1837ea06730119638b415c1589a1760ee3dc` |
| Android update ID | `01a1e198-a775-742e-b148-fa9ed838c737` |
| iOS update ID | `01a1e198-a775-7711-bec9-b5aaa12d51c5` |
| Message | `OTA Test: Milestone 02` |

The publication record is owner-supplied. The source commit and caption were verified in Git, and the owner confirmed the new running update ID and caption on each phone. Independent EAS confirmation was blocked by DNS resolution for `api.expo.dev` and a browser access timeout. With authenticated EAS access, use `npx eas-cli update:view 72fd03d3-2794-4283-b11a-482a532f1441 --json` and `npx eas-cli channel:view preview` to compare the group and the channel mapping. [Expo dashboard update group](https://expo.dev/accounts/mkutts/projects/kuttberg-hq/updates/72fd03d3-2794-4283-b11a-482a532f1441)

## Automated checks

| Check | Result |
| --- | --- |
| ESLint and strict TypeScript | Pass |
| Jest default | 7 suites, 46 tests passed |
| Jest iOS | 7 suites, 46 tests passed |
| Jest Android | 7 suites, 46 tests passed |
| Expo public config, introspection, and local EAS profile checks | Pass. iOS plist and Android manifest/resources resolve to `1.1.0`, the expected update URL, updates enabled and `NEVER`. |
| Expo dependency compatibility | Pass against the installed SDK 58 dependency map. Expo's remote versions endpoint was unavailable. |
| Expo Doctor 1.21.8 | 18/20 passed. Remote Expo config schema and React Native Directory metadata checks could not complete. |
| iOS and Android Hermes exports | Pass for both platforms. Metro emitted a terminal color environment warning. |

Jest warned about duplicate package names in ignored `.cache` copies from earlier Expo checks. All three runs finished successfully. The current Expo introspection is a local check. The two network-dependent Expo Doctor checks still need an online run.

## Security and follow-up

- A targeted review of tracked paths and common secret patterns in the current tree and the four milestone commits found no tracked credential files or secret matches. Environment and signing files are ignored. The configured project ID and update URL identify the project. The credential review did not inspect private signing materials or remote environment values.
- The tracked tree contains no GitHub Actions or EAS Workflows. Verify GitHub and EAS dashboard automation and access settings before the first production release. The Android release-manifest permission review carried forward from Milestone 01 remains open.
- Production delivery and rollback have not been tested on phones. The rollback procedure is in the [release and rollback playbook](release-playbook.md). Repeat the device checks after an approved production release. Keep the test caption as recorded here. Changing the caption on installed preview devices requires a separately approved compatible publication.

## Merge recommendation and procedure

Ready for owner review. Merge after documentation approval, a live GitHub branch comparison, and the required PR checks and explicit merge approval. Recheck EAS metadata and the two online Doctor checks from a networked session and record the outcomes. Preview acceptance supports the milestone merge. Production publication has its own approval and validation.

1. After the owner approves the three files and their commit and push, verify the milestone branch. Stage only the closure files and inspect the staged diff.

   ```powershell
   git branch --show-current
   git add -- README.md docs/milestone-02-closure.md docs/release-playbook.md
   git diff --cached --check
   git diff --cached --stat
   git diff --cached
   git commit -m "docs: close milestone 02 branding and updates"
   git status --short --branch
   git rev-parse HEAD
   git push origin milestone-02-branding-updates
   git fetch origin
   git log --oneline origin/main..origin/milestone-02-branding-updates
   git diff --stat origin/main...origin/milestone-02-branding-updates
   ```

2. On GitHub, open or update the PR with base `main` and head `milestone-02-branding-updates`. Confirm the PR head matches the pushed documentation commit and the PR contains the four accepted implementation commits and the closure commit. If the base moved, review the new diff and rerun affected checks. Confirm required checks and branch protection are satisfied.
3. After separate explicit merge approval, use GitHub's **Create a merge commit** for the reviewed PR, subject to the repository's enabled merge methods. Verify the PR shows **Merged** and record the resulting `main` commit. Release and rollback operations follow the [playbook](release-playbook.md) under separate approval.
