import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync, createHash, createECDH, randomBytes } from 'node:crypto';
const dir = mkdtempSync(join(tmpdir(), 'lantern-push-session-'));
process.env.LANTERN_DATA_DIR = dir;
process.env.LANTERN_ORIGIN = 'https://game.example';
const salt = 'd'.repeat(32),
  password = 'test-push-session-password';
process.env.LANTERN_ACCOUNTS = JSON.stringify(
  ['one', 'two'].map((id) => ({
    id,
    name: id,
    email: id + '@example.invalid',
    salt,
    passwordHash: scryptSync(password, salt, 64).toString('hex'),
  })),
);
const { authGet, authPost, railwayUser } =
  await import('../.test-build/railway/auth.js');
const { sqlite } = await import('../.test-build/railway/storage.js');
const { saveSubscription, subscriptionActive } =
  await import('../.test-build/railway/push-subscriptions.js');
async function login(id, cookie = '') {
  const r = await authPost(
    new Request('https://game.example/api/auth', {
      method: 'POST',
      headers: { origin: 'https://game.example', cookie },
      body: new URLSearchParams({ email: id + '@example.invalid', password }),
    }),
  );
  assert.equal(r.status, 303);
  return r.headers.get('set-cookie').split(';')[0];
}
const token = (cookie) => cookie.split('=')[1];
function subscribe(cookie, name) {
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/' + name,
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  saveSubscription(
    sqlite(),
    'one',
    subscription,
    createHash('sha256').update(token(cookie)).digest('hex'),
  );
  return subscription.endpoint;
}
await test('real sign-out and replacing a browser login revoke its push subscription while other browsers survive', async () => {
  try {
    const first = await login('one'),
      second = await login('one');
    const firstEndpoint = subscribe(first, 'first'),
      secondEndpoint = subscribe(second, 'second');
    await authGet(
      new Request('https://game.example/api/auth?logout', {
        headers: { cookie: first },
      }),
    );
    assert.equal(subscriptionActive(sqlite(), 'one', firstEndpoint), false);
    assert.equal(subscriptionActive(sqlite(), 'one', secondEndpoint), true);
    const changed = await login('two', second);
    assert.equal(await railwayUser(token(second)), null);
    assert.equal(subscriptionActive(sqlite(), 'one', secondEndpoint), false);
    assert.equal((await railwayUser(token(changed))).id, 'two');
  } finally {
    sqlite().close();
    rmSync(dir, { recursive: true, force: true });
  }
});
