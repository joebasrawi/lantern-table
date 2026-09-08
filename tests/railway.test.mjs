import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
const directory = mkdtempSync(join(tmpdir(), 'lantern-railway-'));
process.env.LANTERN_DATA_DIR = directory;
process.env.LANTERN_ORIGIN = 'https://game.example';
const salt = 'a'.repeat(32);
process.env.LANTERN_ACCOUNTS = JSON.stringify([
  {
    id: 'tester',
    email: 'test@example.com',
    name: 'Tester',
    salt,
    passwordHash: scryptSync('correct-test-password', salt, 64).toString('hex'),
  },
]);
const { db, bucket, sqlite } =
  await import('../.test-build/railway/storage.js');
const { authPost, authGet, railwayUser } =
  await import('../.test-build/railway/auth.js');
await test('Railway storage batches rollback, conditional writes preserve versions, and images persist privately', async () => {
  await db.batch([
    db
      .prepare(
        'INSERT INTO campaigns(id,host_id,invite,state,updated_at) VALUES(?,?,?,?,?)',
      )
      .bind('c', 'tester', 'invite', '{}', 'now'),
    db
      .prepare('INSERT INTO members VALUES(?,?,?)')
      .bind('c', 'tester', 'Tester'),
  ]);
  await assert.rejects(
    db.batch([
      db
        .prepare('UPDATE campaigns SET state=? WHERE id=?')
        .bind('changed', 'c'),
      db
        .prepare('INSERT INTO members VALUES(?,?,?)')
        .bind('c', 'tester', 'Duplicate'),
    ]),
  );
  assert.equal(
    (
      await db
        .prepare('SELECT state FROM campaigns WHERE id=?')
        .bind('c')
        .first()
    ).state,
    '{}',
  );
  assert.equal(
    (
      await db
        .prepare(
          'UPDATE campaigns SET version=version+1 WHERE id=? AND version=?',
        )
        .bind('c', 0)
        .run()
    ).meta.changes,
    1,
  );
  assert.equal(
    (
      await db
        .prepare(
          'UPDATE campaigns SET version=version+1 WHERE id=? AND version=?',
        )
        .bind('c', 0)
        .run()
    ).meta.changes,
    0,
  );
  await bucket.put('portraits/c/image', new Uint8Array([1, 2, 3]).buffer, {
    httpMetadata: { contentType: 'image/png' },
  });
  assert.deepEqual(
    [...(await bucket.get('portraits/c/image')).body],
    [1, 2, 3],
  );
  await assert.rejects(bucket.get('../../outside'));
  await bucket.delete('portraits/c/image');
  assert.equal(await bucket.get('portraits/c/image'), null);
});
await test('Railway authentication validates sessions, password changes, session revocation and restart persistence', async () => {
  const request = (password, origin = 'https://game.example') =>
    new Request('https://game.example/api/auth', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'test@example.com', password }),
    });
  assert.equal(
    (await authPost(request('correct-test-password', 'https://evil.example')))
      .status,
    403,
  );
  assert.equal((await authPost(request('wrong'))).status, 401);
  assert.equal(await railwayUser('forged'), null);
  const response = await authPost(request('correct-test-password'));
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const token = cookie.split(';')[0].split('=')[1];
  assert.deepEqual(await railwayUser(token), { id: 'tester', name: 'Tester' });
  assert.equal(
    sqlite()
      .prepare('SELECT token_hash FROM sessions')
      .get()
      .token_hash.includes(token),
    false,
  );
  sqlite().prepare('UPDATE sessions SET expires=0').run();
  assert.equal(await railwayUser(token), null);
  sqlite()
    .prepare('UPDATE sessions SET expires=?')
    .run(Date.now() + 60000);
  await authGet(
    new Request('https://game.example/api/auth?logout', {
      headers: { cookie },
    }),
  );
  assert.equal(await railwayUser(token), null);
  for (let i = 0; i < 5; i++)
    assert.equal((await authPost(request('wrong'))).status, 401);
  assert.equal((await authPost(request('correct-test-password'))).status, 429);
  sqlite().prepare('DELETE FROM login_attempts').run();
  const firstLogin = await authPost(request('correct-test-password'));
  const secondLogin = await authPost(request('correct-test-password'));
  const firstCookie = firstLogin.headers.get('set-cookie').split(';')[0];
  const secondToken = secondLogin.headers
    .get('set-cookie')
    .split(';')[0]
    .split('=')[1];
  const change = (
    current,
    next = 'new-test-password-123',
    confirm = next,
    cookie = firstCookie,
    origin = 'https://game.example',
  ) =>
    new Request('https://game.example/api/auth?password', {
      method: 'POST',
      headers: { origin, cookie },
      body: new URLSearchParams({
        password: current,
        newPassword: next,
        confirmPassword: confirm,
      }),
    });
  assert.equal(
    (await authGet(new Request('https://game.example/api/auth?password')))
      .status,
    303,
  );
  assert.equal(
    (await authPost(change('correct-test-password', undefined, undefined, '')))
      .status,
    401,
  );
  assert.equal(
    (
      await authPost(
        change(
          'correct-test-password',
          undefined,
          undefined,
          firstCookie,
          'https://evil.example',
        ),
      )
    ).status,
    403,
  );
  assert.equal((await authPost(change('wrong'))).status, 401);
  assert.equal(
    (await authPost(change('correct-test-password', 'short'))).status,
    400,
  );
  assert.equal(
    (
      await authPost(
        change('correct-test-password', 'new-test-password-123', 'mismatch'),
      )
    ).status,
    400,
  );
  const oldHash = sqlite()
    .prepare('SELECT password_hash FROM accounts WHERE id=?')
    .get('tester').password_hash;
  assert.equal((await authPost(change('correct-test-password'))).status, 303);
  assert.notEqual(
    sqlite()
      .prepare('SELECT password_hash FROM accounts WHERE id=?')
      .get('tester').password_hash,
    oldHash,
  );
  assert.equal(await railwayUser(firstCookie.split('=')[1]), null);
  assert.equal(await railwayUser(secondToken), null);
  assert.equal((await authPost(request('correct-test-password'))).status, 401);
  assert.equal((await authPost(request('new-test-password-123'))).status, 303);
  // A fresh process re-applies the original provisioning environment; it must not reset the new password.
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    const {authPost}=await import('./.test-build/railway/auth.js');
    const req=(password)=>new Request('https://game.example/api/auth',{method:'POST',headers:{origin:'https://game.example'},body:new URLSearchParams({email:'test@example.com',password})});
    assert.equal((await authPost(req('correct-test-password'))).status,401);
    assert.equal((await authPost(req('new-test-password-123'))).status,303);
  `,
    ],
    { env: process.env, stdio: 'pipe' },
  );
  sqlite().close();
  rmSync(directory, { recursive: true, force: true });
});
