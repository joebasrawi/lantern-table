import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Run after build:railway. All identities and storage are disposable and local.
const folder = mkdtempSync(join(tmpdir(), 'lantern-multiplayer-'));
const port = process.env.TEST_PORT || '3017';
const origin = `http://localhost:${port}`;
const credentials = {},
  accounts = [];
for (const id of ['local_1', 'local_2', 'local_3']) {
  const email = `${id}@example.invalid`,
    password = randomBytes(24).toString('hex');
  const salt = randomBytes(16).toString('hex');
  credentials[id] = { email, password };
  accounts.push({
    id: randomUUID(),
    email,
    name: id,
    salt,
    passwordHash: scryptSync(password, salt, 64).toString('hex'),
  });
}
const accountFile = join(folder, 'credentials.json');
writeFileSync(accountFile, JSON.stringify(credentials), { mode: 0o600 });
let server;
try {
  // Never attach this test to an unrelated server already using the port.
  const occupied = await fetch(origin + '/api/health').then(
    () => true,
    () => false,
  );
  if (occupied) throw new Error('Test port is already in use');
  server = spawn(
    process.execPath,
    ['node_modules/vinext/dist/cli.js', 'start'],
    {
      env: {
        ...process.env,
        PORT: port,
        LANTERN_DATA_DIR: folder,
        LANTERN_ORIGIN: origin,
        LANTERN_ACCOUNTS: JSON.stringify(accounts),
        LANTERN_BACKGROUND_TURNS: 'false',
        OPENAI_API_KEY: 'test-placeholder-not-a-key',
        LANTERN_AI_DAILY_LIMIT: '0',
        LANTERN_PORTRAITS_ENABLED: 'true',
        LANTERN_SCENES_ENABLED: 'true',
        LANTERN_PORTRAIT_DAILY_LIMIT: '0',
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  const stopped = once(server, 'exit');
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error('Test server exited before readiness');
    ready = await fetch(origin + '/api/health').then(
      (r) => r.ok,
      () => false,
    );
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Test server did not become healthy');
  const fonts = spawn(process.execPath, ['tests/font-integration.mjs'], {
    env: { ...process.env, TEST_ORIGIN: origin },
    stdio: 'inherit',
  });
  const [fontCode] = await once(fonts, 'exit');
  if (fontCode !== 0) throw new Error('Font asset verification failed');
  const test = spawn(process.execPath, ['tests/integration.mjs'], {
    env: {
      ...process.env,
      TEST_ORIGIN: origin,
      TEST_ACCOUNTS_FILE: accountFile,
      TEST_AI_PAUSED: 'true',
      TEST_PORTRAIT_PAUSED: 'true',
    },
    stdio: 'inherit',
  });
  const [code] = await once(test, 'exit');
  if (code !== 0) throw new Error('Railway multiplayer integration failed');
  server.kill('SIGTERM');
  await stopped;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
  rmSync(folder, { recursive: true, force: true });
}
