// Local-only two-connection check. Run with: node .\supabase\tests\database\task_completion_concurrency.js
// Uses the Supabase CLI's local Docker database; no hosted credentials or npm packages.
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const containerName = 'supabase_db_kuttberg-hq';
const id = {
  household: randomUUID(), workspace: randomUUID(), task: randomUUID(),
  first: randomUUID(), second: randomUUID(),
};
const slug = `concurrency-${id.household}`;
const appName = `m04_completion_${id.task.slice(0, 8)}`;
const psqlArgs = ['exec', '-i', containerName, 'psql', '-X', '-q', '-A', '-t',
  '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];

function sql(command, timeout = 15000) {
  const result = spawnSync('docker', psqlArgs, {
    input: `${command}\n`, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Local SQL failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
  }
  return result.stdout.trim();
}

function clientContext(userId) {
  const claims = JSON.stringify({ role: 'authenticated', sub: userId, is_anonymous: false });
  return `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '${claims}';`;
}

function session() {
  const child = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  let closed = false;
  let ended = false;
  let code;
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { errors += data.toString(); });
  child.stdin.on('error', error => { errors += error.message; });
  child.on('close', exitCode => { closed = true; code = exitCode; });
  child.on('error', error => { errors += error.message; });
  return {
    send(command) { if (ended) throw new Error('Database session input is closed'); child.stdin.write(`${command}\n`); },
    end() { if (!ended) { ended = true; child.stdin.end(); } },
    async stop() {
      if (closed) return;
      if (!ended) {
        child.stdin.write('ROLLBACK;\n');
        ended = true;
        child.stdin.end();
      }
      const deadline = Date.now() + 3000;
      while (!closed && Date.now() < deadline) await delay(50);
      if (!closed) child.kill();
    },
    get output() { return output; },
    async until(marker, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      while (!output.includes(marker)) {
        if (closed) throw new Error(`Database session exited (${code}): ${errors.trim()}`);
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${marker}: ${errors.trim()}`);
        await delay(50);
      }
    },
    async finished(timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      while (!closed) {
        if (Date.now() >= deadline) throw new Error(`Database session did not finish: ${errors.trim()}`);
        await delay(50);
      }
      if (code !== 0) throw new Error(`Database session failed (${code}): ${errors.trim()}`);
    },
  };
}

async function main() {
  const docker = spawnSync('docker', ['ps', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8', timeout: 10000 });
  if (docker.error || docker.status !== 0 || docker.stdout.trim() !== containerName) {
    throw new Error(`Cannot access ${containerName}. Start the local Supabase stack (npx.cmd supabase start) and ensure Docker access. ${docker.stderr?.trim() ?? docker.error?.message ?? ''}`);
  }

  let first;
  let second;
  let setupAttempted = false;
  let passed = false;
  try {
    setupAttempted = true;
    sql(`BEGIN;
      INSERT INTO auth.users (id, email, is_anonymous) VALUES
        ('${id.first}', '${id.first}@example.invalid', false),
        ('${id.second}', '${id.second}@example.invalid', false);
      INSERT INTO public.households (id, slug, name) VALUES ('${id.household}', '${slug}', 'Concurrency fixture');
      INSERT INTO public.household_members (household_id, user_id) VALUES
        ('${id.household}', '${id.first}'), ('${id.household}', '${id.second}');
      INSERT INTO public.workspaces (id, household_id, slug, name, workspace_type, privacy)
        VALUES ('${id.workspace}', '${id.household}', 'shared-test', 'Concurrency fixture', 'location', 'shared');
      INSERT INTO public.workspace_members (workspace_id, household_id, user_id) VALUES
        ('${id.workspace}', '${id.household}', '${id.first}'),
        ('${id.workspace}', '${id.household}', '${id.second}');
      COMMIT;`);
    const inserted = sql(`BEGIN; ${clientContext(id.first)}
      INSERT INTO public.tasks (id, workspace_id, created_by, title)
        VALUES ('${id.task}', '${id.workspace}', auth.uid(), 'Concurrent completion test')
        RETURNING status; COMMIT;`);
    if (!inserted.split(/\s+/).includes('active')) throw new Error(`Fixture task was not created as active: ${inserted}`);

    first = session();
    first.send(`BEGIN; ${clientContext(id.first)}
      UPDATE public.tasks SET status = 'completed' WHERE id = '${id.task}' RETURNING status;
      SELECT 'FIRST_HOLDS_ROW_LOCK';`);
    await first.until('FIRST_HOLDS_ROW_LOCK');
    if (!first.output.split(/\s+/).includes('completed')) throw new Error('First authenticated update did not complete');

    second = session();
    second.send(`BEGIN; ${clientContext(id.second)} SET LOCAL application_name = '${appName}';
      UPDATE public.tasks SET status = 'completed' WHERE id = '${id.task}' RETURNING status;
      SELECT 'SECOND_UPDATED'; COMMIT;`);
    second.end();

    // Do not release the first row lock until the second backend is actually
    // waiting on a lock. This proves two distinct sessions overlapped.
    const deadline = Date.now() + 15000;
    let waiting = false;
    while (Date.now() < deadline) {
      if (sql(`SELECT count(*) FROM pg_stat_activity
        WHERE application_name = '${appName}' AND wait_event_type = 'Lock';`) === '1') {
        waiting = true;
        break;
      }
      await delay(150);
    }
    if (!waiting) throw new Error('Second authenticated session never waited on the first row lock');

    first.send('COMMIT;');
    first.end();
    await first.finished();
    await second.until('SECOND_UPDATED');
    await second.finished();
    if (!second.output.split(/\s+/).includes('completed')) throw new Error('Second authenticated update did not complete');

    const result = sql(`SELECT t.status, count(e.id),
        count(e.id) FILTER (WHERE e.actor_user_id = '${id.first}')
      FROM public.tasks t LEFT JOIN public.task_events e ON e.task_id = t.id AND e.event_type = 'completed'
      WHERE t.id = '${id.task}' GROUP BY t.status;`);
    if (result !== 'completed|1|1') throw new Error(`Expected completed|1|1; got ${result || '(no task)'}`);
    passed = true;
  } finally {
    await first?.stop();
    await second?.stop();
    if (setupAttempted) {
      // All identifiers are fresh random UUIDs. Never touch household app data.
      sql(`BEGIN;
        DELETE FROM public.task_events WHERE task_id = '${id.task}';
        DELETE FROM public.tasks WHERE id = '${id.task}';
        DELETE FROM public.workspace_members WHERE workspace_id = '${id.workspace}';
        DELETE FROM public.workspaces WHERE id = '${id.workspace}';
        DELETE FROM public.household_members WHERE household_id = '${id.household}';
        DELETE FROM public.households WHERE id = '${id.household}';
        DELETE FROM auth.users WHERE id IN ('${id.first}', '${id.second}');
        COMMIT;`);
      process.stdout.write('Cleaned up synthetic test data.\n');
    }
  }
  if (passed) process.stdout.write('PASS: two authenticated sessions overlapped; task completed; exactly one completion event from the first actor.\n');
}

main().catch(error => { process.stderr.write(`FAIL: ${error.message}\n`); process.exitCode = 1; });
