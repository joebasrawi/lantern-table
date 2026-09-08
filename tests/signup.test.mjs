import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const folder = mkdtempSync(join(tmpdir(), 'lantern-signup-'));
process.env.LANTERN_DATA_DIR = folder;
process.env.LANTERN_ORIGIN = 'https://game.example';
process.env.LANTERN_ACCOUNTS = '[]';
const { authPost, authGet } = await import('../.test-build/railway/auth.js');
const { sqlite } = await import('../.test-build/railway/storage.js');
const request = (query, body, origin = 'https://game.example') =>
  new Request('https://game.example/api/auth' + query, {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams(body),
  });
const sent = [];
let failure = false;
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails');
  sent.push(JSON.parse(options.body));
  return new Response('{}', { status: failure ? 500 : 200 });
};
await test('Registration requires mailbox proof, creates one account, preserves existing identities and grants no campaign membership', async () => {
  try {
    delete process.env.LANTERN_SIGNUP_ENABLED;
    assert.equal(
      (await authGet(new Request('https://game.example/api/auth?signup')))
        .status,
      503,
    );
    assert.equal(
      (await authPost(request('?signup', { email: 'new@example.invalid' })))
        .status,
      503,
    );
    process.env.LANTERN_SIGNUP_ENABLED = 'true';
    delete process.env.RESEND_API_KEY;
    assert.equal(
      (await authGet(new Request('https://game.example/api/auth?signup')))
        .status,
      503,
    );
    process.env.RESEND_API_KEY = 'test-mail-key';
    process.env.LANTERN_MAIL_FROM = 'Lantern <game@example.invalid>';
    const send = async (email) => {
      const response = await authPost(request('?signup', { email }));
      assert.equal(response.status, 200);
      return response;
    };
    const first = await send('NEW@example.invalid');
    const token = new URL(
      sent.at(-1).text.match(/https:\/\/\S+/)[0],
    ).searchParams.get('verify');
    assert.equal(sent[0].to[0], 'new@example.invalid');
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM accounts').get().n,
      0,
    );
    assert.notEqual(
      sqlite().prepare('SELECT token_hash FROM registrations').get().token_hash,
      token,
    );
    assert.equal(
      (
        await authGet(
          new Request('https://game.example/api/auth?verify=' + token),
        )
      ).status,
      200,
    );
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM registrations').get().n,
      1,
    );
    const verify = (
      value = token,
      password = 'new-player-password',
      name = 'New player',
    ) =>
      authPost(
        request('?verify', {
          token: value,
          password,
          confirmPassword: password,
          name,
        }),
      );
    assert.equal((await verify('f'.repeat(64))).status, 400);
    assert.equal((await verify(token, 'short')).status, 400);
    assert.equal((await verify(token, undefined, ' ')).status, 400);
    assert.equal(
      (
        await authPost(
          request(
            '?verify',
            {
              token,
              password: 'new-player-password',
              confirmPassword: 'new-player-password',
              name: 'New',
            },
            'https://evil.example',
          ),
        )
      ).status,
      403,
    );
    const results = await Promise.all([verify(), verify()]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [200, 400],
    );
    const account = sqlite().prepare('SELECT * FROM accounts').get();
    assert.equal(account.email, 'new@example.invalid');
    assert.equal(account.name, 'New player');
    assert.notEqual(account.password_hash, 'new-player-password');
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM accounts').get().n,
      1,
    );
    assert.equal(
      sqlite().prepare('SELECT COUNT(*) AS n FROM members').get().n,
      0,
    );
    assert.equal((await verify()).status, 400);
    assert.equal(
      (
        await authPost(
          request('', {
            email: 'new@example.invalid',
            password: 'new-player-password',
          }),
        )
      ).status,
      303,
    );
    const count = sent.length,
      existing = await send('new@example.invalid');
    assert.equal(sent.length, count);
    assert.equal(await first.text(), await existing.text());
    assert.equal(
      sqlite().prepare('SELECT id FROM accounts').get().id,
      account.id,
    );
    await send('expired@example.invalid');
    const expired = new URL(
      sent.at(-1).text.match(/https:\/\/\S+/)[0],
    ).searchParams.get('verify');
    sqlite().prepare('UPDATE registrations SET expires=0').run();
    assert.equal((await verify(expired)).status, 400);
    await send('replace@example.invalid');
    const old = new URL(
      sent.at(-1).text.match(/https:\/\/\S+/)[0],
    ).searchParams.get('verify');
    await send('replace@example.invalid');
    assert.equal((await verify(old)).status, 400);
    await send('replace@example.invalid');
    const before = sent.length;
    await send('replace@example.invalid');
    assert.equal(sent.length, before);
    failure = true;
    await send('failed@example.invalid');
    assert.equal(
      sqlite()
        .prepare('SELECT email FROM registrations WHERE email=?')
        .get('failed@example.invalid'),
      undefined,
    );
    process.env.LANTERN_SIGNUP_ENABLED = 'false';
    assert.equal((await verify()).status, 503);
  } finally {
    globalThis.fetch = original;
    sqlite().close();
    rmSync(folder, { recursive: true, force: true });
  }
});
