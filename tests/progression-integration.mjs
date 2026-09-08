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
    title: 'Progression integration',
    setting: 'Fantasy',
    premise: 'Training expedition',
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
  assert.equal(
    (
      await post(user, {
        op: 'character',
        name: user,
        ancestry: 'Human',
        role: 'Vanguard',
        concept: 'Explorer',
        portrait: 0,
      })
    ).status,
    200,
  );
assert.equal(
  (
    await post('local_1', {
      op: 'levelUp',
      growth: 'vitality',
      xp: 10000,
      level: 9,
    })
  ).status,
  400,
);
let attempts = 0;
while ((await get('local_1')).state.characters[0].xp < 100) {
  assert.ok(++attempts <= 12, 'Combat progression exceeded expected attempts');
  assert.equal((await post('local_1', { op: 'dm', kind: 'rest' })).status, 200);
  assert.equal(
    (
      await post('local_1', {
        op: 'dm',
        kind: 'encounter',
        name: 'Training guardian',
        count: 1,
      })
    ).status,
    200,
  );
  let turns = 0,
    c = await get('local_1');
  while (c.state.encounter) {
    assert.ok(++turns < 100, 'Encounter did not resolve');
    const e = c.state.encounter,
      actor = c.state.characters.find((x) => x.id === e.order[e.index]);
    const r = await post(actor.userId, {
      op: 'combat',
      action: actor.energy > 0 ? 'power' : 'attack',
      target: e.enemies.find((x) => x.hp > 0).id,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    c = r.data;
  }
}
assert.equal((await post('local_1', { op: 'dm', kind: 'rest' })).status, 200);
const before = await get('local_1');
const payload = {
  op: 'levelUp',
  growth: 'vitality',
  id: a.id,
  version: before.version,
  requestId: crypto.randomUUID(),
  userId: 'local_2',
  level: 99,
  maxHp: 9999,
};
const advanced = await api('local_1', payload);
assert.equal(advanced.status, 200, JSON.stringify(advanced.data));
const again = await api('local_1', payload);
assert.equal(again.status, 200);
const c = (await get('local_2')).state.characters;
assert.equal(c[0].level, 2);
assert.equal(c[0].maxHp, before.state.characters[0].maxHp + 4);
assert.equal(c[0].hp, before.state.characters[0].hp);
assert.equal(c[1].level, 1);
assert.equal(c[0].xp, before.state.characters[0].xp);
assert.equal(
  (await post('local_1', { op: 'levelUp', growth: 'vitality' })).status,
  400,
);
assert.equal(
  (await post('local_2', { op: 'levelUp', growth: 'focus' })).status,
  200,
);
const saved = (await get('local_1')).state.characters[1];
assert.equal(saved.level, 2);
assert.equal(saved.maxEnergy, 4);
assert.equal(saved.energy, 3);
console.log(
  'PASS: earned combat XP, advancement, ownership, duplicate requests, forged fields and saved reload.',
);
