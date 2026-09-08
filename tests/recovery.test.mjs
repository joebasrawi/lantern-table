import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
const folder = mkdtempSync(join(tmpdir(), 'lantern-recovery-'));
process.env.LANTERN_DATA_DIR = folder;
process.env.LANTERN_ORIGIN = 'https://game.example';
process.env.LANTERN_ACCOUNTS = JSON.stringify([
  {
    id: 'recover',
    email: 'player@example.invalid',
    name: 'Player',
    salt: 'b'.repeat(32),
    passwordHash: scryptSync('original-password', 'b'.repeat(32), 64).toString(
      'hex',
    ),
  },
]);
const { authPost, authGet, railwayUser } =
  await import('../.test-build/railway/auth.js');
const { sqlite } = await import('../.test-build/railway/storage.js');
const request = (query, body, origin = 'https://game.example') =>
  new Request('https://game.example/api/auth' + query, {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams(body),
  });
const originalFetch = globalThis.fetch;
const sent = [];
let mailFails = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails');
  sent.push(JSON.parse(options.body));
  return new Response('{}', { status: mailFails ? 500 : 200 });
};
await test('Password recovery protects tokens, expires links, revokes sessions and consumes concurrent resets once', async () => {
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.LANTERN_MAIL_FROM;
    assert.equal(
      (await authGet(new Request('https://game.example/api/auth?forgot')))
        .status,
      503,
    );
    process.env.RESEND_API_KEY = 'test-mail-key';
    process.env.LANTERN_MAIL_FROM = 'Lantern <game@example.invalid>';
    const login = await authPost(
      request('', {
        email: 'player@example.invalid',
        password: 'original-password',
      }),
    );
    assert.equal(login.status, 303);
    const session = login.headers.get('set-cookie').split(';')[0].split('=')[1];
    const send = async () => {
      const r = await authPost(
        request('?forgot', { email: 'player@example.invalid' }),
      );
      assert.equal(r.status, 200);
      return new URL(
        sent.at(-1).text.match(/https:\/\/\S+/)[0],
      ).searchParams.get('reset');
    };
    const unknown = await authPost(
      request('?forgot', { email: 'absent@example.invalid' }),
    );
    assert.equal(unknown.status, 200);
    assert.equal(sent.length, 0);
    const token = await send();
    const known = await authPost(
      request('?forgot', { email: 'absent@example.invalid' }),
    );
    assert.equal(await known.text(), await unknown.text());
    assert.notEqual(
      sqlite().prepare('SELECT token_hash FROM password_resets').get()
        .token_hash,
      token,
    );
    assert.equal(sent[0].to[0], 'player@example.invalid');
    assert.equal(
      (
        await authGet(
          new Request('https://game.example/api/auth?reset=' + token),
        )
      ).headers.get('referrer-policy'),
      'no-referrer',
    );
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM password_resets').get().n,
      1,
    );
    const reset = (
      value = token,
      password = 'recovered-password',
      confirm = password,
      origin = 'https://game.example',
    ) =>
      authPost(
        request(
          '?reset',
          { token: value, newPassword: password, confirmPassword: confirm },
          origin,
        ),
      );
    assert.equal(
      (await reset(token, undefined, undefined, 'https://evil.example')).status,
      403,
    );
    assert.equal((await reset(token, 'short')).status, 400);
    assert.equal((await reset('f'.repeat(64))).status, 400);
    sqlite()
      .prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)')
      .run('player@example.invalid', 5, Date.now() + 60000);
    const results = await Promise.all([reset(), reset()]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [303, 400],
    );
    assert.equal(await railwayUser(session), null);
    assert.equal(
      sqlite()
        .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE email=?')
        .get('player@example.invalid').n,
      0,
    );
    assert.equal((await reset()).status, 400);
    assert.equal(
      (
        await authPost(
          request('', {
            email: 'player@example.invalid',
            password: 'original-password',
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await authPost(
          request('', {
            email: 'player@example.invalid',
            password: 'recovered-password',
          }),
        )
      ).status,
      303,
    );
    sqlite().prepare('DELETE FROM recovery_attempts').run();
    const expired = await send();
    sqlite().prepare('UPDATE password_resets SET expires=0').run();
    assert.equal((await reset(expired)).status, 400);
    const superseded = await send();
    const newest = await send();
    assert.equal((await reset(superseded)).status, 400);
    const count = sent.length;
    await authPost(request('?forgot', { email: 'player@example.invalid' }));
    assert.equal(sent.length, count);
    sqlite()
      .prepare("UPDATE accounts SET password_hash='changed' WHERE id='recover'")
      .run();
    assert.equal((await reset(newest)).status, 400);
    sqlite().prepare('DELETE FROM recovery_attempts').run();
    mailFails = true;
    await send();
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM password_resets').get().n,
      0,
    );
    assert.equal(
      (
        await authPost(
          request(
            '?forgot',
            { email: 'player@example.invalid' },
            'https://evil.example',
          ),
        )
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite().close();
    rmSync(folder, { recursive: true, force: true });
  }
});
