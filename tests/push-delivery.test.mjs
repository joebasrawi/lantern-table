import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createECDH, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import webpush from 'web-push';
import { initialState, makeCharacter } from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
import { notificationTables } from '../.test-build/railway/notification-queue.js';
import {
  deliverNotifications,
  sendPush,
} from '../.test-build/railway/push-delivery.js';
import { pushConfig } from '../.test-build/railway/push-config.js';
const require = createRequire(import.meta.url);
const ece = createRequire(require.resolve('web-push'))('http_ece');
function config() {
  const keys = webpush.generateVAPIDKeys();
  process.env.LANTERN_PUSH_ENABLED = 'true';
  process.env.LANTERN_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.LANTERN_VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.LANTERN_VAPID_SUBJECT = 'https://game.example';
  delete process.env.LANTERN_PUSH_PAUSED;
  return { ...keys, subject: 'https://game.example' };
}
function fixture(t, count = 1) {
  config();
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
    CREATE TABLE campaigns(id TEXT PRIMARY KEY,host_id TEXT,state TEXT);
    CREATE TABLE members(campaign_id TEXT,user_id TEXT,PRIMARY KEY(campaign_id,user_id));
    INSERT INTO accounts VALUES('player');INSERT INTO sessions VALUES('session','player',9999999999999);`);
  notificationTables(db);
  const recipient = createECDH('prime256v1');
  recipient.generateKeys();
  const auth = randomBytes(16).toString('base64url');
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth },
  };
  db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?)').run(
    'browser',
    'player',
    JSON.stringify(subscription),
    0,
    'session',
  );
  for (let i = 0; i < count; i++) {
    const state = initialState(
      'SECRET TITLE',
      'SECRET WORLD',
      'SECRET PREMISE',
      'SECRET LOCATION',
      DEFAULT_SETTINGS,
    );
    state.characters = [makeCharacter(PRESETS[0], 'player', state)];
    state.decision = {
      id: 'decision',
      question: 'SECRET QUESTION',
      options: ['SECRET'],
      votes: {},
      deadline: null,
    };
    db.prepare('INSERT INTO campaigns VALUES(?,?,?)').run(
      'campaign-' + i,
      'host',
      JSON.stringify(state),
    );
    db.prepare('INSERT INTO members VALUES(?,?)').run(
      'campaign-' + i,
      'player',
    );
  }
  return { db, subscription, recipient, auth };
}
const success = async () => ({ statusCode: 201, headers: {}, body: '' });
await test('configuration requires a matching VAPID pair and safe contact; disabled or invalid setup cannot send', async (t) => {
  const { db } = fixture(t);
  assert.ok(pushConfig());
  process.env.LANTERN_VAPID_PUBLIC_KEY = webpush.generateVAPIDKeys().publicKey;
  assert.equal(pushConfig(), null);
  assert.deepEqual(
    await deliverNotifications(
      db,
      () => assert.fail('must not send'),
      () => 0,
    ),
    { sent: 0, retry: 0, removed: 0, failed: 0 },
  );
  config();
  process.env.LANTERN_VAPID_SUBJECT = 'http://localhost';
  assert.equal(pushConfig(), null);
  config();
  process.env.LANTERN_PUSH_PAUSED = 'true';
  await deliverNotifications(
    db,
    () => assert.fail('paused must not send'),
    () => 0,
  );
});
await test('real Web Push encryption round-trips through the recipient key and transport cannot follow redirects', async (t) => {
  const { subscription, recipient, auth } = fixture(t);
  let called = 0;
  const result = await sendPush(
    subscription,
    JSON.stringify({ campaignId: 'campaign-0' }),
    { vapidDetails: pushConfig(), contentEncoding: 'aes128gcm', TTL: 600 },
    async (url, options) => {
      called++;
      assert.equal(url, subscription.endpoint);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
      assert.match(options.headers.Authorization, /^vapid /);
      assert.ok(!Buffer.from(options.body).includes(Buffer.from('campaign-0')));
      const plain = ece.decrypt(Buffer.from(options.body), {
        version: 'aes128gcm',
        privateKey: recipient,
        authSecret: auth,
      });
      assert.deepEqual(JSON.parse(plain.toString()), {
        campaignId: 'campaign-0',
      });
      return new Response('', { status: 201 });
    },
  );
  assert.equal(called, 1);
  assert.equal(result.statusCode, 201);
  await assert.rejects(
    () =>
      sendPush(
        subscription,
        '{}',
        { vapidDetails: pushConfig() },
        async () =>
          new Response('', { status: 429, headers: { 'Retry-After': '3600' } }),
      ),
    (error) =>
      error.statusCode === 429 && error.headers['retry-after'] === '3600',
  );
});
await test('sender deduplicates completed delivery and sends only a campaign ID with bounded provider options', async (t) => {
  const { db } = fixture(t);
  let calls = 0;
  const sender = async (sub, payload, options) => {
    calls++;
    assert.deepEqual(JSON.parse(payload), { campaignId: 'campaign-0' });
    assert.doesNotMatch(payload, /SECRET|player|host/);
    assert.equal(options.TTL, 600);
    assert.equal(options.timeout, 8000);
    assert.equal(options.topic.length, 32);
    return success();
  };
  assert.equal((await deliverNotifications(db, sender, () => 0)).sent, 1);
  assert.equal((await deliverNotifications(db, sender, () => 1)).sent, 0);
  assert.equal(calls, 1);
});
await test('expired subscriptions are removed; rate limits and transient failures back off; permanent failures stop', async (t) => {
  for (const status of [404, 410, 429, 500, 403]) {
    const { db } = fixture(t);
    const result = await deliverNotifications(
      db,
      async () => {
        throw { statusCode: status, headers: { 'retry-after': '3600' } };
      },
      () => 0,
    );
    if (status === 404 || status === 410) {
      assert.equal(result.removed, 1);
      assert.equal(
        db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,
        0,
      );
    } else {
      const row = db.prepare('SELECT * FROM push_notifications').get();
      assert.equal(row.status, status === 403 ? 'failed' : 'pending');
      if (status !== 403) {
        assert.equal(row.next_attempt, 3600000);
        assert.equal(result.retry, 1);
      }
    }
  }
});
await test('membership changes, expired sessions and damaged destinations cannot reach the sender', async (t) => {
  for (const change of ['leave', 'expire', 'endpoint']) {
    const { db } = fixture(t);
    if (change === 'leave') db.exec('DELETE FROM members');
    if (change === 'expire') db.exec('UPDATE sessions SET expires=0');
    if (change === 'endpoint')
      db.exec(
        `UPDATE push_subscriptions SET subscription='{"endpoint":"http://localhost/private"}'`,
      );
    await deliverNotifications(
      db,
      () => assert.fail('revoked or invalid subscription sent'),
      () => 1,
    );
  }
});
await test('overlapping ticks, per-tick limits and late failures cannot duplicate claims or remove a replacement subscription', async (t) => {
  const { db } = fixture(t, 12);
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const sending = deliverNotifications(
    db,
    async () => {
      await wait;
      return success();
    },
    () => 0,
  );
  assert.deepEqual(
    await deliverNotifications(
      db,
      () => assert.fail('overlap'),
      () => 0,
    ),
    { sent: 0, retry: 0, removed: 0, failed: 0 },
  );
  release();
  assert.equal((await sending).sent, 10);
  assert.equal((await deliverNotifications(db, success, () => 1)).sent, 2);
  const replacement = fixture(t);
  await deliverNotifications(
    replacement.db,
    async () => {
      replacement.db.exec(
        "DELETE FROM push_subscriptions; INSERT INTO push_subscriptions VALUES('browser','player','{}',1,'session');",
      );
      throw { statusCode: 410 };
    },
    () => 0,
  );
  assert.equal(
    replacement.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()
      .n,
    1,
  );
});
