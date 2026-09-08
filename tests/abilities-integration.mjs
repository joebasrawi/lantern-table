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
    title: 'Abilities integration',
    setting: 'Future',
    premise: 'Explore',
    location: 'Station',
    settings: {
      dm: 'human',
      rules: 'quickplay',
      pace: 'wait',
      deadlineHours: 24,
      absence: 'wait',
      decision: 'unanimous',
      customization: 'custom',
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
        ancestry: 'Android',
        role: 'Vanguard',
        concept: 'Explorer',
        portrait: 0,
      })
    ).status,
    200,
  );
const proposed = await post('local_2', {
  op: 'proposeAbility',
  name: 'Plasma arc',
  description: 'A crackle of blue light.',
  effect: 'strike',
  approved: true,
  damage: 999,
  energy: 0,
});
assert.equal(proposed.status, 200);
const c = proposed.data.state.characters[1],
  ability = c.abilities[0];
assert.equal(ability.approved, false);
assert.equal(
  (
    await post('local_2', {
      op: 'reviewAbility',
      characterId: c.id,
      abilityId: ability.id,
      approve: true,
    })
  ).status,
  403,
);
assert.equal(
  (await post('local_1', { op: 'removeAbility', abilityId: ability.id }))
    .status,
  400,
);
assert.equal(
  (
    await post('local_1', {
      op: 'reviewAbility',
      characterId: c.id,
      abilityId: ability.id,
      approve: true,
    })
  ).status,
  200,
);
assert.equal(
  (await get('local_2')).state.characters[1].abilities[0].approved,
  true,
);
await post('local_1', {
  op: 'dm',
  kind: 'encounter',
  name: 'Guardian',
  count: 1,
});
assert.equal(
  (await post('local_2', { op: 'removeAbility', abilityId: ability.id }))
    .status,
  400,
);
await post('local_1', { op: 'combat', action: 'defend' });
const before = await get('local_2'),
  payload = {
    id: a.id,
    version: before.version,
    requestId: crypto.randomUUID(),
    op: 'combat',
    action: 'ability',
    abilityId: ability.id,
    target: before.state.encounter.enemies[0].id,
  };
assert.equal((await api('local_2', payload)).status, 200);
assert.equal((await api('local_2', payload)).status, 200);
const saved = await get('local_1');
assert.equal(saved.state.characters[1].energy, 2);
assert.ok(saved.state.events.some((e) => e.text.startsWith('Plasma arc:')));
console.log(
  'PASS: proposal review, owner permissions, combat use, duplicate protection and saved custom ability.',
);
