import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'lantern-push-api-'));
process.env.LANTERN_DATA_DIR = directory;
process.env.LANTERN_ORIGIN = 'https://game.example';
const { sqlite } = await import('../.test-build/railway/storage.js');
const { notifications } =
  await import('../.test-build/railway/notifications.js');
const {
  validateSubscription,
  saveSubscription: saveSubscriptionImpl,
  removeSubscription,
  subscriptionActive,
} = await import('../.test-build/railway/push-subscriptions.js');
const db = sqlite();
db.exec(
  "CREATE TABLE accounts(id TEXT PRIMARY KEY); INSERT INTO accounts VALUES('one'),('two');",
);
const subscription = (suffix = 'browser') => {
  const pair = createECDH('prime256v1');
  pair.generateKeys();
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/' + suffix,
    keys: {
      p256dh: pair.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
};
const tokens = { one: '1'.repeat(64), two: '2'.repeat(64) };
const hash = (value) => createHash('sha256').update(value).digest('hex');
db.exec(
  'CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,expires INTEGER)',
);
for (const id of ['one', 'two'])
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    hash(tokens[id]),
    id,
    Date.now() + 3600000,
  );
const saveSubscription = (db, id, input, now = Date.now()) =>
  saveSubscriptionImpl(db, id, input, hash(tokens[id]), now);
const request = (body, headers = {}) =>
  new Request('https://game.example/api/notifications', {
    method: 'POST',
    headers: {
      origin: 'https://game.example',
      cookie: 'lantern_session=' + tokens.one,
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
await test('subscription validation permits supported HTTPS push services and valid curve keys only', () => {
  const value = subscription();
  for (const hostname of [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
  ])
    assert.equal(
      validateSubscription({
        ...value,
        endpoint: 'https://' + hostname + '/opaque',
      }).endpoint,
      'https://' + hostname + '/opaque',
    );
  for (const endpoint of [
    'http://fcm.googleapis.com/token',
    'https://localhost/token',
    'https://127.0.0.1/token',
    'https://[::1]/token',
    'https://fcm.googleapis.com.attacker.example/token',
    'https://attacker.example/token',
    'https://fcm.googleapis.com:8443/token',
    'https://user:pass@fcm.googleapis.com/token',
    'https://fcm.googleapis.com/token#fragment',
    'https://fcm.googleapis.com/',
    'https://push.apple.com.attacker.example/token',
    'not a url',
  ])
    assert.throws(
      () => validateSubscription({ ...value, endpoint }),
      undefined,
      endpoint,
    );
  for (const keys of [
    {},
    { ...value.keys, auth: 'A'.repeat(23) },
    { ...value.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') },
    { ...value.keys, p256dh: value.keys.p256dh + '=' },
  ])
    assert.throws(() => validateSubscription({ ...value, keys }));
  assert.deepEqual(
    validateSubscription({ ...value, extra: 'ignored', expirationTime: null }),
    value,
  );
});
await test('registration is idempotent, bounded to eight browsers, and cannot transfer ownership', () => {
  const value = subscription();
  saveSubscription(db, 'one', value, 0);
  saveSubscription(db, 'one', value, 1);
  assert.equal(subscriptionActive(db, 'one', value.endpoint), true);
  assert.equal(subscriptionActive(db, 'two', value.endpoint), false);
  assert.throws(() => saveSubscription(db, 'two', value), { status: 409 });
  removeSubscription(db, 'two', value.endpoint);
  assert.equal(subscriptionActive(db, 'one', value.endpoint), true);
  assert.throws(
    () => saveSubscription(db, 'one', { ...value, keys: subscription().keys }),
    { status: 409 },
  );
  for (let i = 1; i < 8; i++)
    saveSubscription(db, 'one', subscription('limit-' + i));
  assert.throws(() => saveSubscription(db, 'one', subscription('ninth')), {
    status: 409,
  });
  saveSubscription(db, 'one', value);
  removeSubscription(db, 'one', value.endpoint);
  saveSubscription(db, 'one', subscription('replacement'));
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get().count,
    8,
  );
  db.exec('DELETE FROM push_subscriptions');
});
await test('subscription endpoints require authentication, same origin, JSON and bounded bodies', async () => {
  assert.equal(
    (
      await notifications(
        new Request('https://game.example/api/notifications'),
        null,
      )
    ).status,
    401,
  );
  for (const origin of ['', 'https://attacker.example'])
    assert.equal(
      (
        await notifications(
          request(
            { op: 'status', endpoint: subscription().endpoint },
            { origin },
          ),
          'one',
        )
      ).status,
      403,
    );
  assert.equal(
    (
      await notifications(
        request('{}', { 'content-type': 'text/plain' }),
        'one',
      )
    ).status,
    415,
  );
  assert.equal(
    (await notifications(request('x'.repeat(4097)), 'one')).status,
    413,
  );
  assert.equal(
    (await notifications(request('{}', { 'content-length': '4097' }), 'one'))
      .status,
    413,
  );
  for (const value of ['{broken', 'null', '[]'])
    assert.equal((await notifications(request(value), 'one')).status, 400);
  assert.equal(
    (await notifications(request({ op: 'unknown' }), 'one')).status,
    400,
  );
  const state = await notifications(
    new Request('https://game.example/api/notifications'),
    'one',
  );
  assert.equal(state.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await state.json(), { enabled: false, publicKey: null });
  assert.equal(
    (
      await notifications(
        request({
          op: 'subscribe',
          userId: 'one',
          subscription: subscription(),
        }),
        'one',
      )
    ).status,
    503,
  );
});
await test('enabled API registers, reports only ownership and revokes while disabled without returning secrets', async () => {
  process.env.LANTERN_PUSH_ENABLED = 'true';
  const vapid = createECDH('prime256v1');
  vapid.generateKeys();
  process.env.LANTERN_VAPID_PUBLIC_KEY = vapid
    .getPublicKey()
    .toString('base64url');
  process.env.LANTERN_VAPID_PRIVATE_KEY = vapid
    .getPrivateKey()
    .toString('base64url');
  const value = subscription('api');
  const result = await notifications(
    request({ op: 'subscribe', userId: 'one', subscription: value }),
    'one',
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { active: true });
  const config = await notifications(
    new Request('https://game.example/api/notifications'),
    'one',
  );
  assert.deepEqual(await config.json(), {
    enabled: true,
    publicKey: process.env.LANTERN_VAPID_PUBLIC_KEY,
  });
  const other = await notifications(
    request({ op: 'status', endpoint: value.endpoint }),
    'two',
  );
  assert.deepEqual(await other.json(), { active: false });
  const denied = await notifications(
    request(
      { op: 'subscribe', userId: 'two', subscription: value },
      { cookie: 'lantern_session=' + tokens.two },
    ),
    'two',
  );
  assert.equal(denied.status, 409);
  assert.doesNotMatch(await denied.text(), /one|SECRET|p256dh|fcm/);
  delete process.env.LANTERN_PUSH_ENABLED;
  assert.equal(
    (
      await notifications(
        request({ op: 'remove', endpoint: value.endpoint }),
        'one',
      )
    ).status,
    200,
  );
  assert.equal(subscriptionActive(db, 'one', value.endpoint), false);
});
await test('deleted identities cannot re-register through an already authenticated request', () => {
  db.prepare('DELETE FROM accounts WHERE id=?').run('two');
  assert.throws(() => saveSubscription(db, 'two', subscription('deleted')), {
    status: 401,
  });
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get().count,
    0,
  );
});
await test('session ownership is checked at registration and re-registration follows the latest valid login', () => {
  const value = subscription('session');
  assert.throws(() => saveSubscriptionImpl(db, 'one', value, 'missing'), {
    status: 401,
  });
  const fresh = 'fresh-session-hash';
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    fresh,
    'one',
    Date.now() + 3600000,
  );
  saveSubscription(db, 'one', value);
  saveSubscriptionImpl(db, 'one', value, fresh);
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(tokens.one));
  assert.equal(subscriptionActive(db, 'one', value.endpoint), true);
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(fresh);
  assert.equal(subscriptionActive(db, 'one', value.endpoint), false);
});
db.close();
rmSync(directory, { recursive: true, force: true });
