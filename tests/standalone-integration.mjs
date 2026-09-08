import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://localhost:3001';
const forged = {
  'oai-authenticated-user-id': 'owner',
  'oai-authenticated-user-email': 'owner@example.com',
  Cookie: 'lantern_local=local_1',
};
for (const headers of [
  {},
  forged,
  { ...forged, 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
]) {
  const response = await fetch(`${base}/api/game`, { headers });
  assert.equal(response.status, 401);
  const session = await (
    await fetch(`${base}/api/game?op=session`, { headers })
  ).json();
  assert.equal(session.user, null);
  assert.equal(session.local, false);
  const portrait = await fetch(
    `${base}/api/portrait?campaign=test&asset=test`,
    { headers },
  );
  assert.equal(portrait.status, 401);
}
const login = await fetch(`${base}/api/game`, {
  method: 'POST',
  headers: { ...forged, 'Content-Type': 'application/json' },
  body: JSON.stringify({ op: 'localLogin', id: 'local_1' }),
});
assert.equal(login.status, 401);
assert.equal(login.headers.get('set-cookie'), null);
console.log(
  'PASS: standalone build rejects Sites header spoofing, local test sessions and invalid Access tokens.',
);
