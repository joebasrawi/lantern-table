import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { gameReturnPath, gameSignInHref } from '../.test-build/game-return.js';
const dir = mkdtempSync(join(tmpdir(), 'lantern-return-'));
process.env.LANTERN_DATA_DIR = dir;
process.env.LANTERN_ORIGIN = 'https://game.example';
const salt = 'a'.repeat(32),
  password = 'test-return-password';
process.env.LANTERN_ACCOUNTS = JSON.stringify([
  {
    id: 'one',
    name: 'One',
    email: 'one@example.invalid',
    salt,
    passwordHash: scryptSync(password, salt, 64).toString('hex'),
  },
]);
const { authGet, authPost, railwayUser } =
  await import('../.test-build/railway/auth.js');
const { sqlite } = await import('../.test-build/railway/storage.js');
await test('only campaign and invite destinations are retained; extra tracking parameters are discarded in the sign-in link', () => {
  for (const kind of ['campaign', 'invite']) {
    const path = '/?' + kind + '=abc-123';
    assert.equal(gameReturnPath(path), path);
    assert.equal(
      new URL(
        gameSignInHref(path + '&utm_source=friend'),
        'https://game.example',
      ).searchParams.get('returnTo'),
      path,
    );
  }
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/api/auth?delete',
    '/?campaign=abc&invite=other',
    '/?campaign=%22%3E',
    '/?campaign=a#fragment',
    '/?invite=a\r\nLocation:https://evil.example',
    '/?invite=' + 'a'.repeat(101),
    null,
    {},
    '/?campaign=',
    '/?invite=abc\n',
    '/?campaign=abc\r',
    '/?campaign=abc\u2028',
  ])
    assert.equal(gameReturnPath(value), '/');
  assert.equal(gameSignInHref('/'), '/api/auth');
  assert.equal(gameSignInHref('/?invite=one&invite=two'), '/api/auth');
  assert.equal(gameSignInHref('/?invite=%22%3E%3Cscript%3E'), '/api/auth');
});
const post = (returnTo, pass = password) =>
  authPost(
    new Request('https://game.example/api/auth', {
      method: 'POST',
      headers: { origin: 'https://game.example' },
      body: new URLSearchParams({
        email: 'one@example.invalid',
        password: pass,
        returnTo,
      }),
    }),
  );
await test('auth page and a wrong-password retry retain an allowed destination without joining or changing campaigns', async () => {
  const path = '/?invite=friend-123';
  const page = await authGet(
    new Request('https://game.example' + gameSignInHref(path)),
  );
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(
    await page.text(),
    /name="returnTo" value="\/\?invite=friend-123"/,
  );
  const retry = await post(path, 'incorrect');
  assert.equal(retry.status, 401);
  assert.match(
    await retry.text(),
    /name="returnTo" value="\/\?invite=friend-123"/,
  );
  assert.equal(
    sqlite().prepare('SELECT COUNT(*) AS n FROM campaigns').get().n,
    0,
  );
  assert.equal(
    sqlite().prepare('SELECT COUNT(*) AS n FROM members').get().n,
    0,
  );
});
await test('successful sign-in returns to the exact allowed destination and invalid destinations fall back to the lobby', async () => {
  for (const path of [
    '/?campaign=game-123',
    '/?invite=friend-123',
    'https://evil.example',
    '/api/auth?delete',
  ]) {
    const response = await post(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), gameReturnPath(path));
    const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal((await railwayUser(cookie.split('=')[1])).id, 'one');
    await authGet(
      new Request('https://game.example/api/auth?logout', {
        headers: { cookie },
      }),
    );
  }
  const attack = await authGet(
    new Request(
      'https://game.example/api/auth?returnTo=' +
        encodeURIComponent('/?invite="/><script>evil</script>'),
    ),
  );
  const html = await attack.text();
  assert.doesNotMatch(html, /evil|<script>/);
  assert.match(html, /name="returnTo" value="\/"/);
});
sqlite().close();
rmSync(dir, { recursive: true, force: true });
