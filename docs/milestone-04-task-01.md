# Milestone 04 Task 01 — tasks database

Migration `20261122000100_create_tasks_and_events.sql` adds `public.tasks` and `public.task_events` without modifying the Milestone 03 schema. Each task belongs to one existing workspace and records a creator, a 1–255 character nonblank title, optional description and due `date`, priority (`low`, `normal`, `high`), status (`active`, `completed`), Inbox flag, archive timestamp, and database timestamps. New tasks start active with normal priority and Inbox placement. The app can use the signed-in user's existing private Personal workspace for a private Inbox; Inbox is not a separate workspace.

Task SELECT, INSERT, and UPDATE policies consult the existing `public.workspaces` SELECT policy, which grants private access to the owner and shared access to explicitly listed members. Update checks both the old and new workspace. The write trigger rejects forged creators and changed IDs/creation timestamps, replaces client-supplied write timestamps, and requires a permanent authenticated user. A new task cannot start completed.

Direct updates to `tasks.status` are supported. The after-update trigger appends a `completed` or `reopened` event only when the status actually changes. Postgres serializes writes to one task row, and event insertion and status update commit or roll back together. The trigger functions are in the inaccessible private schema, run with the table owner's rights, use `pg_catalog` as the explicit search path, and derive the actor from `auth.uid()`. Authenticated clients receive only SELECT on events; event RLS checks current task visibility. Access revocation removes subsequent task and event visibility. Neither table grants client DELETE. An archived task remains queryable to an authorized user, and archiving/restoring does not remove history. No hard-delete operation is provided; administrative deletion is outside this task and is constrained by the event foreign key.

## Local verification

With Docker Desktop running and the local Supabase CLI available, from the repository root run:

```sh
npx supabase start
npx supabase db reset --local --no-seed
npx supabase test db
node .\supabase\tests\database\task_completion_concurrency.js
npm run typecheck
npm run lint
npm test
npm test -- --preset jest-expo/ios
npm test -- --preset jest-expo/android
```

The `tasks_rls.test.sql` pgtap suite uses synthetic Auth identities and existing household provisioning. It covers task constraints, visibility, update and archive paths, event insertion and tampering, and grant revocation. The separate Node script opens two `psql` connections in the local `supabase_db_kuttberg-hq` Docker container. It creates two synthetic authenticated members of a temporary shared workspace, waits until the second completion is blocked on the first session's row lock, then verifies the completed status and exactly one event. It cleans up its synthetic rows, exits nonzero on any failure, and requires no real household credentials or npm packages. Run it only against the local Supabase stack; `PASS` plus exit code 0 means the concurrency and cleanup checks succeeded. The single-session pgtap suite alone does not test concurrency. Hosted migrations have not been applied by this Task 01 implementation. App task screens and data access are later tasks; physical-device verification is not applicable to this database-only change.
