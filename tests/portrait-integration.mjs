import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const headers = (user) => (user ? { Cookie: `lantern_local=${user}` } : {});
async function api(user, body) {
  const response = await fetch(`${base}/api/game`, {
    method: 'POST',
    headers: { ...headers(user), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const a = (
  await api('local_1', {
    op: 'create',
    title: 'Portrait integration',
    setting: 'Fantasy',
    premise: 'Explore the harbor',
    location: 'Harbor',
    settings: {
      dm: 'human',
      rules: 'quickplay',
      pace: 'wait',
      deadlineHours: 24,
      absence: 'wait',
      decision: 'unanimous',
      customization: 'reskin',
      tone: 'Adventurous',
      boundaries: '',
    },
  })
).data;
assert.ok(a.id);
await api('local_2', { op: 'join', invite: a.invite });
async function view(user) {
  return (
    await fetch(`${base}/api/game?id=${a.id}`, { headers: headers(user) })
  ).json();
}
async function post(user, body) {
  const c = await view(user);
  return api(user, {
    id: a.id,
    version: c.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
}
for (const user of ['local_1', 'local_2'])
  assert.equal(
    (
      await post(user, {
        op: 'character',
        name: user,
        ancestry: 'Human',
        role: 'Wayfinder',
        concept: 'Scout',
        portrait: 0,
      })
    ).status,
    200,
  );
const before = (await view('local_1')).state.characters[0];
const image = readFileSync('public/art/portraits.webp');
async function upload(user, type = 'image/webp', body = image) {
  return fetch(`${base}/api/portrait?campaign=${a.id}`, {
    method: 'POST',
    headers: { ...headers(user), 'Content-Type': type },
    body,
  });
}
assert.equal((await upload(null)).status, 401);
assert.equal((await upload('local_3')).status, 404);
assert.equal((await upload('local_1', 'image/png')).status, 400);
assert.equal(
  (await upload('local_1', 'image/webp', Buffer.alloc(512 * 1024 + 1))).status,
  413,
);
const uploaded = await upload('local_1');
const result = await uploaded.json();
assert.equal(uploaded.status, 200, JSON.stringify(result));
const c = result.state.characters[0];
assert.ok(c.portraitUrl);
for (const key of Object.keys(before))
  if (!['portraitAsset', 'portraitUrl'].includes(key))
    assert.deepEqual(c[key], before[key], key);
const read = async (user) =>
  fetch(base + c.portraitUrl, { headers: headers(user) });
assert.equal((await read('local_2')).status, 200);
assert.equal((await read('local_3')).status, 404);
assert.equal((await read(null)).status, 401);
assert.equal(
  (await post('local_2', { op: 'portrait', asset: c.portraitAsset })).status,
  404,
);
assert.equal((await post('local_1', { op: 'clearPortrait' })).status, 200);
assert.equal((await read('local_1')).status, 404);
console.log(
  'Portrait ownership, private access, validation and unchanged stats passed.',
);
