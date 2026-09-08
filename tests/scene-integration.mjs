import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const headers = (user) => (user ? { Cookie: `lantern_local=${user}` } : {});
async function api(user, body, query = '') {
  const r = await fetch(`${base}/api/game${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...headers(user), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const a = (
  await api('local_1', {
    op: 'create',
    title: 'Scene integration',
    setting: 'A future city',
    premise: 'Explore',
    location: 'Station',
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
const get = async (user) => (await api(user, null, `?id=${a.id}`)).data;
async function post(user, body) {
  const c = await get(user);
  return api(user, {
    id: a.id,
    version: c.version,
    requestId: crypto.randomUUID(),
    ...body,
  });
}
await post('local_2', {
  op: 'character',
  name: 'Elara',
  ancestry: 'Android',
  role: 'Wayfinder',
  concept: 'Explorer',
  portrait: 0,
});
const image = readFileSync('public/art/harbor.webp');
const upload = async (user, type = 'image/webp', body = image) =>
  fetch(`${base}/api/scene?campaign=${a.id}`, {
    method: 'POST',
    headers: { ...headers(user), 'Content-Type': type },
    body,
  });
assert.equal((await upload(null)).status, 401);
assert.equal((await upload('local_3')).status, 404);
assert.equal((await upload('local_2')).status, 403);
assert.equal((await upload('local_1', 'image/png')).status, 400);
assert.equal(
  (await upload('local_1', 'image/webp', Buffer.alloc(512 * 1024 + 1))).status,
  413,
);
const before = await get('local_1'),
  uploaded = await upload('local_1'),
  c = await uploaded.json();
assert.equal(uploaded.status, 200, JSON.stringify(c));
assert.ok(c.state.sceneUrl);
const unchanged = structuredClone(c.state);
delete unchanged.sceneUrl;
delete unchanged.sceneAsset;
assert.deepEqual(unchanged, before.state);
const read = async (user) =>
  fetch(base + c.state.sceneUrl, { headers: headers(user) });
const member = await read('local_2');
assert.equal(member.status, 200);
assert.equal(member.headers.get('content-type'), 'image/webp');
assert.deepEqual(Buffer.from(await member.arrayBuffer()), image);
assert.equal((await read(null)).status, 401);
assert.equal((await read('local_3')).status, 404);
assert.equal(
  (await post('local_2', { op: 'scene', asset: c.state.sceneAsset })).status,
  403,
);
assert.equal((await post('local_2', { op: 'clearScene' })).status, 403);
assert.equal(
  (await post('local_2', { op: 'portrait', asset: c.state.sceneAsset })).status,
  404,
);
assert.equal((await get('local_2')).state.sceneUrl, c.state.sceneUrl);
assert.equal((await post('local_1', { op: 'clearScene' })).status, 200);
assert.equal((await read('local_2')).status, 404);
console.log(
  'PASS: host-only scene changes, member-only images, unchanged gameplay state, reload and removal.',
);
