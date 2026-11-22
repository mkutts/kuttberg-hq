# Release and rollback playbook

Kuttberg HQ uses manual EAS Update publication. The owner must explicitly approve a Git merge and separately approve each publication, including rollback. Build submissions also require approval. GitHub Actions, EAS Workflows, and merges to `main` must never publish an update.

## Git and EAS targets

| Name | What it controls |
| --- | --- |
| Git branch | Source history used to review and select a release commit, such as `milestone-02-branding-updates` or `main`. |
| EAS Update branch | Server-side history of published update groups. |
| EAS Update channel | The name embedded in a standalone build. Expo uses its server-side mapping to select an EAS Update branch, then serves a compatible update for the build's platform and runtime. |
| EAS environment | The environment variables used when creating a build or exporting an update. SDK 58 requires `--environment` on `eas update`. |

The preview profile uses `preview` for both channel and environment. The production profile uses `production` for both. Verify the actual channel-to-branch mappings in EAS even when their names match. Keep their destinations separate. [Expo deployment guide](https://docs.expo.dev/eas-update/deployment/) · [EAS environment usage](https://docs.expo.dev/eas/environment-variables/usage/)

## Release procedure

1. Develop and run the [quality checks](../README.md#quality-checks) on a milestone branch. Review the diff, device results, dependency and native changes, and any persistent-data changes.
2. Obtain the owner's approval for the reviewed changes. Commit and push the accepted work. Obtain explicit merge authorization before merging the reviewed PR into `main`.
3. Before any build or publication, record `git rev-parse HEAD` and confirm `git status --porcelain` returns no output. Compare the actual release source commit with the approved commit.
4. Decide whether the change is OTA-compatible. JavaScript and bundled assets can use the existing runtime if they work with the native code already installed on both target platforms. Changes to the Expo SDK, native modules, config plugins, permissions, launcher icon, splash screen, or other native configuration require separately approved native builds. With `appVersion`, bump `expo.version` for a native compatibility change before building and target the new runtime after verifying the resulting binaries. The `ON_LOAD` setting needs a replacement binary but does not change native compatibility, so this policy change retains runtime `1.2.0`. [Expo runtime version guide](https://docs.expo.dev/eas-update/runtime-versions/)
5. Validate the source configuration with `npx expo config --type introspect --json` and review both profiles in `eas.json`. Confirm the update URL, enabled status, platform identifiers, launch check policy, and runtime. With authenticated EAS access, check `npx eas-cli project:info`, `npx eas-cli channel:view <channel>`, and `npx eas-cli config --platform <platform> --profile <profile> --non-interactive`. Check the channel mapping, build profile, installed runtime and platform, environment values, signing access for native builds, and connected release automation in the Expo dashboard. Keep credentials out of source, app config, and client bundles.
6. Present the source commit, message, channel, mapped EAS branch, environment, runtime, platforms, and recovery target for explicit publication approval. After approval, publish manually from the verified checkout, for example `npx eas-cli update --channel <approved-channel> --environment <matching-environment> --platform all --message "<approved-message>"`.
7. Inspect the result with `npx eas-cli update:view <group-id>`. On a physical iPhone and Android phone with a new `ON_LOAD` build, record the current ID under **Settings → App Updates → Show Update Details**. Cold-launch online once to download in the background without using the manual controls; allow the download to finish, then fully close and cold-launch again to apply it. Confirm the visible change and published platform ID. If automatic download fails, use **Check for Updates → Download Update → Restart to Update** as a manual fallback. Record the source commit, EAS branch, channel, environment, runtime, group and platform IDs, native build numbers, and device results. Use the [device checklist](../README.md#device-verification) for additional coverage. Existing `NEVER` builds still require the manual flow until replaced.

## Rollback and recovery

### Select a recovery target

Record the affected channel, its current EAS branch and rollout state, the installed runtime, the bad update group and platform IDs, and the symptoms. Use `npx eas-cli update:list --branch <mapped-branch> --runtime-version <runtime> --platform all` and `npx eas-cli update:view <group-id>` to find the last group known to work on both platforms. Cross-check it against the release record and tested app behavior. For the embedded option, identify the exact installed binaries and the behavior of their built-in bundles.

Check that the prior group covers iOS and Android on the exact runtime affected. Test the recovery candidate on preview devices with data in the state left by the bad update. An older bundle leaves persistent data as it finds it. If the update changed local storage, file formats, database schema, or server data in a way the old code cannot read safely, use a tested forward fix and any needed data repair. [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/)

### Apply an approved rollback

Obtain explicit owner approval for the recovery target, runtime, platforms, and destination before issuing either command. Check the mapped branch and any other channels that point to it. Resolve any active rollout and its impact before proceeding.

| Target | Command |
| --- | --- |
| Previously published group | `npx eas-cli update:republish --group <known-good-group-id> --destination-channel <approved-channel> --platform all --message "Rollback to <known-good-group-id>"` |
| Bundle embedded in the installed build | `npx eas-cli update:roll-back-to-embedded --channel <approved-channel> --runtime-version <installed-runtime> --platform all --message "Rollback to embedded bundle"` |

Republishing creates a new update group. Record its new platform IDs for verification. The embedded procedure publishes a directive for matching builds to return to their own embedded bundles. [Expo rollback guide](https://docs.expo.dev/eas-update/rollbacks/) · [EAS CLI reference](https://docs.expo.dev/eas/cli/)

### Verify recovery on iPhone and Android

1. Inspect the new group or directive in EAS and confirm its branch, runtime, and platforms. On new `ON_LOAD` builds, cold-launch both online phones to download, wait until Settings shows the update or rollback ready, then cold-launch again to apply. The Settings manual controls remain available for immediate application or recovery. On older `NEVER` builds, use **Check for Updates → Download Update → Restart to Update**, or **Prepare Rollback → Restart to Roll Back** for an embedded directive.
2. After restart, verify the same installed app version, build number, channel, and runtime. For republish, match each running ID to the new group's platform ID. For embedded rollback, compare the running ID, when displayed, and the visible behavior with the known embedded baseline for that build. The current Settings screen shows the running ID when available and has no embedded-launch indicator. Capture the baseline before OTA testing when possible. [Expo SDK 58 Updates API](https://docs.expo.dev/versions/v58.0.0/sdk/updates/)
3. Cold-launch both apps, check the five tabs and Settings, and verify any data affected by the incident. Record the outcome for each phone. Verify any subsequent forward update separately.

### Recover from a failed check, download, or launch

- If a device is offline or a check or download fails, keep using the running bundle. Restore connectivity and use **Retry**. If Settings reports that no update was downloaded, check again. Wait for the ready message before using the restart control. A previously downloaded bundle can also take effect on a cold launch.
- If retries fail, compare the installed channel, runtime, and platform with the EAS update and branch mapping. Check service availability and collect Expo Updates logs where available. A server-side rollback still needs connectivity and a client that can receive it.
- If the app cannot reach Settings after launch, Expo's native error recovery may fall back in some cases. New `ON_LOAD` builds can check the server during recovery; older `NEVER` builds cannot rely on that check. If the cached or embedded bundle cannot restore a usable app, preserve or back up local data where possible and arrange installation of a known-good, correctly signed binary. Uninstalling can erase local data. If the fix changes native compatibility or the installed binary cannot run the fix, obtain approval for a new native build and verify it on both platforms. [Expo troubleshooting](https://docs.expo.dev/eas-update/debug/) · [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/)
