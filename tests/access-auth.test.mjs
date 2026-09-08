import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { accessConfig, verifyAccessToken } from '../.test-build/access-auth.js';
const config = accessConfig(
  'https://lantern-tests.cloudflareaccess.com',
  'campaign-app',
);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'test';
jwk.alg = 'RS256';
const keys = createLocalJWKSet({ keys: [jwk] });
async function token(claims = {}, key = privateKey) {
  return new SignJWT({
    sub: 'player-one',
    email: 'mara@example.com',
    iss: config.issuer,
    aud: config.audience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .sign(key);
}
await test('Access identity comes from verified claims and remains stable across email changes', async () => {
  const user = await verifyAccessToken(await token(), config, keys);
  assert.equal(user.name, 'mara');
  assert.equal(user.id, `access:${config.issuer}:player-one`);
  const renamed = await verifyAccessToken(
    await token({ email: 'new@example.com' }),
    config,
    keys,
  );
  assert.equal(renamed.id, user.id);
});
await test('Access rejects expired, missing, wrong-audience, wrong-issuer and forged identities', async () => {
  for (const claims of [
    { exp: 1 },
    { exp: undefined },
    { sub: '' },
    { email: undefined },
    { aud: 'another-app' },
    { iss: 'https://other.cloudflareaccess.com' },
    { nbf: Math.floor(Date.now() / 1000) + 600 },
  ])
    await assert.rejects(verifyAccessToken(await token(claims), config, keys));
  const other = await generateKeyPair('RS256');
  await assert.rejects(
    verifyAccessToken(await token({}, other.privateKey), config, keys),
  );
  await assert.rejects(verifyAccessToken('not-a-jwt', config, keys));
});
await test('Access keys can only be fetched from an explicitly configured Cloudflare team', () => {
  for (const issuer of [
    'http://team.cloudflareaccess.com',
    'https://attacker.example',
    'https://team.cloudflareaccess.com/extra',
    'https://team.cloudflareaccess.com@attacker.example',
  ])
    assert.throws(() => accessConfig(issuer, 'aud'));
  assert.throws(() => accessConfig(config.issuer, ''));
});
