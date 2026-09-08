import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
const folder = mkdtempSync(join(tmpdir(), 'lantern-sessions-'));
process.env.LANTERN_DATA_DIR = folder;
process.env.LANTERN_ORIGIN = 'https://game.example';
const salt = 'd'.repeat(32);
process.env.LANTERN_ACCOUNTS = JSON.stringify(
  ['one', 'two'].map((id) => ({
    id,
    name: id,
    email: `${id}@example.invalid`,
    salt,
    passwordHash: scryptSync('test-session-password', salt, 64).toString('hex'),
  })),
);
const { authGet, authPost, railwayUser } =
  await import('../.test-build/railway/auth.js');
const { sqlite } = await import('../.test-build/railway/storage.js');
const request = (query, body, cookie = '', origin = 'https://game.example') =>
  new Request(`https://game.example/api/auth${query}`, {
    method: 'POST',
    headers: { origin, cookie },
    body: new URLSearchParams(body),
  });
const login = async (id) => {
  const response = await authPost(
    request('', {
      email: `${id}@example.invalid`,
      password: 'test-session-password',
    }),
  );
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').split(';')[0];
};
await test('account page and password-confirmed revocation preserve this session, other accounts and campaign data', async () => {
  try {
    const first = await login('one'),
      second = await login('one'),
      other = await login('two');
    const token = (cookie) => cookie.split('=')[1];
    const page = () =>
      authGet(
        new Request('https://game.example/api/auth?account', {
          headers: { cookie: first },
        }),
      );
    assert.equal(
      (await authGet(new Request('https://game.example/api/auth?account')))
        .status,
      303,
    );
    const response = await page(),
      html = await response.text();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(html, /1 other signed-in session/);
    for (const cookie of [first, second, other])
      assert.ok(!html.includes(token(cookie)));
    const db = sqlite();
    db.prepare(
      'INSERT INTO campaigns(id,host_id,invite,state,updated_at) VALUES(?,?,?,?,?)',
    ).run('campaign', 'one', 'invite', '{"saved":true}', 'now');
    const accountBefore = db
      .prepare('SELECT * FROM accounts ORDER BY id')
      .all();
    const campaignBefore = db.prepare('SELECT * FROM campaigns').all();
    const revoke = (password, cookie = first, origin) =>
      authPost(
        request(
          '?sessions',
          { password, email: 'two@example.invalid' },
          cookie,
          origin,
        ),
      );
    assert.equal((await revoke('test-session-password', '')).status, 401);
    assert.equal(
      (await revoke('test-session-password', first, 'https://foreign.example'))
        .status,
      403,
    );
    assert.equal((await revoke('wrong')).status, 401);
    assert.ok(await railwayUser(token(second)));
    const success = await revoke('test-session-password');
    assert.equal(success.status, 303);
    assert.equal(success.headers.get('location'), '/api/auth?account');
    assert.equal(await railwayUser(token(second)), null);
    assert.ok(await railwayUser(token(first)));
    assert.ok(await railwayUser(token(other)));
    assert.deepEqual(
      db.prepare('SELECT * FROM accounts ORDER BY id').all(),
      accountBefore,
    );
    assert.deepEqual(
      db.prepare('SELECT * FROM campaigns').all(),
      campaignBefore,
    );
    assert.match(
      await (await page()).text(),
      /No other sessions are signed in/,
    );
    assert.equal((await revoke('test-session-password')).status, 303);
    assert.equal((await revoke('test-session-password', second)).status, 401);
  } finally {
    sqlite().close();
    rmSync(folder, { recursive: true, force: true });
  }
});
