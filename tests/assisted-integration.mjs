import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
async function api(user, body, query = '') {
  const r = await fetch(`${base}/api/game${query}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: `lantern_local=${user}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const settings = {
  dm: 'assisted',
  rules: 'quickplay',
  pace: 'wait',
  deadlineHours: 24,
  absence: 'wait',
  decision: 'unanimous',
  customization: 'reskin',
  tone: 'Adventurous',
  boundaries: '',
};
const a = (
  await api('local_1', {
    op: 'create',
    title: 'Assisted DM verification',
    setting: 'Fantasy coast',
    premise: 'Investigate a letter',
    location: 'Harbor',
    settings,
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
  ancestry: 'Human',
  role: 'Wayfinder',
  concept: 'A harbor scout',
  portrait: 0,
});
await post('local_2', {
  op: 'action',
  text: 'I look at the crest on the sealed letter.',
  roll: false,
});
const before = await get('local_1'),
  pendingId = before.state.pending[0].id;
assert.equal(
  (await api('local_2', { op: 'draft', id: a.id, pendingId })).status,
  403,
);
assert.equal(
  (await api('local_3', { op: 'draft', id: a.id, pendingId })).status,
  404,
);
const response = await api('local_1', { op: 'draft', id: a.id, pendingId });
assert.equal(response.status, 200, JSON.stringify(response.data));
assert.equal(response.data.pendingId, pendingId);
assert.ok(response.data.narrative.length > 20);
const after = await get('local_1');
assert.equal(after.version, before.version);
assert.deepEqual(after.state, before.state);
const edited = `The human DM has reviewed this: ${response.data.narrative}`;
assert.equal(
  (
    await post('local_1', {
      op: 'dm',
      kind: 'narrate',
      text: edited,
      pendingId,
    })
  ).status,
  200,
);
const published = await get('local_2');
assert.equal(published.state.pending.length, 0);
assert.equal(published.state.events.at(-1).text, edited);
assert.equal(
  (
    await post('local_1', {
      op: 'dm',
      kind: 'narrate',
      text: 'A stale second reply.',
      pendingId,
    })
  ).status,
  409,
);
assert.equal((await get('local_1')).version, published.version);
await post('local_2', {
  op: 'decision',
  question: 'Rest here?',
  options: ['Rest', 'Keep going'],
});
const decision = await get('local_1');
assert.equal((await post('local_1', { op: 'dm', kind: 'rest' })).status, 400);
assert.deepEqual((await get('local_1')).state, decision.state);
await post('local_1', { op: 'dm', kind: 'cancelDecision' });
await post('local_1', {
  op: 'settings',
  settings: { ...settings, dm: 'human' },
});
await post('local_2', {
  op: 'action',
  text: 'I inspect the seal.',
  roll: false,
});
assert.equal(
  (
    await api('local_1', {
      op: 'draft',
      id: a.id,
      pendingId: (await get('local_1')).state.pending[0].id,
    })
  ).status,
  400,
);
console.log(
  'PASS: live assisted draft stays private and read-only; reviewed publication resolves once; pending decisions prevent resting.',
);
