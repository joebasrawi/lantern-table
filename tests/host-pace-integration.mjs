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
const a = (
  await api('local_1', {
    op: 'create',
    title: 'Host pace integration',
    setting: 'Fantasy',
    premise: 'Explore',
    location: 'Harbor',
    settings: {
      dm: 'human',
      rules: 'quickplay',
      pace: 'host',
      deadlineHours: 24,
      absence: 'defend',
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
for (const user of ['local_1', 'local_2'])
  await post(user, {
    op: 'character',
    name: user,
    ancestry: 'Human',
    role: 'Vanguard',
    concept: 'Explorer',
    portrait: 0,
    absenceConsent: true,
  });
await post('local_1', {
  op: 'dm',
  kind: 'encounter',
  name: 'Guardian',
  count: 1,
});
assert.equal((await post('local_1', { op: 'hostDefend' })).status, 400);
assert.equal((await post('local_2', { op: 'hostDefend' })).status, 403);
await post('local_1', {
  op: 'notes',
  notes: '',
  dmNotes: '',
  absenceConsent: true,
  hostDefenseConsent: true,
});
assert.equal(
  (await get('local_2')).state.characters[0].hostDefenseConsent,
  true,
);
const c = await get('local_1'),
  payload = {
    id: a.id,
    version: c.version,
    requestId: crypto.randomUUID(),
    op: 'hostDefend',
  };
assert.equal((await api('local_1', payload)).status, 200);
assert.equal((await api('local_1', payload)).status, 200);
const saved = await get('local_2');
assert.equal(saved.state.encounter.index, 1);
assert.equal((await post('local_1', { op: 'hostDefend' })).status, 400);
console.log(
  'PASS: separate host-defense consent, host-only execution, persisted preferences and duplicate protection.',
);
