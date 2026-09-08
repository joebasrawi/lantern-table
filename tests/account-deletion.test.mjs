import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, scryptSync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { initialState, makeCharacter } from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const folder = mkdtempSync(join(tmpdir(), 'lantern-delete-'));
process.env.LANTERN_DATA_DIR = folder;
process.env.LANTERN_ORIGIN = 'https://game.example';
const password = 'account-delete-test-password',
  salt = 'e'.repeat(32),
  passwordHash = scryptSync(password, salt, 64).toString('hex');
process.env.LANTERN_ACCOUNTS = JSON.stringify(
  ['victim', 'friend'].map((id) => ({
    id,
    email: id + '@example.invalid',
    name: id,
    salt,
    passwordHash,
  })),
);
const { authGet, authPost, railwayUser } =
  await import('../.test-build/railway/auth.js');
const { sqlite, bucket } = await import('../.test-build/railway/storage.js');
const {
  deleteAccount: deleteAccountImpl,
  cleanupDeletedImages,
  deletionMemberships,
  deletionFingerprint,
} = await import('../.test-build/railway/account-deletion.js');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const req = (query, body, cookie = '', origin = 'https://game.example') =>
  new Request('https://game.example/api/auth' + query, {
    method: 'POST',
    headers: { origin, cookie },
    body: new URLSearchParams(body),
  });
const login = async (id) => {
  const r = await authPost(
    req('', { email: id + '@example.invalid', password }),
  );
  assert.equal(r.status, 303);
  return r.headers.get('set-cookie').split(';')[0];
};
const friendCookie = await login('friend');
const db = sqlite();
const deleteAccount = (db, id, passwordHash, tokenHash) =>
  deleteAccountImpl(
    db,
    id,
    passwordHash,
    tokenHash,
    deletionFingerprint(deletionMemberships(db, id)),
  );
const state = () =>
  initialState('Test', 'Future', 'Shared story', 'Station', {
    ...DEFAULT_SETTINGS,
    dm: 'human',
  });
const campaign = (id, host, s, members = [host]) => {
  db.prepare(
    'INSERT INTO campaigns(id,host_id,invite,state,updated_at) VALUES(?,?,?,?,?)',
  ).run(id, host, id + '-invite', JSON.stringify(s), 'now');
  for (const user of members)
    db.prepare('INSERT INTO members VALUES(?,?,?)').run(id, user, user);
};
const account = (id) => {
  db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(
    id,
    id + '@example.invalid',
    id,
    salt,
    passwordHash,
  );
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    hash(token),
    id,
    Date.now() + 60000,
  );
  return token;
};

await test('account deletion requires confirmation/password, removes private state and solo campaigns, preserves shared contributions and survives restart', async () => {
  const first = await login('victim'),
    second = await login('victim');
  const solo = state();
  solo.characters.push(makeCharacter(PRESETS[0], 'victim', solo));
  solo.sceneAsset = 'solo-art';
  campaign('solo', 'victim', solo);
  const shared = state();
  const retired = makeCharacter(PRESETS[0], 'victim', shared);
  retired.notes = 'PRIVATE NOTE';
  retired.portraitAsset = 'private-art';
  shared.retiredCharacters = [retired];
  shared.seen.victim = 'read';
  shared.sceneAsset = 'shared-art';
  campaign('shared', 'friend', shared);
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  for (const key of [
    'scenes/solo/solo-art',
    'portraits/shared/private-art',
    'portraits/shared/replaced-art',
    'scenes/shared/shared-art',
  ])
    await bucket.put(key, bytes, { customMetadata: { userId: 'victim' } });
  db.exec(
    'CREATE TABLE IF NOT EXISTS password_resets(user_id TEXT PRIMARY KEY REFERENCES accounts(id),token_hash TEXT,password_hash TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS registrations(email TEXT PRIMARY KEY,token_hash TEXT,expires INTEGER);',
  );
  db.prepare('INSERT INTO password_resets VALUES(?,?,?,?)').run(
    'victim',
    'reset-token',
    passwordHash,
    Date.now() + 60000,
  );
  db.prepare('INSERT INTO registrations VALUES(?,?,?)').run(
    'victim@example.invalid',
    'registration-token',
    Date.now() + 60000,
  );
  const run = (p = password, confirm = 'DELETE', cookie = first, origin) =>
    authPost(
      req(
        '?delete',
        {
          password: p,
          confirm,
          campaigns: deletionFingerprint([{ id: 'solo' }]),
        },
        cookie,
        origin,
      ),
    );
  assert.equal(
    (await run(password, 'DELETE', '', 'https://game.example')).status,
    401,
  );
  assert.equal(
    (await run(password, 'DELETE', first, 'https://foreign.example')).status,
    403,
  );
  assert.equal((await run(password, 'no')).status, 400);
  assert.equal((await run('wrong')).status, 401);
  assert.ok(await railwayUser(second.split('=')[1]));
  const page = await authGet(
    new Request('https://game.example/api/auth?delete', {
      headers: { cookie: first },
    }),
  );
  assert.match(await page.text(), /campaign where you are the only member/);
  const stale = await authPost(
    req('?delete', { password, confirm: 'DELETE', campaigns: 'stale' }, first),
  );
  assert.equal(stale.status, 409);
  assert.ok(db.prepare('SELECT id FROM accounts WHERE id=?').get('victim'));
  const response = await run();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/api/auth?deleted');
  const completed = await (
    await authGet(new Request('https://game.example/api/auth?deleted'))
  ).text();
  assert.match(completed, /<h1>Account deleted<\/h1>/);
  assert.ok(!completed.includes('<form'));
  assert.equal(
    db.prepare('SELECT * FROM accounts WHERE id=?').get('victim'),
    undefined,
  );
  assert.equal(
    db.prepare('SELECT * FROM password_resets WHERE user_id=?').get('victim'),
    undefined,
  );
  assert.equal(
    db
      .prepare('SELECT * FROM registrations WHERE email=?')
      .get('victim@example.invalid'),
    undefined,
  );
  assert.equal(await railwayUser(first.split('=')[1]), null);
  assert.equal(await railwayUser(second.split('=')[1]), null);
  assert.ok(await railwayUser(friendCookie.split('=')[1]));
  assert.equal(
    db.prepare('SELECT * FROM campaigns WHERE id=?').get('solo'),
    undefined,
  );
  const saved = JSON.parse(
    db.prepare('SELECT state FROM campaigns WHERE id=?').get('shared').state,
  );
  assert.deepEqual(saved.retiredCharacters, []);
  assert.equal(saved.seen.victim, undefined);
  assert.deepEqual(saved.events, shared.events);
  for (const key of [
    'scenes/solo/solo-art',
    'portraits/shared/private-art',
    'portraits/shared/replaced-art',
  ])
    assert.equal(await bucket.get(key), null);
  assert.ok(await bucket.get('scenes/shared/shared-art'));
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO members VALUES(?,?,?)')
        .run('shared', 'victim', 'old request'),
    /Account deleted/,
  );
  assert.throws(() => campaign('late', 'victim', state()), /Account deleted/);
  await assert.rejects(
    bucket.put('portraits/shared/late-art', bytes, {
      customMetadata: { userId: 'victim' },
    }),
    /Account deleted/,
  );
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';import {authPost} from './.test-build/railway/auth.js';const r=await authPost(new Request('https://game.example/api/auth',{method:'POST',headers:{origin:'https://game.example'},body:new URLSearchParams({email:'victim@example.invalid',password:${JSON.stringify(password)}})}));assert.equal(r.status,401);`,
    ],
    { env: process.env, stdio: 'pipe' },
  );
});
await test('shared membership, changed sessions and active leases block deletion with full rollback', () => {
  const token = account('blocked'),
    s = state();
  campaign('shared-block', 'friend', s, ['friend', 'blocked']);
  const before = db.prepare('SELECT * FROM accounts WHERE id=?').get('blocked');
  assert.throws(
    () => deleteAccount(db, 'blocked', passwordHash, hash(token)),
    /Leave shared/,
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM accounts WHERE id=?').get('blocked'),
    before,
  );
  db.prepare('DELETE FROM members WHERE user_id=?').run('blocked');
  s.retiredCharacters = [makeCharacter(PRESETS[0], 'blocked', s)];
  db.prepare('UPDATE campaigns SET state=? WHERE id=?').run(
    JSON.stringify(s),
    'shared-block',
  );
  campaign('locked-solo', 'blocked', state());
  db.prepare('UPDATE campaigns SET lock=?,lock_until=? WHERE id=?').run(
    'lease',
    Date.now() + 60000,
    'locked-solo',
  );
  const stateBefore = db.prepare('SELECT * FROM campaigns ORDER BY id').all();
  assert.throws(
    () => deleteAccount(db, 'blocked', passwordHash, hash(token)),
    /still running/,
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM campaigns ORDER BY id').all(),
    stateBefore,
  );
  assert.ok(
    db.prepare('SELECT * FROM campaigns WHERE id=?').get('locked-solo'),
  );
  db.prepare('UPDATE campaigns SET lock=NULL WHERE id=?').run('locked-solo');
  assert.throws(
    () => deleteAccount(db, 'blocked', 'changed-password', hash(token)),
    /session changed/,
  );
  assert.ok(db.prepare('SELECT * FROM accounts WHERE id=?').get('blocked'));
});
await test('failed image cleanup stays queued and retries without recreating account data', async () => {
  const token = account('cleanup');
  const key = 'portraits/orphan/cleanup-art';
  await bucket.put(key, new Uint8Array([1]).buffer, {
    customMetadata: { userId: 'cleanup' },
  });
  deleteAccount(db, 'cleanup', passwordHash, hash(token));
  const broken = join(folder, 'images', 'portraits_orphan_broken.json');
  mkdirSync(broken);
  await assert.rejects(cleanupDeletedImages(db));
  assert.equal(
    db
      .prepare('SELECT cleanup_pending FROM deleted_accounts WHERE id=?')
      .get('cleanup').cleanup_pending,
    1,
  );
  rmSync(broken, { recursive: true });
  await cleanupDeletedImages(db);
  assert.equal(
    db
      .prepare('SELECT cleanup_pending FROM deleted_accounts WHERE id=?')
      .get('cleanup').cleanup_pending,
    0,
  );
  assert.equal(await bucket.get(key), null);
  assert.equal(
    db.prepare('SELECT * FROM accounts WHERE id=?').get('cleanup'),
    undefined,
  );
});

await test('an upload started before deletion cannot recreate a private file afterward', async () => {
  const token = account('inflight');
  const key = 'portraits/shared/inflight';
  const pending = bucket.put(key, new Uint8Array(512).buffer, {
    customMetadata: { userId: 'inflight' },
  });
  deleteAccount(db, 'inflight', passwordHash, hash(token));
  await assert.rejects(pending, /Account deleted/);
  assert.equal(await bucket.get(key), null);
  await cleanupDeletedImages(db);
});

db.close();
rmSync(folder, { recursive: true, force: true });
