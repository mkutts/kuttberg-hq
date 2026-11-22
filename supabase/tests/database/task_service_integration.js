// Run from the repository root: node .\supabase\tests\database\task_service_integration.js
// Local Supabase only. Uses temporary Auth users and the real Task 02 service/REST client.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const root = process.cwd();
const container = 'supabase_db_kuttberg-hq';
const ids = { household: randomUUID(), shared: randomUUID(), private: randomUUID() };
const marker = randomUUID();
const password = randomBytes(24).toString('hex');
let admin;
let userIds = [];
let fixtureCreated = false;

function check(result, label) {
  assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.ok ? result.data : result.error)}`);
  return result.data;
}
function denied(result, label) {
  assert.equal(result.ok, false, `${label}: unexpected success`);
  assert.ok(['notFound', 'permission'].includes(result.error.code), `${label}: ${result.error.code}`);
}
function sql(command) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
  { input: `${command}\n`, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Local SQL failed: ${result.error?.message || result.stderr?.trim() || result.status}`);
  return result.stdout.trim();
}
function localConfig() {
  const result = spawnSync(process.execPath,
    [path.join(root, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'],
    { cwd: root, encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(`Local Supabase status unavailable: ${result.error?.message || result.stderr?.slice(-500) || result.status}`);
  const config = JSON.parse(result.stdout);
  const url = config.API_URL;
  assert.ok(url, 'Local API_URL missing');
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'Refusing a non-loopback Supabase URL');
  assert.equal(parsed.protocol, 'http:', 'Expected local HTTP Supabase');
  const docker = spawnSync('docker', ['ps', '--filter', `name=^/${container}$`, '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(docker.stdout?.trim(), container, 'Expected the project local database container');
  return { url, anon: config.ANON_KEY, service: config.SERVICE_ROLE_KEY };
}
function loadService() {
  const source = fs.readFileSync(path.join(root, 'src/tasks/taskService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  // The service receives a real local client through injection. Its app-only default client is unused.
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name === '../supabase/client') return { getSupabaseClient: () => { throw new Error('Inject the local test client'); } };
    throw new Error(`Unexpected service import: ${name}`);
  }, module, module.exports);
  return module.exports.createTaskService;
}
async function main() {
  const { url, anon, service } = localConfig();
  assert.ok(anon && service, 'Local ANON_KEY and SERVICE_ROLE_KEY are required');
  admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const clients = [];
  const makeUser = async (number) => {
    const email = `task-service-${marker}-${number}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error || new Error('Auth user creation failed');
    userIds.push(created.data.user.id);
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || login.data.user?.id !== created.data.user.id) throw login.error || new Error('Synthetic login failed');
    clients.push(client);
  };
  try {
    await makeUser(1);
    await makeUser(2);
    await makeUser(3);
    const [owner, member] = userIds;
    fixtureCreated = true;
    sql(`BEGIN;
      INSERT INTO public.households (id, slug, name) VALUES ('${ids.household}', 'task-service-${marker}', 'Task service fixture');
      INSERT INTO public.household_members (household_id, user_id) VALUES
        ('${ids.household}', '${owner}'), ('${ids.household}', '${member}');
      INSERT INTO public.workspaces (id, household_id, slug, name, workspace_type, privacy, owner_user_id) VALUES
        ('${ids.shared}', '${ids.household}', 'shared', 'Shared fixture', 'location', 'shared', null),
        ('${ids.private}', '${ids.household}', 'private', 'Private fixture', 'personal', 'private', '${owner}');
      INSERT INTO public.workspace_members (workspace_id, household_id, user_id) VALUES
        ('${ids.shared}', '${ids.household}', '${owner}'), ('${ids.shared}', '${ids.household}', '${member}');
      COMMIT;`);

    const make = loadService();
    const first = make(() => clients[0]);
    const second = make(() => clients[1]);
    const third = make(() => clients[2]);
    const created = check(await first.createTask({ workspaceId: ids.private, title: 'Synthetic task', dueDate: '2026-12-01' }), 'create');
    assert.equal(created.createdBy, owner);
    assert.equal(created.status, 'active');
    assert.equal(check(await first.fetchTask(created.id), 'read').id, created.id);
    assert.ok(check(await first.fetchActiveInboxTasks(), 'inbox').some(t => t.id === created.id));
    assert.ok(check(await first.fetchAllTasks(), 'all').some(t => t.id === created.id));
    assert.ok(check(await first.fetchWorkspaceOptions(), 'workspace options').some(w => w.id === ids.private));
    denied(await second.fetchTask(created.id), 'private read');
    assert.deepEqual(check(await second.fetchTaskEvents(created.id), 'private history'), []);
    denied(await second.updateTask(created.id, { title: 'Denied' }), 'private edit');
    denied(await third.fetchTask(created.id), 'outsider read');
    denied(await third.createTask({ workspaceId: ids.shared, title: 'Denied' }), 'outsider create');

    const edited = check(await first.updateTask(created.id, { title: 'Edited task', description: 'Local test', priority: 'high', dueDate: '2026-12-02' }), 'edit');
    assert.equal(edited.dueDate, '2026-12-02');
    assert.equal(edited.priority, 'high');
    denied(await first.moveTask(created.id, randomUUID()), 'invalid destination');
    assert.equal(check(await first.moveTask(created.id, ids.shared), 'move to shared').workspaceId, ids.shared);
    assert.equal(check(await second.fetchTask(created.id), 'shared read').id, created.id);
    denied(await second.moveTask(created.id, ids.private), 'private destination');

    assert.equal(check(await second.completeTask(created.id), 'complete').status, 'completed');
    assert.equal((await second.completeTask(created.id)).error.code, 'conflict');
    assert.equal(check(await first.reopenTask(created.id), 'reopen').status, 'active');
    assert.equal((await first.reopenTask(created.id)).error.code, 'conflict');
    assert.equal(check(await first.archiveTask(created.id), 'archive').status, 'active');
    assert.ok(check(await first.fetchTask(created.id), 'read archived').archivedAt);
    assert.ok(!check(await first.fetchActiveInboxTasks(), 'archived inbox').some(t => t.id === created.id));
    assert.equal(check(await first.restoreTask(created.id), 'restore').archivedAt, null);
    const history = check(await second.fetchTaskEvents(created.id), 'history');
    assert.equal(history.length, 2);
    assert.deepEqual(history.map(e => [e.eventType, e.actorUserId]).sort(), [['completed', member], ['reopened', owner]].sort());
    assert.deepEqual(check(await third.fetchTaskEvents(created.id), 'outsider history'), []);
    assert.equal(sql(`SELECT count(*) FROM public.task_events WHERE task_id = '${created.id}'`), '2');
    process.stdout.write('PASS: Task 02 service integration against local Supabase; synthetic users, RLS, transitions, actors, and history verified.\n');
  } finally {
    if (fixtureCreated) {
      sql(`BEGIN;
        DELETE FROM public.task_events WHERE task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN ('${ids.shared}', '${ids.private}'));
        DELETE FROM public.tasks WHERE workspace_id IN ('${ids.shared}', '${ids.private}');
        DELETE FROM public.workspace_members WHERE workspace_id = '${ids.shared}';
        DELETE FROM public.workspaces WHERE id IN ('${ids.shared}', '${ids.private}');
        DELETE FROM public.household_members WHERE household_id = '${ids.household}';
        DELETE FROM public.households WHERE id = '${ids.household}';
        COMMIT;`);
    }
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
    if (userIds.length) process.stdout.write('Cleaned up synthetic test data.\n');
  }
}

main().catch(error => { process.stderr.write(`FAIL: ${error.message}\n`); process.exitCode = 1; });
